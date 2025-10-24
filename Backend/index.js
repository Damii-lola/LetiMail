import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

dotenv.config();
const { Pool } = pkg;
const app = express();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS configuration
const allowedOrigins = [
  'https://damii-lola.github.io',
  'https://damii-lola.github.io/LetiMail',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://letimail.vercel.app',
  'https://letimail.netlify.app'
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Logging
app.use(morgan('dev'));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Database initialization
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        plan VARCHAR(50) DEFAULT 'free',
        emails_used INTEGER DEFAULT 0,
        emails_left INTEGER DEFAULT 5,
        daily_emails_used INTEGER DEFAULT 0,
        last_reset_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        email_verified BOOLEAN DEFAULT false,
        verification_token VARCHAR(100),
        verification_token_expires TIMESTAMP,
        reset_token VARCHAR(100),
        reset_token_expires TIMESTAMP,
        preferences JSONB DEFAULT '{}'::jsonb,
        tone_profile JSONB DEFAULT '{}'::jsonb
      )
    `);

    // OTP table
    await client.query(`
      CREATE TABLE IF NOT EXISTS otp_verifications (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        otp VARCHAR(6) NOT NULL,
        verified BOOLEAN DEFAULT false,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        attempts INTEGER DEFAULT 0,
        ip_address VARCHAR(50)
      )
    `);

    // Email history
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        business_context TEXT,
        email_context TEXT,
        tone VARCHAR(50),
        generated_email TEXT,
        edited_email TEXT,
        sent_to VARCHAR(255),
        sent_at TIMESTAMP,
        subject VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);

    // API keys
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        key VARCHAR(100) NOT NULL,
        name VARCHAR(100),
        permissions JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used TIMESTAMP,
        active BOOLEAN DEFAULT true
      )
    `);

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_history_user ON email_history(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_history_created ON email_history(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key)`);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Test database connection and initialize
async function testDatabaseConnection() {
  try {
    const client = await pool.connect();
    await initializeDatabase();
    client.release();
    console.log('✅ Database connected and initialized successfully');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
}

testDatabaseConnection();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN = '7d';

// Auth middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// API Key middleware
const authenticateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const result = await pool.query('SELECT * FROM api_keys WHERE key = $1 AND active = true', [apiKey]);

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    const apiKeyRecord = result.rows[0];

    // Update last used
    await pool.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [apiKeyRecord.id]);

    // Get user
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [apiKeyRecord.user_id]);

    if (userResult.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }

    req.user = userResult.rows[0];
    req.apiKey = apiKeyRecord;
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(403).json({ error: 'Invalid API key' });
  }
};

// OTP Functions
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function storeOTP(email, otp, ip) {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await pool.query(`
    INSERT INTO otp_verifications (email, otp, expires_at, ip_address)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email)
    DO UPDATE SET otp = $2, expires_at = $3, ip_address = $4, attempts = 0
  `, [email, otp, expiresAt, ip]);
}

async function verifyOTP(email, otp) {
  const result = await pool.query(`
    SELECT * FROM otp_verifications
    WHERE email = $1 AND otp = $2 AND expires_at > NOW()
  `, [email, otp]);

  if (result.rows.length === 0) {
    // Increment attempt count
    await pool.query(`
      UPDATE otp_verifications
      SET attempts = attempts + 1
      WHERE email = $1
    `, [email]);

    return false;
  }

  return true;
}

// Email Functions
function cleanAIResponse(content) {
  if (!content) return content;

  let cleaned = content
    .replace(/^(Here is|Here's) your (.+? email|refined email|email)[\s\S]*?(?=Subject:)/i, '')
    .replace(/\n*Note:[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*Please note:[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*I have (preserved|applied|maintained)[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*This email[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*Best regards,[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*Sincerely,[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*Regards,[\s\S]*?(?=\n\n|$)/gi, '')
    .trim();

  // Ensure the email starts with "Subject:"
  if (!cleaned.startsWith('Subject:')) {
    const subjectIndex = cleaned.indexOf('Subject:');
    if (subjectIndex > 0) {
      cleaned = cleaned.substring(subjectIndex);
    } else {
      cleaned = "Subject: Professional Communication\n\n" + cleaned;
    }
  }

  return cleaned || content;
}

function formatEmailContent(content, senderName) {
  let emailBody = content.replace(/^Subject:\s*.+\n?/i, '').trim();
  let htmlContent = convertTextToSimpleHTML(emailBody);
  const emailSubject = extractSubject(content) || 'Professional Communication';

  const htmlEmail = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${emailSubject}</title>
      <style>
        body {
          font-family: 'Inter', Arial, sans-serif;
          line-height: 1.7;
          color: #2D3748;
          background: #f7fafc;
          margin: 0;
          padding: 20px;
        }
        .email-wrapper {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        .email-body {
          padding: 40px;
        }
        .email-content {
          font-size: 16px;
          line-height: 1.8;
          color: #4A5568;
        }
        .email-content p {
          margin-bottom: 16px;
        }
        .signature {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #E2E8F0;
        }
        .sender-name {
          font-weight: 600;
          color: #2D3748;
          margin-bottom: 4px;
        }
        .footer {
          margin-top: 30px;
          font-size: 12px;
          color: #718096;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="email-body">
          <div class="email-content">
            ${htmlContent}
          </div>
          <div class="signature">
            <div class="sender-name">${senderName || 'Professional Contact'}</div>
            <div style="color: #718096; font-size: 14px;">Sent via LetiMail</div>
          </div>
          <div class="footer">
            <p>This email was generated using LetiMail - Your Voice, AI Powered</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return htmlEmail;
}

function convertTextToSimpleHTML(text) {
  if (!text) return '<p>No content available.</p>';

  let html = '';
  const lines = text.split('\n');
  let currentParagraph = '';
  let inList = false;

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      if (currentParagraph) {
        html += inList ? `<li>${currentParagraph}</li>` : `<p>${currentParagraph}</p>`;
        currentParagraph = '';
        inList = false;
      }
      return;
    }

    const isBulletPoint = trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || /^\d+\./.test(trimmedLine);

    if (isBulletPoint) {
      if (currentParagraph && !inList) {
        html += `<p>${currentParagraph}</p>`;
        currentParagraph = '';
      }

      if (!inList) {
        html += '<ul>';
        inList = true;
      }

      const cleanLine = trimmedLine.replace(/^[•\-\d+\.]\s*/, '');
      html += `<li>${cleanLine}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }

      if (currentParagraph) {
        currentParagraph += '<br>' + trimmedLine;
      } else {
        currentParagraph = trimmedLine;
      }
    }
  });

  if (currentParagraph) {
    html += inList ? `<li>${currentParagraph}</li></ul>` : `<p>${currentParagraph}</p>`;
  } else if (inList) {
    html += '</ul>';
  }

  return html;
}

