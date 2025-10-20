import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { Pool } = pkg;
const app = express();

// CORS configuration - Allow requests from your frontend
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
    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        plan VARCHAR(50) DEFAULT 'free',
        emails_used INTEGER DEFAULT 0,
        emails_left INTEGER DEFAULT 25,
        daily_emails_used INTEGER DEFAULT 0,
        last_reset_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create OTP table
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

    // Create email history table
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

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_history_user ON email_history(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_history_created ON email_history(created_at)`);

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
// OTP VERIFICATION ENDPOINTS
// ============================================

// Generate and send OTP
app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store OTP in database
    await pool.query(
      `INSERT INTO otp_verifications (email, otp, expires_at, verified) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (email) 
       DO UPDATE SET otp = $2, expires_at = $3, verified = $4, created_at = CURRENT_TIMESTAMP`,
      [email, otp, expiresAt, false]
    );

    // Send OTP via email
    const emailContent = `
Hello,

Thank you for signing up for LetiMail! Please use the following verification code to complete your registration:

🔐 **Verification Code: ${otp}**

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

Best regards,
The LetiMail Team
    `;

    const emailSubject = "LetiMail - Email Verification Code";

    // Send email using your existing SendGrid integration
    const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: email }],
          subject: emailSubject
        }],
        from: {
          email: process.env.FROM_EMAIL,
          name: "LetiMail Verification"
        },
        content: [
          {
            type: "text/plain",
            value: emailContent
          }
        ]
      })
    });

    if (sendGridResponse.ok) {
      res.json({ 
        success: true, 
        message: 'OTP sent successfully',
        expiresIn: '10 minutes'
      });
    } else {
      console.error('SendGrid error:', await sendGridResponse.text());
      res.status(500).json({ error: 'Failed to send OTP email' });
    }

  } catch (error) {
    console.error('OTP send error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
app.post("/api/auth/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    // Check OTP from database
    const result = await pool.query(
      `SELECT * FROM otp_verifications 
       WHERE email = $1 AND otp = $2 AND expires_at > NOW() AND verified = false`,
      [email, otp]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Mark OTP as verified
    await pool.query(
      `UPDATE otp_verifications SET verified = true WHERE email = $1 AND otp = $2`,
      [email, otp]
    );

    res.json({ 
      success: true, 
      message: 'Email verified successfully' 
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// ============================================
// AUTH ENDPOINTS
// ============================================

// Register new user with OTP verification
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, otp } = req.body;

  if (!name || !email || !password || !otp) {
    return res.status(400).json({ error: 'All fields including OTP are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Verify OTP first
    const otpResult = await pool.query(
      `SELECT * FROM otp_verifications 
       WHERE email = $1 AND otp = $2 AND verified = true AND expires_at > NOW()`,
      [email, otp]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or unverified OTP' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, plan, emails_used, emails_left, daily_emails_used, last_reset_date)
       VALUES ($1, $2, $3, 'free', 0, 25, 0, CURRENT_DATE)
       RETURNING id, name, email, plan, emails_used, emails_left, daily_emails_used, created_at`,
      [name, email, hashedPassword]
    );

    const user = result.rows[0];

    // Generate JWT
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
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

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

    // Generate JWT
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
    }
  }
  
  return cleaned || content;
}

