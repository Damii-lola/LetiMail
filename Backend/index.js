import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { Pool } = pkg;
const app = express();

// CORS configuration for Render
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
app.use(express.urlencoded({ extended: true }));

// PostgreSQL connection for Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// JWT Secret - Change in production!
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        plan VARCHAR(50) DEFAULT 'free',
        company VARCHAR(255) DEFAULT '',
        role VARCHAR(255) DEFAULT '',
        emails_used INTEGER DEFAULT 0,
        emails_left INTEGER DEFAULT 10,
        daily_emails_used INTEGER DEFAULT 0,
        last_reset_date DATE DEFAULT CURRENT_DATE,
        default_tone VARCHAR(50) DEFAULT 'friendly',
        email_length VARCHAR(20) DEFAULT 'medium',
        auto_save BOOLEAN DEFAULT true,
        spell_check BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    // Create indexes for better performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)`);
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

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = \$1', [decoded.userId]);

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
// AUTH ENDPOINTS - SIMPLE REGISTRATION & LOGIN
// ============================================

// Register new user - NO OTP REQUIRED
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    console.log('📝 Registration attempt for:', email);

    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = \$1', [email]);
    if (existingUser.rows.length > 0) {
      console.log('❌ Email already registered');
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user directly
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, plan, emails_used, emails_left, default_tone, email_length, auto_save, spell_check)
       VALUES (\$1, \$2, \$3, 'free', 0, 10, 'friendly', 'medium', true, true)
       RETURNING id, name, email, plan, company, role, emails_used, emails_left, default_tone, email_length`,
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    console.log('✅ User created:', user.id);

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ User registered successfully');

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        company: user.company,
        role: user.role,
        emails_used: user.emails_used,
        emails_left: user.emails_left,
        default_tone: user.default_tone,
        email_length: user.email_length
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// Login user
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = \$1', [email]);

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
        company: user.company,
        role: user.role,
        emails_used: user.emails_used,
        emails_left: user.emails_left
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, plan, company, role, emails_used, emails_left, default_tone, email_length, auto_save, spell_check FROM users WHERE id = \$1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({ user });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Update user profile
app.put("/api/auth/profile", authenticateToken, async (req, res) => {
  const { name, company, role } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET name = \$1, company = \$2, role = \$3, updated_at = CURRENT_TIMESTAMP WHERE id = \$4 RETURNING id, name, email, plan, company, role',
      [name.trim(), company || '', role || '', req.user.id]
    );

    console.log('✅ Profile updated for user:', req.user.id);

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Save user preferences
app.put("/api/auth/preferences", authenticateToken, async (req, res) => {
  const { defaultTone, emailLength, autoSave, spellCheck } = req.body;

  try {
    const preferences = {
      defaultTone: defaultTone || 'friendly',
      emailLength: emailLength || 'medium',
      autoSave: autoSave !== undefined ? autoSave : true,
      spellCheck: spellCheck !== undefined ? spellCheck : true
    };

    await pool.query(
      `UPDATE users SET
        default_tone = \$1,
        email_length = \$2,
        auto_save = \$3,
        spell_check = \$4,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = \$5`,
      [preferences.defaultTone, preferences.emailLength, preferences.autoSave, preferences.spellCheck, req.user.id]
    );

    console.log('✅ Preferences saved for user:', req.user.id);

    res.json({ success: true, preferences });
  } catch (error) {
    console.error('❌ Preferences save error:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// Change password
app.put("/api/auth/password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    // Verify current password
    const result = await pool.query('SELECT password FROM users WHERE id = \$1', [req.user.id]);
    const user = result.rows[0];

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = \$1, updated_at = CURRENT_TIMESTAMP WHERE id = \$2',
      [hashedPassword, req.user.id]
    );

    console.log('✅ Password changed for user:', req.user.id);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('❌ Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Delete account
app.delete("/api/auth/delete-account", authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = \$1', [req.user.id]);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('❌ Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ============================================
// EMAIL HISTORY ENDPOINTS
// ============================================

// Save email to history
async function saveEmailToHistory(userId, business, context, tone, generatedEmail) {
  try {
    await pool.query(
      `INSERT INTO email_history (user_id, business_context, email_context, tone, generated_email)
       VALUES (\$1, \$2, \$3, \$4, \$5)`,
      [userId, business, context, tone, generatedEmail]
    );
  } catch (error) {
    console.error('Failed to save email history:', error);
  }
}

// Get user's email history
app.get("/api/email-history", authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT id, business_context, email_context, tone, generated_email, created_at
       FROM email_history
       WHERE user_id = \$1
       ORDER BY created_at DESC
       LIMIT \$2 OFFSET \$3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM email_history WHERE user_id = \$1',
      [req.user.id]
    );

    res.json({
      success: true,
      emails: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (error) {
    console.error('❌ Email history error:', error);
    res.status(500).json({ error: 'Failed to get email history' });
  }
});

// Delete email from history
app.delete("/api/email-history/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM email_history WHERE id = \$1 AND user_id = \$2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found or unauthorized' });
    }

    res.json({ success: true, message: 'Email deleted from history' });
  } catch (error) {
    console.error('❌ Delete history error:', error);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// ============================================
// RATE LIMITING MIDDLEWARE
// ============================================

const rateLimitStore = new Map();

function rateLimit(maxRequests = 10, windowMs = 60000) {
  return (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const now = Date.now();

    if (!rateLimitStore.has(identifier)) {
      rateLimitStore.set(identifier, []);
    }

    const requests = rateLimitStore.get(identifier);
    const recentRequests = requests.filter(time => now - time < windowMs);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }

    recentRequests.push(now);
    rateLimitStore.set(identifier, recentRequests);

    next();
  };
}

// ============================================
// EMAIL GENERATION WITH ADVANCED PROMPTING
// ============================================

function cleanAIResponse(content) {
  if (!content) return "Subject: Error generating email.\n\nPlease try again.";

  console.log("🔍 RAW AI OUTPUT:", content);

  let cleaned = content;

  // Remove everything before "Subject:" if AI added preamble
  const subjectIndex = cleaned.indexOf('Subject:');
  if (subjectIndex > 0) {
    cleaned = cleaned.substring(subjectIndex);
  }

  // Remove AI commentary that comes AFTER the email
  const endOfEmailPatterns = [
    /(Best regards,|Sincerely,|Kind regards,|Regards,|Thanks,|Thank you,)\s*\n\s*$$
?Your Name
$$?[\s\S]*\$/i,
    /meets all the requirements specified.*$/im,
    /including:.*$/im,
    /professionally crafted subject line.*\$/im,
    /\n\s*[•\-]\s.*\$/im
  ];

  let emailEndIndex = cleaned.length;

  for (let pattern of endOfEmailPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      emailEndIndex = Math.min(emailEndIndex, match.index);
    }
  }

  if (emailEndIndex < cleaned.length) {
    cleaned = cleaned.substring(0, emailEndIndex).trim();
  }

  // Remove specific AI commentary lines while preserving email content
  const lines = cleaned.split('\n');
  let resultLines = [];
  let inEmailContent = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (resultLines.length === 0 && line === '') continue;

    if (line.match(/meets all the requirements|including:|professionally crafted|relationship-appropriate|executive purpose/im)) {
      break;
    }

    if (line.match(/^\s*[•\-]\s/)) {
      break;
    }

    resultLines.push(lines[i]);
  }

  cleaned = resultLines.join('\n');

  // Ensure it starts with Subject: and has basic email structure
  if (!cleaned.startsWith('Subject:')) {
    const subjectMatch = cleaned.match(/(?:^|\n)(Subject:\s*.+)/i);
    if (subjectMatch) {
      cleaned = subjectMatch[1] + '\n\n' + cleaned.replace(subjectMatch[0], '').trim();
    } else {
      cleaned = "Subject: Professional Communication\n\n" + cleaned;
    }
  }

  cleaned = cleaned
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+\$/g, '')
    .trim();

  // SAFETY CHECK
  if (cleaned.length < 50 || cleaned === "Subject: Professional Communication") {
    cleaned = content
      .replace(/meets all the requirements specified.*\$/im, '')
      .replace(/including:.*\$/im, '')
      .replace(/\n\s*[•\-]\s.*\$/im, '')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  console.log("✅ CLEANED OUTPUT:", cleaned);
  return cleaned || "Subject: Professional Communication\n\nThank you for your message.";
}

app.post("/api/generate", authenticateToken, rateLimit(5, 60000), async (req, res) => {
  const { business, context, tone, emailLength } = req.body;

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
# ULTIMATE PROFESSIONAL EMAIL ARCHITECTURE SYSTEM

## BUSINESS CONTEXT:
\${business}

## COMMUNICATION PURPOSE:
\${context}

## TONE REQUIREMENT: \${tone}
## LENGTH CONSTRAINT: \${emailLength}

## STRICT OUTPUT REQUIREMENTS:
- Generate ONLY the email starting with "Subject:"
- NO introductory phrases, explanations, or commentary
- NO "Here is your email" or similar text
- Start immediately with "Subject: [Subject Line]"

## PERFECT EMAIL STRUCTURE:
Subject: [Professional, context-appropriate subject line]

[Professional salutation]

[Paragraph 1: Clear purpose statement]
[Paragraph 2: Supporting details and context]
[Paragraph 3: Action items or next steps]

[Professional closing]
[Sender name and position]

## PROHIBITED CONTENT:
- No bullet points or numbered lists
- No emojis or symbols
- No corporate buzzwords
- No excessive punctuation
- No informal greetings without proper addressing

Generate ONLY the email content starting with "Subject:" following all requirements above.
`;

    console.log("📝 Generating email for user:", user.id);

    // Enhanced email generation with retry logic
    let email = "Subject: Error generating email.\n\nPlease try again.";
    let retries = 3;

    while (retries > 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "llama-3.2-11b-text-preview",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: emailLength === 'short' ? 400 : emailLength === 'medium' ? 600 : 800,
            top_p: 0.9,
            frequency_penalty: 0.1,
            presence_penalty: 0.1,
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!groqResponse.ok) {
          throw new Error(`API response: ${groqResponse.status}`);
        }

        const data = await groqResponse.json();

        if (data.choices?.[0]?.message?.content) {
          email = data.choices[0].message.content.trim();
          break;
        } else {
          throw new Error("Invalid API response format");
        }

      } catch (error) {
        console.error(`❌ API attempt ${4 - retries} failed:`, error.message);
        retries--;
        if (retries === 0) {
          email = `Subject: ${context}\n\nDear Team,\n\nRegarding ${context}, I'm writing from ${business} to discuss this matter.\n\nBest regards,\n[Your Name]`;
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // Clean and validate the response
    email = cleanAIResponse(email);

    if (!email || email === "Subject: Error generating email." || email.includes("Error generating")) {
      email = `Subject: ${context}\n\nHi there,\n\nThis email pertains to ${context} as ${business}.\n\nRegards,\nSender`;
    }

    // Save to history
    saveEmailToHistory(user.id, business, context, tone, email);

    // Update email count for free users
    if (user.plan === 'free') {
      await pool.query(
        'UPDATE users SET emails_used = emails_used + 1 WHERE id = \$1',
        [user.id]
      );
    }

    res.json({ email });

  } catch (error) {
    console.error("🎯 Generation error:", error);
    const fallbackEmail = `Subject: ${context}\n\nHello,\n\nI hope this email finds you well regarding ${context}. Let me know if you have any questions.\n\nBest regards`;
    res.json({ email: fallbackEmail });
  }
});

