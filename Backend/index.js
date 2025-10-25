import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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

    // Simplified OTP table - removed verified column
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otp_verifications (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications(email)`);
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
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

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
    
    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ============================================
// DEBUG ENDPOINT - CHECK OTP STATUS
// ============================================

app.get("/api/debug/otp/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT email, otp, expires_at, created_at, (expires_at > NOW()) as is_valid FROM otp_verifications WHERE email = $1',
      [email]
    );
    
    res.json({
      email: email,
      otps_found: result.rows.length,
      otps: result.rows,
      current_time: new Date(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SIMPLIFIED OTP SYSTEM
// ============================================

// Send OTP
app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    console.log('\n========================================');
    console.log('🔐 SENDING OTP');
    console.log('========================================');
    console.log('📧 Email:', email);
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log('🎲 Generated OTP:', otp);
    console.log('⏰ Current time:', new Date().toISOString());
    console.log('⏰ Expires at:', expiresAt.toISOString());
    console.log('⏰ Time until expiry:', '10 minutes');

    // Delete any existing OTPs for this email
    const deleteResult = await pool.query('DELETE FROM otp_verifications WHERE email = $1', [email]);
    console.log('🗑️  Deleted', deleteResult.rowCount, 'old OTP(s)');

    // Insert new OTP
    const insertResult = await pool.query(
      'INSERT INTO otp_verifications (email, otp, expires_at) VALUES ($1, $2, $3) RETURNING *',
      [email, otp, expiresAt]
    );
    
    console.log('✅ OTP stored in database:', insertResult.rows[0]);

    // Verify it was stored correctly
    const verifyResult = await pool.query(
      'SELECT * FROM otp_verifications WHERE email = $1',
      [email]
    );
    console.log('✅ Verification query returned:', verifyResult.rows);

    // Send OTP via email
    const emailContent = `
Hello,

Your LetiMail verification code is:

${otp}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

Best regards,
The LetiMail Team
    `;

    console.log('📤 Sending email to:', email);

    const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: email }],
          subject: "LetiMail - Email Verification Code"
        }],
        from: {
          email: process.env.FROM_EMAIL,
          name: "LetiMail Verification"
        },
        content: [{
          type: "text/plain",
          value: emailContent
        }]
      })
    });

    if (sendGridResponse.ok) {
      console.log('✅ OTP email sent successfully via SendGrid');
      console.log('========================================\n');
      
      res.json({
        success: true,
        message: 'OTP sent successfully',
        debug: {
          otp: otp, // TEMPORARY - REMOVE IN PRODUCTION
          email: email,
          expiresAt: expiresAt
        }
      });
    } else {
      const errorText = await sendGridResponse.text();
      console.error('❌ SendGrid error:', errorText);
      console.log('========================================\n');
      res.status(500).json({ error: 'Failed to send OTP email' });
    }
  } catch (error) {
    console.error('❌ OTP send error:', error);
    console.log('========================================\n');
    res.status(500).json({ error: 'Failed to send OTP: ' + error.message });
  }
});

// Register with OTP (combined verify + register)
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, otp } = req.body;

  if (!name || !email || !password || !otp) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    console.log('\n========================================');
    console.log('🔍 REGISTRATION ATTEMPT');
    console.log('========================================');
    console.log('📧 Email:', email);
    console.log('👤 Name:', name);
    console.log('🔐 OTP provided:', otp);
    console.log('🔐 OTP type:', typeof otp);
    console.log('🔐 OTP length:', otp.length);

    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      console.log('❌ Email already registered');
      console.log('========================================\n');
      return res.status(400).json({ error: 'Email already registered' });
    }

    // First, let's see what OTPs exist for this email
    const allOtps = await pool.query(
      'SELECT *, (expires_at > NOW()) as is_valid, NOW() as current_db_time FROM otp_verifications WHERE email = $1',
      [email]
    );
    
    console.log('📊 All OTPs for this email:', allOtps.rows);
    console.log('📊 Number of OTPs found:', allOtps.rows.length);

    if (allOtps.rows.length > 0) {
      const storedOtp = allOtps.rows[0];
      console.log('🔍 Stored OTP:', storedOtp.otp);
      console.log('🔍 Stored OTP type:', typeof storedOtp.otp);
      console.log('🔍 Provided OTP:', otp);
      console.log('🔍 Provided OTP type:', typeof otp);
      console.log('🔍 OTPs match (===):', storedOtp.otp === otp);
      console.log('🔍 OTPs match (==):', storedOtp.otp == otp);
      console.log('🔍 String comparison:', String(storedOtp.otp) === String(otp));
      console.log('⏰ Expires at:', storedOtp.expires_at);
      console.log('⏰ Current DB time:', storedOtp.current_db_time);
      console.log('⏰ Is valid?:', storedOtp.is_valid);
      console.log('⏰ Time comparison:', new Date(storedOtp.expires_at) > new Date(storedOtp.current_db_time));
    }

    // Now do the actual verification query
    const otpResult = await pool.query(
      'SELECT * FROM otp_verifications WHERE email = $1 AND otp = $2 AND expires_at > NOW()',
      [email, otp]
    );

    console.log('📊 OTP verification query returned:', otpResult.rows.length, 'rows');
    console.log('📊 Matched OTP details:', otpResult.rows);

    if (otpResult.rows.length === 0) {
      console.log('❌ OTP VERIFICATION FAILED');
      
      if (allOtps.rows.length === 0) {
        console.log('❌ Reason: No OTP found for this email');
        console.log('========================================\n');
        return res.status(400).json({ 
          error: 'No verification code found. Please request a new one.',
          debug: { email, otp_provided: otp }
        });
      }

      const storedOtp = allOtps.rows[0];
      
      if (storedOtp.otp !== otp && String(storedOtp.otp) !== String(otp)) {
        console.log('❌ Reason: OTP mismatch');
        console.log('========================================\n');
        return res.status(400).json({ 
          error: 'Invalid verification code',
          debug: { 
            stored: storedOtp.otp, 
            provided: otp,
            match: storedOtp.otp === otp
          }
        });
      }

      if (new Date(storedOtp.expires_at) < new Date()) {
        console.log('❌ Reason: OTP expired');
        console.log('========================================\n');
        return res.status(400).json({ 
          error: 'Verification code expired. Please request a new one.',
          debug: {
            expired_at: storedOtp.expires_at,
            current_time: new Date()
          }
        });
      }

      console.log('❌ Reason: Unknown - check query logic');
      console.log('========================================\n');
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    console.log('✅ OTP VERIFIED SUCCESSFULLY!');

    // Create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, plan, emails_used, emails_left, daily_emails_used, last_reset_date)
       VALUES ($1, $2, $3, 'free', 0, 10, 0, CURRENT_DATE)
       RETURNING id, name, email, plan, emails_used, emails_left, daily_emails_used, created_at`,
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    console.log('✅ User created:', user);

    // Delete used OTP
    await pool.query('DELETE FROM otp_verifications WHERE email = $1', [email]);
    console.log('✅ Used OTP deleted');

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ USER REGISTERED SUCCESSFULLY!');
    console.log('========================================\n');

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
    console.error('❌ Registration error:', error);
    console.log('========================================\n');
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// ============================================
// AUTH ENDPOINTS
// ============================================

// Login user
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  
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
        emails_left: user.emails_left,
        daily_emails_used: user.daily_emails_used
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
      'SELECT id, name, email, plan, emails_used, emails_left, daily_emails_used, last_reset_date FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Delete account
app.delete("/api/auth/delete-account", authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ============================================
// EMAIL GENERATION
// ============================================

function cleanAIResponse(content) {
  if (!content) return content;
  
  let cleaned = content
    .replace(/^(Here is|Here's) your (.+? email|refined email|email)[\s\S]*?(?=Subject:)/i, '')
    .replace(/\n*Note:[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*Please note:[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*I have (preserved|applied|maintained)[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*This email[\s\S]*?(?=\n\n|$)/gi, '')
    .trim();

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

app.post("/api/generate", authenticateToken, async (req, res) => {
  const { business, context, tone, emailLength, stylePrompt } = req.body;
  
  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
  }

  try {
    const user = req.user;

    if (user.plan === 'free' && user.emails_used >= 10) {
      return res.status(400).json({
        email: "❌ You've used all 10 free emails! Upgrade to Premium for unlimited emails."
      });
    }

    const prompt = `
Write this email to sound authentically human and natural.
${stylePrompt ? stylePrompt : ''}

BUSINESS CONTEXT:
- Business: ${business}
- Purpose: ${context}
- Tone: ${tone}
- Length: ${emailLength}

IMPORTANT: Make this email sound like a real human wrote it - natural, conversational, and authentic.
Return ONLY the email content starting with "Subject:".
`;

    console.log("📝 Generating email with prompt:", prompt);

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 800,
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || "Error generating email.";
    email = cleanAIResponse(email);

    if (!email.startsWith("Subject:")) {
      email = "Subject: Professional Communication\n\n" + email;
    }

    if (user.plan === 'free') {
      await pool.query(
        'UPDATE users SET emails_used = emails_used + 1 WHERE id = $1',
        [user.id]
      );
    }

    res.json({ email });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({ email: "Error generating email." });
  }
});

// Send email endpoint
app.post("/api/send-email", authenticateToken, async (req, res) => {
  const { to, subject, content, businessName, replyToEmail } = req.body;
  
  if (!to || !subject || !content || !businessName || !replyToEmail) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ error: "Invalid recipient email address" });
  }
  if (!emailRegex.test(replyToEmail)) {
    return res.status(400).json({ error: "Invalid reply-to email address" });
  }

  try {
    const formattedContent = formatEmailContent(content, businessName);

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
          reply_to: { email: replyToEmail }
        }],
        from: {
          email: process.env.FROM_EMAIL,
          name: businessName || "LetiMail User"
        },
        reply_to: {
          email: replyToEmail,
          name: businessName
        },
        content: [{
          type: "text/html",
          value: formattedContent
        }]
      })
    });

    if (sendGridResponse.ok) {
      res.json({
        success: true,
        message: "Email sent successfully",
        replyTo: replyToEmail
      });
    } else {
      const errorData = await sendGridResponse.text();
      console.error("SendGrid Error:", errorData);
      res.status(500).json({ error: "Failed to send email" });
    }
  } catch (error) {
    console.error("Send Email Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      if (currentParagraph) {
        html += `<p>${currentParagraph}</p>`;
        currentParagraph = '';
      }
      return;
    }

    const isBulletPoint = trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || /^\d+\./.test(trimmedLine);
    
    if (isBulletPoint) {
      if (currentParagraph) {
        html += `<p>${currentParagraph}</p>`;
        currentParagraph = '';
      }
      const cleanLine = trimmedLine.replace(/^[•\-\d+\.]\s*/, '');
      html += `<p>• ${cleanLine}</p>`;
    } else {
      if (currentParagraph) {
        currentParagraph += '<br>' + trimmedLine;
      } else {
        currentParagraph = trimmedLine;
      }
    }
  });

  if (currentParagraph) {
    html += `<p>${currentParagraph}</p>`;
  }

  return html;
}

function extractSubject(content) {
  const subjectMatch = content.match(/Subject:\s*(.*?)(?:\n|$)/i);
  return subjectMatch ? subjectMatch[1].trim() : null;
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      error: error.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("✅ LetiMail backend running - OTP system v2.0");
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));

process.on('SIGTERM', () => {
  console.log('SIGTERM received, starting graceful shutdown');
  server.close(() => {
    console.log('Process terminated');
    pool.end(() => {
      console.log('Database connections closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, starting graceful shutdown');
  server.close(() => {
    console.log('Process terminated');
    pool.end(() => {
      console.log('Database connections closed');
      process.exit(0);
    });
  });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