function validateEmailContent(content, business, context) {
  const spamIndicators = [
    /\b(act now|limited time|urgent|immediate|don't miss|once in a lifetime)\b/gi,
    /\b(risk-free|guaranteed|miracle|cure|amazing|incredible)\b/gi,
    /\b(millionaire|billionaire|get rich|make money|earn cash)\b/gi,
    /\b(free money|no cost|zero cost|no fees)\b/gi,
    /\b(winner|prize|reward|bonus|discount|sale)\b/gi,
    /\b(click here|buy now|order now|sign up today)\b/gi,
    /\b(no obligation|no purchase necessary|not spam)\b/gi,
    /\b(viagra|cialis|pharmacy|prescription)\b/gi,
    /\b(adult|dating|singles|meet people)\b/gi,
    /\b(investment|bitcoin|crypto|forex|stocks)\b/gi
  ];

  for (const pattern of spamIndicators) {
    if (pattern.test(content)) {
      return false;
    }
  }

  return true;
}

function addHumanTouches(email) {
  if (!email) return email;
  
  let humanEmail = email
    .replace(/I am writing to/g, 'I\'m reaching out')
    .replace(/I would like to/g, 'I wanted to')
    .replace(/Please be advised/g, 'Just wanted to let you know')
    .replace(/It is important to note/g, 'Worth mentioning')
    .replace(/Furthermore/g, 'Also')
    .replace(/Additionally/g, 'Plus')
    .replace(/In conclusion/g, 'Anyway')
    .replace(/Utilize/g, 'Use')
    .replace(/Approximately/g, 'About')
    .replace(/Approach/g, 'Way');
  
  return humanEmail;
}

// Generate email endpoint
app.post("/api/generate", authenticateToken, async (req, res) => {
  const { business, context, tone } = req.body;
  
  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
  }

  try {
    const user = req.user;
    
    // Check monthly limit
    if (user.emails_left <= 0) {
      return res.status(400).json({ 
        email: "❌ Monthly email limit reached. Upgrade to Premium for more emails." 
      });
    }

    // Check daily limit for free users
    const today = new Date().toISOString().split('T')[0];
    if (user.plan === 'free' && user.daily_emails_used >= 5 && user.last_reset_date === today) {
      return res.status(400).json({ 
        email: "❌ Daily email limit reached (5 emails/day). Upgrade to Premium for unlimited daily emails." 
      });
    }

    // Reset daily count if new day
    let dailyEmailsUsed = user.daily_emails_used;
    if (user.last_reset_date !== today) {
      dailyEmailsUsed = 0;
    }

    const spamInputPatterns = [
      /make money|get rich|earn cash|work from home/gi,
      /free|discount|sale|limited time/gi,
      /viagra|cialis|pharmacy|prescription/gi,
      /bitcoin|crypto|investment|forex/gi
    ];

    for (const pattern of spamInputPatterns) {
      if (pattern.test(business) || pattern.test(context)) {
        return res.status(400).json({ 
          email: "❌ Unable to generate email. Please provide legitimate business context." 
        });
      }
    }

    const humanWritingStyles = {
      friendly: {
        instructions: `Write this email like a real human would - with slight imperfections, conversational language, and personal touches. Use contractions (I'm, you're, don't), occasional informal phrases, and make it sound like someone typed it quickly while thinking.`,
        examples: [
          "Hope you're having a good week!",
          "Quick question for you",
          "Just wanted to follow up on this",
          "No rush at all on this"
        ]
      },
      formal: {
        instructions: `Write this in a professional but human tone - not too perfect. Use some contractions, vary sentence length, and make it sound like a busy professional wrote it. Avoid overly formal corporate language.`,
        examples: [
          "I'm writing to follow up on",
          "Wanted to circle back to",
          "When you have a moment",
          "Look forward to hearing your thoughts"
        ]
      },
      persuasive: {
        instructions: `Write this persuasively but naturally - like a real salesperson or marketer would. Use conversational persuasion, not corporate jargon. Sound confident but human.`,
        examples: [
          "I think this could really help with",
          "What if we tried",
          "Have you considered",
          "This might be a game-changer for"
        ]
      },
      casual: {
        instructions: `Write this very casually like you're messaging a colleague. Use plenty of contractions, short sentences, and natural speech patterns. Make it sound completely unscripted.`,
        examples: [
          "Hey, quick question",
          "Just checking in on",
          "Let me know what you think",
          "No pressure either way"
        ]
      }
    };

    const style = humanWritingStyles[tone] || humanWritingStyles.friendly;

    const prompt = `
IMPORTANT: Write this email to sound 100% human-written. Avoid all AI patterns and make it pass AI detection as human-written.

HUMAN WRITING TECHNIQUES TO USE:
- Use contractions: I'm, you're, don't, can't, won't
- Vary sentence length dramatically
- Include occasional minor grammatical imperfections
- Use conversational phrases like "${style.examples[0]}"
- Add personal observations or thoughts
- Mix formal and informal language naturally
- Use industry-specific terms from the business context
- Include brief asides or personal touches
- Sound like a busy professional wrote it quickly

AVOID THESE AI PATTERNS:
- Perfect grammar and punctuation
- Overly structured paragraphs
- Repetitive sentence patterns
- Corporate jargon and buzzwords
- Generic "I hope this email finds you well"
- Overly formal language
- Perfect logical flow (humans jump around a bit)

BUSINESS CONTEXT:
- Business: ${business}
- Purpose: ${context}
- Tone: ${tone}

WRITING STYLE: ${style.instructions}

EMAIL STRUCTURE (but make it flow naturally):
Subject: [Human-sounding subject line - not too perfect]

[Natural opening that sounds conversational]
[Body with personal touches and slight imperfections]  
[Genuine closing that matches the tone]

CRITICAL: This should sound like a real human wrote it in 5 minutes, not like a perfectly crafted AI email. Include at least 3-4 human-like elements from the techniques above.

Return ONLY the email content starting with "Subject:".
`;

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
    email = addHumanTouches(email);
    
    if (!validateEmailContent(email, business, context)) {
      return res.status(400).json({ 
        email: "❌ Unable to generate appropriate email content." 
      });
    }

    // Update email usage
    await pool.query(
      `UPDATE users 
       SET emails_used = emails_used + 1, 
           emails_left = emails_left - 1,
           daily_emails_used = $1,
           last_reset_date = $2
       WHERE id = $3`,
      [dailyEmailsUsed + 1, today, user.id]
    );
    
    res.json({ email });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({ email: "Error generating email." });
  }
});

// Send email endpoint
app.post("/api/send-email", authenticateToken, async (req, res) => {
  const { to, subject, content, senderName } = req.body;

  if (!to || !subject || !content) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    const formattedContent = formatEmailContent(content, senderName);

    const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: to }],
          subject: subject
        }],
        from: {
          email: process.env.FROM_EMAIL,
          name: senderName || "LetiMail User"
        },
        content: [
          {
            type: "text/html",
            value: formattedContent
          }
        ]
      })
    });

    if (sendGridResponse.ok) {
      res.json({ success: true, message: "Email sent successfully" });
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

// Health check endpoint
app.get("/", (req, res) => {
  res.send("✅ LetiMail backend running with PostgreSQL and OTP verification");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: "postgresql", features: ["otp-verification"] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