// Polish edited email endpoint
app.post("/api/polish-email", authenticateToken, async (req, res) => {
  const { originalEmail, editedEmail } = req.body;

  if (!originalEmail || !editedEmail) {
    return res.status(400).json({ error: "Both original and edited email are required" });
  }

  try {
    const prompt = `
You are an email editor. The user made edits to an AI-generated email.
Your job is to:
1. Keep ALL user edits intact
2. Polish grammar, punctuation, and flow
3. Make edited parts blend naturally
4. Maintain original tone and structure
5. Return ONLY the polished email

ORIGINAL:
\${originalEmail}

EDITED:
\${editedEmail}

RULES:
- Preserve user's intended changes completely
- Only fix grammar, punctuation, and flow
- Do NOT rewrite user's edits
- Blend edited sections seamlessly
- Maintain tone and formality

Return ONLY the polished email, nothing else.
`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.2-11b-text-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    const data = await groqResponse.json();
    let polishedEmail = data.choices?.[0]?.message?.content?.trim() || editedEmail;

    // Clean up any AI prefixes
    polishedEmail = polishedEmail.replace(/^(Here is|Here's) (the )?(polished|refined) (version of the )?email:\s*/i, '');
    polishedEmail = polishedEmail.replace(/^(Based on your edits, here( is|'s))?/i, '');
    polishedEmail = polishedEmail.trim();

    res.json({ polishedEmail: polishedEmail || editedEmail, success: true });

  } catch (error) {
    console.error("Polish error:", error);
    res.json({ polishedEmail: editedEmail, success: false, message: "Polishing failed, returning your edits" });
  }
});

// Send email endpoint
app.post("/api/send-email", authenticateToken, async (req, res) => {
  const { to, subject, content, businessName, replyToEmail } = req.body;

  console.log('📧 Send email request:', { to, subject, businessName, replyToEmail });

  if (!to || !subject || !content || !businessName || !replyToEmail) {
    const missing = [];
    if (!to) missing.push('recipient email');
    if (!subject) missing.push('subject');
    if (!content) missing.push('content');
    if (!businessName) missing.push('business name');
    if (!replyToEmail) missing.push('reply-to email');

    console.error('❌ Missing fields:', missing);
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  // Email validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(to)) {
    console.error('❌ Invalid recipient email:', to);
    return res.status(400).json({ error: `Invalid recipient email format: ${to}` });
  }

  if (!emailRegex.test(replyToEmail)) {
    console.error('❌ Invalid reply-to email:', replyToEmail);
    return res.status(400).json({ error: `Invalid reply-to email format: ${replyToEmail}` });
  }

  try {
    console.log('📤 Sending via SendGrid...');

    // Format email content for SendGrid
    let formattedContent = content.replace(/^Subject:\s*.+\n?/i, '').trim();
    const emailSubject = content.match(/^Subject:\s*(.+)/i)?.[1]?.trim() || subject;

    // Simple HTML conversion for better email formatting
    const htmlContent = formattedContent
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .split('<br>')
      .map(line => line.trim())
      .filter(line => line)
      .map(line => `<p>${line}</p>`)
      .join('');

    const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: to }],
          subject: emailSubject
        }],
        from: {
          email: process.env.FROM_EMAIL || "noreply@letimail.app",
          name: businessName || "LetiMail User"
        },
        reply_to: {
          email: replyToEmail,
          name: businessName
        },
        content: [{
          type: "text/html",
          value: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .email-content { color: #333; }
  </style>
</head>
<body>
  <div class="email-content">
    ${htmlContent}
    <p>--<br>
    Sent via <strong>LetiMail</strong> - AI Email Assistant<br>
    <a href="${process.env.FRONTEND_URL || 'https://letimail.app'}">Visit LetiMail</a></p>
  </div>
</body>
</html>
          `
        }]
      })
    });

    if (sendGridResponse.ok) {
      console.log('✅ Email sent successfully to:', to);
      res.json({ success: true, message: "Email sent successfully", replyTo: replyToEmail });
    } else {
      const errorData = await sendGridResponse.text();
      console.error("❌ SendGrid Error:", errorData);
      res.status(500).json({ error: "Failed to send email via SendGrid" });
    }

  } catch (error) {
    console.error("❌ Send Email Error:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

// Smart Reply - Generate reply suggestions
app.post("/api/smart-reply", authenticateToken, rateLimit(10, 60000), async (req, res) => {
  const { emailContent, context } = req.body;

  if (!emailContent) {
    return res.status(400).json({ error: "Email content is required" });
  }

  try {
    console.log('🤖 Generating smart reply...');

    const prompt = `You are an email reply assistant. Read the email below and generate 3 different reply options.

EMAIL:
${emailContent}

${context ? `CONTEXT: ${context}` : ''}

Generate 3 reply options:
1. Brief professional reply (2-3 sentences)
2. Detailed thoughtful reply (4-6 sentences)
3. Friendly conversational reply (3-4 sentences)

Format: "Reply Option X: [content]"
Return ONLY the 3 reply options, nothing else.`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.2-11b-text-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    const data = await groqResponse.json();
    let replies = data.choices?.[0]?.message?.content?.trim() || "Error generating replies.";

    // Parse replies into array
    const replyOptions = [];
    const replyMatches = replies.match(/Reply Option \d+:([\s\S]*?)(?=Reply Option \d+:|$)/gi);

    if (replyMatches) {
      replyMatches.forEach((match, index) => {
        const replyText = match.replace(/Reply Option \d+:/i, '').trim();
        replyOptions.push({
          id: index + 1,
          type: index === 0 ? 'brief' : index === 1 ? 'detailed' : 'friendly',
          content: replyText
        });
      });
    } else {
      replyOptions.push({ id: 1, type: 'general', content: replies });
    }

    res.json({ success: true, replies: replyOptions });

  } catch (error) {
    console.error("Smart reply error:", error);
    res.status(500).json({
      error: "Failed to generate replies. Please try again.",
      success: false
    });
  }
});

// Health check endpoint
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

// Health check root endpoint
app.get("/", (req, res) => {
  res.send("✅ LetiMail backend running - Simple registration, AI polish feature included");
});

// ============================================
// SERVER CONFIGURATION
// ============================================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 LetiMail backend running on port ${PORT}`);
  console.log(`🔗 Backend URL: ${process.env.RENDER_BACKEND_URL || 'http://localhost:' + PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, starting graceful shutdown');
  server.close(() => {
    console.log('🛑 Server closed');
    pool.end(() => {
      console.log('🗄️  Database connections closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, starting graceful shutdown');
  server.close(() => {
    console.log('🛑 Server closed');
    pool.end(() => {
      console.log('🗄️  Database connections closed');
      process.exit(0);
    });
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ============================================
// FINAL CONFIGURATION & EXPORTS
// ============================================

// Export the app for Render deployment
export default app;

// Environment validation
if (process.env.NODE_ENV === 'production') {
  console.log('🌐 Running in PRODUCTION mode');
  console.log('📦 Render Backend:', process.env.RENDER_BACKEND_URL);
  console.log('🗄️  Database:', process.env.DATABASE_URL ? 'Configured' : 'Not configured');
  console.log('🤖 AI Provider: Groq API');
  console.log('📧 Email Service: SendGrid');
} else {
  console.log('🛠️  Running in DEVELOPMENT mode');
  console.log('📦 Local Backend URL will be used');
  console.log('⚠️  JWT Secret:', JWT_SECRET.substring(0, 8) + '...');
  console.log('⚠️  GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'Configured' : 'Not configured');
  console.log('⚠️  SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'Configured' : 'Not configured');
}

// ============================================
// STARTUP COMPLETE
// ============================================

console.log('✅ LetiMail Backend v2.0.0 Initialized Successfully!');
console.log('🔧 All systems ready for Render deployment');
console.log('📡 Ready to handle API requests on port', PORT);