function extractSubject(content) {
  const subjectMatch = content.match(/Subject:\s*(.*?)(?:\n|$)/i);
  return subjectMatch ? subjectMatch[1].trim() : null;
}

// API Endpoints
// Health check
app.get("/api/health", async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    res.json({
      status: "ok",
      database: dbCheck.rowCount === 1 ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      error: error.message
    });
  }
});

// OTP Endpoints - COMPLETELY REWRITTEN
app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user already exists
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate and store OTP
    const otp = generateOTP();
    await storeOTP(email, otp, ip);

    // FOR DEVELOPMENT: Log and return OTP
    console.log(`🔑 OTP for ${email}: ${otp}`);

    // UNCOMMENT FOR PRODUCTION:
    const emailContent = `
      Your LetiMail verification code is: ${otp}
      This code will expire in 15 minutes.
      If you didn't request this, please ignore this email.
    `;

    const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }], subject: "Your Verification Code" }],
        from: { email: process.env.FROM_EMAIL, name: "LetiMail" },
        content: [{ type: "text/plain", value: emailContent }]
      })
    });

    if (!sendGridResponse.ok) {
      console.error('SendGrid error:', await sendGridResponse.text());
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }

    res.json({
      success: true,
      message: 'OTP sent successfully. Check console for the code.',
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined // Only return OTP in dev
    });
  } catch (error) {
    console.error('OTP send error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    // FOR DEVELOPMENT: Skip verification
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔑 Verifying OTP for ${email}: ${otp} (development mode)`);
      return res.json({ success: true, message: 'OTP verified successfully' });
    }

    // FOR PRODUCTION: Actual verification
    const isValid = await verifyOTP(email, otp);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// Auth Endpoints
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, otp } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // FOR DEVELOPMENT: Skip OTP verification
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔑 Bypassing OTP verification for ${email} in development`);
    } else {
      const isValid = await verifyOTP(email, otp);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO users (name, email, password, plan, emails_used, emails_left, ip_address, last_login)
      VALUES ($1, $2, $3, 'free', 0, 5, $4, NOW())
      RETURNING id, name, email, plan, emails_used, emails_left
    `, [name, email, hashedPassword, ip]);

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Create default tone profile
    await pool.query(`
      UPDATE users
      SET tone_profile = '{"style": "neutral", "formality": "medium", "examples": []}'
      WHERE id = $1
    `, [user.id]);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        emails_used: user.emails_used,
        emails_left: user.emails_left
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login and IP
    await pool.query('UPDATE users SET last_login = NOW(), ip_address = $1 WHERE id = $2', [ip, user.id]);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        emails_used: user.emails_used,
        emails_left: user.emails_left,
        daily_emails_used: user.daily_emails_used
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, plan, emails_used, emails_left, daily_emails_used,
             last_reset_date, created_at, last_login, preferences, tone_profile
      FROM users
      WHERE id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

app.delete("/api/auth/delete-account", authenticateToken, async (req, res) => {
  try {
    // First delete all related data
    await pool.query('DELETE FROM email_history WHERE user_id = $1', [req.user.id]);
    await pool.query('DELETE FROM api_keys WHERE user_id = $1', [req.user.id]);
    await pool.query('DELETE FROM otp_verifications WHERE email = $1', [req.user.email]);

    // Then delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Email Generation Endpoints
app.post("/api/generate", authenticateToken, async (req, res) => {
  const { business, context, tone, emailLength, stylePrompt } = req.body;

  if (!business || !context) {
    return res.status(400).json({ error: "Business description and context are required." });
  }

  try {
    const user = req.user;

    // Check email limits
    if (user.plan === 'free' && user.emails_used >= 10) {
      return res.status(403).json({
        error: "❌ You've used all 10 free emails! Upgrade to Premium for unlimited emails."
      });
    }

    // Build prompt with style matching
    const prompt = `
      Write this email to sound authentically human and natural.
      ${stylePrompt || ''}

      BUSINESS CONTEXT:
      - Business: ${business}
      - Purpose: ${context}
      - Tone: ${tone || 'professional'}
      - Length: ${emailLength || 'medium'}

      IMPORTANT INSTRUCTIONS:
      1. Make this email sound like a real human wrote it - natural, conversational, and authentic
      2. Match the tone specified above
      3. Keep the length appropriate for the specified length (short: 3-5 sentences, medium: 6-10 sentences, long: 11+ sentences)
      4. Return ONLY the email content starting with "Subject:"
      5. Do NOT include any explanations, notes, or disclaimers
      6. Make sure the subject line is clear and professional
      7. Format the email with proper paragraphs and line breaks
    `;

    console.log("📝 Generating email with prompt:", prompt);

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
      }),
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.text();
      console.error("Groq API error:", errorData);
      return res.status(500).json({ error: "Failed to generate email. Please try again." });
    }

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || "Error generating email.";

    email = cleanAIResponse(email);

    if (!email.startsWith("Subject:")) {
      email = "Subject: Professional Communication\n\n" + email;
    }

    // Save to history
    await pool.query(`
      INSERT INTO email_history
      (user_id, business_context, email_context, tone, generated_email, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [user.id, business, context, tone, email]);

    // Update email count for free users
    if (user.plan === 'free') {
      await pool.query(`
        UPDATE users
        SET emails_used = emails_used + 1,
            daily_emails_used = daily_emails_used + 1
        WHERE id = $1
      `, [user.id]);
    }

    res.json({
      success: true,
      email: email
    });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({
      error: "Error generating email. Please try again later.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post("/api/improve-email", authenticateToken, async (req, res) => {
  const { originalEmail, editedEmail } = req.body;

  if (!originalEmail || !editedEmail) {
    return res.status(400).json({ error: "Original and edited email are required" });
  }

  try {
    const prompt = `
      ANALYZE AND REFINE EDITED EMAIL:

      ORIGINAL AI-GENERATED EMAIL:
      ${originalEmail}

      USER'S EDITED VERSION:
      ${editedEmail}

      TASK:
      1. Compare the two versions and identify EXACTLY what the user changed
      2. ONLY modify the parts that the user edited - leave everything else exactly as the user wrote it
      3. For the edited parts, ensure they match:
         - The original formatting style (bullet points, paragraphs, spacing)
         - The original tone and language level
         - Professional consistency
         - Proper grammar and flow
      4. PRESERVE the user's intent and meaning completely
      5. Do NOT rewrite the entire email - only refine the specific edited sections
      6. Maintain the exact same structure and formatting as the user's edited version

      IMPORTANT:
      - Only make minimal changes to ensure the edited parts blend naturally
      - Keep the user's voice and choices intact
      - Return ONLY the final refined email without any explanations
    `;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.text();
      console.error("Groq API error:", errorData);
      return res.json({
        improvedEmail: editedEmail,
        success: false,
        error: "Failed to improve email. Using your edited version."
      });
    }

    const data = await groqResponse.json();
    let improvedEmail = data.choices?.[0]?.message?.content?.trim() || editedEmail;

    // Clean up any AI prefixes
    improvedEmail = improvedEmail
      .replace(/^(Here is|Here's) (the )?(refined|improved|final) (version of the )?email:\s*/i, '')
      .replace(/^(Based on your edits, here( is|'s))?/i, '')
      .replace(/^The refined email:/i, '')
      .trim();

    // Save to history
    await pool.query(`
      UPDATE email_history
      SET edited_email = $1, updated_at = NOW()
      WHERE user_id = $2 AND generated_email = $3
      ORDER BY created_at DESC
      LIMIT 1
    `, [improvedEmail, req.user.id, originalEmail]);

    res.json({
      success: true,
      improvedEmail: improvedEmail || editedEmail
    });
  } catch (error) {
    console.error("Email improvement error:", error);
    res.json({
      success: false,
      improvedEmail: editedEmail,
      error: process.env.NODE_ENV === 'development' ? error.message : "Failed to improve email"
    });
  }
});

app.post("/api/send-email", authenticateToken, async (req, res) => {
  const { to, subject, content, businessName, replyToEmail } = req.body;

  if (!to || !subject || !content) {
    return res.status(400).json({ error: "Recipient email, subject, and content are required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ error: "Invalid recipient email address" });
  }

  if (replyToEmail && !emailRegex.test(replyToEmail)) {
    return res.status(400).json({ error: "Invalid reply-to email address" });
  }

  try {
    const formattedContent = formatEmailContent(content, businessName || req.user.name);

    // FOR DEVELOPMENT: Log instead of sending
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 [DEV MODE] Email would be sent to: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content: ${content.substring(0, 200)}...`);

      // Save to history
      await pool.query(`
        INSERT INTO email_history
        (user_id, subject, generated_email, sent_to, sent_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [req.user.id, subject, content, to]);

      return res.json({
        success: true,
        message: "Email sent successfully (development mode - not actually sent)",
        sentTo: to
      });
    }

    // FOR PRODUCTION: Actual sending
    /*
    const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: to }],
          subject: subject,
          ...(replyToEmail ? { reply_to: { email: replyToEmail } } : {})
        }],
        from: {
          email: process.env.FROM_EMAIL,
          name: businessName || req.user.name || "LetiMail User"
        },
        content: [{
          type: "text/html",
          value: formattedContent
        }]
      })
    });

    if (!sendGridResponse.ok) {
      const errorData = await sendGridResponse.text();
      console.error("SendGrid Error:", errorData);
      return res.status(500).json({ error: "Failed to send email" });
    }
    */

    // Save to history
    await pool.query(`
      INSERT INTO email_history
      (user_id, subject, generated_email, sent_to, sent_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [req.user.id, subject, content, to]);

    res.json({
      success: true,
      message: "Email sent successfully",
      sentTo: to
    });
  } catch (error) {
    console.error("Send Email Error:", error);
    res.status(500).json({
      error: "Failed to send email",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// User Preferences Endpoints
app.get("/api/preferences", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
    res.json({
      success: true,
      preferences: result.rows[0].preferences || {}
    });
  } catch (error) {
    console.error("Preferences error:", error);
    res.status(500).json({ error: "Failed to get preferences" });
  }
});

app.post("/api/preferences", authenticateToken, async (req, res) => {
  const { preferences } = req.body;

  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({ error: "Valid preferences object required" });
  }

  try {
    await pool.query(
      'UPDATE users SET preferences = $1 WHERE id = $2',
      [preferences, req.user.id]
    );

    res.json({
      success: true,
      message: "Preferences saved successfully"
    });
  } catch (error) {
    console.error("Preferences save error:", error);
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

// Tone Profile Endpoints
app.get("/api/tone-profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT tone_profile FROM users WHERE id = $1', [req.user.id]);
    res.json({
      success: true,
      toneProfile: result.rows[0].tone_profile || {}
    });
  } catch (error) {
    console.error("Tone profile error:", error);
    res.status(500).json({ error: "Failed to get tone profile" });
  }
});

app.post("/api/tone-profile", authenticateToken, async (req, res) => {
  const { toneProfile } = req.body;

  if (!toneProfile || typeof toneProfile !== 'object') {
    return res.status(400).json({ error: "Valid tone profile object required" });
  }

  try {
    await pool.query(
      'UPDATE users SET tone_profile = $1 WHERE id = $2',
      [toneProfile, req.user.id]
    );

    res.json({
      success: true,
      message: "Tone profile saved successfully"
    });
  } catch (error) {
    console.error("Tone profile save error:", error);
    res.status(500).json({ error: "Failed to save tone profile" });
  }
});

// Email History Endpoints
app.get("/api/email-history", authenticateToken, async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;

  try {
    const result = await pool.query(`
      SELECT id, business_context, email_context, tone, subject,
             generated_email, edited_email, sent_to, created_at, sent_at
      FROM email_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, parseInt(limit), parseInt(offset)]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM email_history WHERE user_id = $1
    `, [req.user.id]);

    res.json({
      success: true,
      emails: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error("Email history error:", error);
    res.status(500).json({ error: "Failed to get email history" });
  }
});

app.get("/api/email-history/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, business_context, email_context, tone, subject,
             generated_email, edited_email, sent_to, created_at, sent_at
      FROM email_history
      WHERE id = $1 AND user_id = $2
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email not found" });
    }

    res.json({
      success: true,
      email: result.rows[0]
    });
  } catch (error) {
    console.error("Email history detail error:", error);
    res.status(500).json({ error: "Failed to get email details" });
  }
});

// API Key Management
app.post("/api/api-keys", authenticateToken, async (req, res) => {
  const { name, permissions } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    // Generate a random API key
    const apiKey = require('crypto').randomBytes(32).toString('hex');

    await pool.query(`
      INSERT INTO api_keys
      (user_id, key, name, permissions, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [req.user.id, apiKey, name, permissions || {}]);

    res.json({
      success: true,
      apiKey: apiKey,
      message: "API key created successfully"
    });
  } catch (error) {
    console.error("API key creation error:", error);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

app.get("/api/api-keys", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, permissions, created_at, last_used, active
      FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [req.user.id]);

    res.json({
      success: true,
      apiKeys: result.rows
    });
  } catch (error) {
    console.error("API keys list error:", error);
    res.status(500).json({ error: "Failed to get API keys" });
  }
});

app.delete("/api/api-keys/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM api_keys
      WHERE id = $1 AND user_id = $2
    `, [req.params.id, req.user.id]);

    res.json({
      success: true,
      message: "API key deleted successfully"
    });
  } catch (error) {
    console.error("API key deletion error:", error);
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

// Admin Endpoints (for future use)
app.get("/api/admin/stats", authenticateToken, async (req, res) => {
  // In a real app, you'd check for admin privileges here
  if (req.user.email !== 'admin@letimail.com') {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const emailCount = await pool.query('SELECT COUNT(*) FROM email_history');
    const activeUsers = await pool.query(`
      SELECT COUNT(DISTINCT user_id) FROM email_history
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(userCount.rows[0].count),
        totalEmails: parseInt(emailCount.rows[0].count),
        activeUsers: parseInt(activeUsers.rows[0].count)
      }
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "LetiMail API",
    version: "2.0.0",
    status: "running",
    endpoints: {
      auth: "/api/auth/*",
      emails: "/api/generate, /api/improve-email, /api/send-email",
      history: "/api/email-history",
      preferences: "/api/preferences",
      tone: "/api/tone-profile",
      admin: "/api/admin/*"
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 LetiMail backend running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    console.log('HTTP server closed');
    await pool.end();
    console.log('Database connections closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(async () => {
    console.log('HTTP server closed');
    await pool.end();
    console.log('Database connections closed');
    process.exit(0);
  });
});

// Unhandled exception handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
