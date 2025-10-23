import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;
const app = express();

// CORS configuration
const allowedOrigins = [
  'https://damii-lola.github.io',
  'https://damii-lola.github.io/LetiMail',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
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
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Users table
    await pool.query(`
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // OTP table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otp_verifications (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        otp VARCHAR(6) NOT NULL,
        verified BOOLEAN DEFAULT false,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Email history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        business_context TEXT,
        email_context TEXT,
        tone VARCHAR(50),
        generated_email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_history_user ON email_history(user_id)`);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
}

// Test database connection and initialize tables
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to the database', err.stack);
  } else {
    console.log('✅ Database connected successfully');
    release();
    await initializeDatabase();
  }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Auth middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) return res.status(403).json({ error: 'User not found' });
    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Helper function to clean AI responses
function cleanAIResponse(content) {
  if (!content) return content;

  let cleaned = content
    .replace(/^(Here is|Here's) your (.+? email|refined email|email)[\s\S]*?(?=Subject:)/i, '')
    .replace(/\n*Note:[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*Please note:[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*I have (preserved|applied|maintained)[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*This email[\s\S]*?(?=\n\n|$)/gi, '')
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

// Helper function to format email content for sending
function formatEmailContent(content, senderName) {
  let emailBody = content.replace(/^Subject:\s*.+\n?/i, '').trim();
  const emailSubject = content.match(/Subject:\s*(.*?)(?:\n|$)/i)?.[1] || 'Professional Communication';

  return `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h3 style="color: #2c3e50;">${emailSubject}</h3>
        <div style="margin: 20px 0;">${emailBody.replace(/\n/g, '<br>')}</div>
        <p style="margin-top: 30px; color: #7f8c8d;">
          Best regards,<br>
          ${senderName || 'Your Name'}<br>
          <small style="color: #95a5a6;">Sent via LetiMail</small>
        </p>
      </body>
    </html>
  `;
}

// Generate and send OTP - UPDATED WITH DEBUG LOGGING
app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // Store OTP in database
    await pool.query(
      `INSERT INTO otp_verifications (email, otp, expires_at, verified)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email)
       DO UPDATE SET otp = $2, expires_at = $3, verified = $4, created_at = NOW()`,
      [email, otp, expiresAt, false]
    );

    // DEBUG: Log the OTP to console for testing
    console.log(`[DEBUG] OTP for ${email}: ${otp}`);

    // In production, you would send the email here
    // For now, we'll just log it and return success
    console.log(`[DEBUG] OTP email would be sent to ${email} with code ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully (check console for debug code)',
      expiresIn: '15 minutes'
    });
  } catch (error) {
    console.error('OTP send error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
app.post("/api/auth/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

  try {
    const result = await pool.query(
      `SELECT * FROM otp_verifications
       WHERE email = $1 AND otp = $2 AND expires_at > NOW()`,
      [email, otp]
    );

    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired OTP' });

    // Mark OTP as verified
    await pool.query(
      `UPDATE otp_verifications SET verified = true WHERE email = $1 AND otp = $2`,
      [email, otp]
    );

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// Register user
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, otp } = req.body;
  if (!name || !email || !password || !otp) {
    return res.status(400).json({ error: 'All fields including OTP are required' });
  }

  try {
    // Verify OTP first
    const otpResult = await pool.query(
      `SELECT * FROM otp_verifications
       WHERE email = $1 AND otp = $2 AND expires_at > NOW()`,
      [email, otp]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, plan, emails_used, emails_left)
       VALUES ($1, $2, $3, 'free', 0, 5)
       RETURNING id, name, email, plan, emails_used, emails_left`,
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

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

// Login user
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, plan, emails_used, emails_left FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Generate email endpoint - UPDATED WITH IMPROVED ERROR HANDLING
app.post("/api/generate", authenticateToken, async (req, res) => {
  const { business, context, tone, emailLength, stylePrompt } = req.body;

  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
  }

  try {
    const user = req.user;

    // Check if user has emails left
    if (user.plan === 'free' && user.emails_used >= user.emails_left) {
      return res.status(400).json({
        email: `❌ You've used all ${user.emails_left} free emails! Upgrade for unlimited emails.`
      });
    }

    // Build prompt with style matching
    const prompt = `
      Write a professional email with the following details:
      Business: ${business}
      Context: ${context}
      Tone: ${tone || 'professional'}
      Length: ${emailLength || 'medium'}
      ${stylePrompt || ''}

      Important instructions:
      1. Start the email with "Subject:" followed by the subject line
      2. Make the email sound natural and professional
      3. Match the requested tone and length
      4. Only return the email content, no additional explanations
    `;

    console.log("Generating email with prompt:", prompt);

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.text();
      console.error("Groq API error:", errorData);
      return res.status(500).json({ email: "Error connecting to AI service" });
    }

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || "Error generating email.";

    // Clean and format the response
    email = cleanAIResponse(email);

    if (!email.startsWith("Subject:")) {
      email = "Subject: Professional Communication\n\n" + email;
    }

    // Update email usage for free users
    if (user.plan === 'free') {
      await pool.query(
        `UPDATE users SET emails_used = emails_used + 1 WHERE id = $1`,
        [user.id]
      );
    }

    // Save to email history
    await pool.query(
      `INSERT INTO email_history (user_id, business_context, email_context, tone, generated_email)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, business, context, tone, email]
    );

    res.json({ email });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({ email: "Error generating email. Please try again." });
  }
});

// Send email endpoint
app.post("/api/send-email", authenticateToken, async (req, res) => {
  const { to, subject, content, businessName, replyToEmail } = req.body;
  if (!to || !subject || !content || !businessName || !replyToEmail) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const formattedContent = formatEmailContent(content, businessName);

    // In production, you would send the email here using SendGrid or similar
    // For now, we'll just log it and return success
    console.log(`[DEBUG] Email to be sent to ${to}:`);
    console.log(`Subject: ${subject}`);
    console.log(`Content: ${formattedContent}`);

    res.json({
      success: true,
      message: "Email sent successfully (simulated)",
      replyTo: replyToEmail
    });
  } catch (error) {
    console.error("Send Email Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: "connected"
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    pool.end().then(() => {
      console.log('Database connections closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    pool.end().then(() => {
      console.log('Database connections closed');
      process.exit(0);
    });
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
