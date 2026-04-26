import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';   // <-- add to package.json: "uuid"

const { Pool } = pkg;
const app = express();

// ── CORS Configuration ───────────────────────────────
const allowedOrigins = [
  'https://damii-lola.github.io',          // your GitHub Pages origin (no path)
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Database ─────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// JWT Secret – definitely set in production!
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-please';

// ── Initialize Database Tables ───────────────────────
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

    // Indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_history_user ON email_history(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_history_created ON email_history(created_at)`);

    console.log('✅ Database tables ready');
  } catch (e) {
    console.error('❌ Database init error:', e);
  }
}

// Test connection & init
pool.connect((err, client, done) => {
  if (err) {
    console.error('❌ DB connection error:', err.stack);
  } else {
    console.log('✅ Database connected');
    done();
    initializeDatabase();
  }
});

// ── Auth Middleware ──────────────────────────────────
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

// ── Rate Limiter ─────────────────────────────────────
const rateLimitStore = new Map();
function rateLimit(maxRequests = 10, windowMs = 60000) {
  return (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const now = Date.now();
    if (!rateLimitStore.has(identifier)) rateLimitStore.set(identifier, []);
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

// ── AI Response Cleaner (fixed) ──────────────────────
function cleanAIResponse(content) {
  if (!content) return "Subject: Error generating email.\n\nPlease try again.";

  let cleaned = content;

  // Remove everything before "Subject:"
  const subjectIndex = cleaned.indexOf('Subject:');
  if (subjectIndex > 0) cleaned = cleaned.substring(subjectIndex);

  // Remove any line that starts with typical AI commentary
  const lines = cleaned.split('\n');
  const filtered = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!started && trimmed === '') continue;
    if (trimmed.match(/^Subject:/i)) started = true;
    if (!started) continue;

    // Stop if we encounter AI commentary lines
    if (trimmed.match(/^(Here is|Here's|meets all the|including:|professionally crafted|relationship-appropriate|executive purpose)/i)) break;
    if (trimmed.match(/^[•\-]\s/)) break;   // bullet points

    filtered.push(line);
  }
  cleaned = filtered.join('\n').trim();

  // Ensure it starts with Subject:
  if (!cleaned.startsWith('Subject:')) {
    cleaned = 'Subject: Professional Communication\n\n' + cleaned;
  }

  // Basic sanitation
  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\$\$?/g, '')   // remove stray dollar signs
    .trim();

  return cleaned || "Subject: Professional Communication\n\nThank you for your message.";
}

// ── GUEST LOGIN (automatic) ──────────────────────────
app.post("/api/auth/guest", async (req, res) => {
  try {
    const guestId = uuidv4();
    const guestEmail = `guest_${guestId}@letimail.local`;
    const guestName = 'Guest';
    // Password never verified, but column requires a value
    const placeholderPassword = await bcrypt.hash(guestId, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, plan, emails_used, emails_left)
       VALUES ($1, $2, $3, 'free', 0, 10)
       RETURNING *`,
      [guestName, guestEmail, placeholderPassword]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ Guest user created:', user.id);

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
        default_tone: user.default_tone,
        email_length: user.email_length
      }
    });
  } catch (error) {
    console.error('❌ Guest creation error:', error);
    res.status(500).json({ error: 'Failed to create guest session' });
  }
});

// ── User Profile Endpoints (kept for future use) ─────
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, plan, company, role, emails_used, emails_left, default_tone, email_length, auto_save, spell_check FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

app.put("/api/auth/profile", authenticateToken, async (req, res) => {
  const { name, company, role } = req.body;
  if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Name is required' });

  try {
    const result = await pool.query(
      'UPDATE users SET name = $1, company = $2, role = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, name, email, plan, company, role',
      [name.trim(), company || '', role || '', req.user.id]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

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
      `UPDATE users SET default_tone = $1, email_length = $2, auto_save = $3, spell_check = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
      [preferences.defaultTone, preferences.emailLength, preferences.autoSave, preferences.spellCheck, req.user.id]
    );
    res.json({ success: true, preferences });
  } catch (error) {
    console.error('❌ Preferences save error:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

app.put("/api/auth/password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashed, req.user.id]);
    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    console.error('❌ Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.delete("/api/auth/delete-account", authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    console.error('❌ Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ── Email History ────────────────────────────────────
async function saveEmailToHistory(userId, business, context, tone, generatedEmail) {
  try {
    await pool.query(
      `INSERT INTO email_history (user_id, business_context, email_context, tone, generated_email)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, business, context, tone, generatedEmail]
    );
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

app.get("/api/email-history", authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(
      `SELECT id, business_context, email_context, tone, generated_email, created_at
       FROM email_history WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    const count = await pool.query('SELECT COUNT(*) FROM email_history WHERE user_id = $1', [req.user.id]);
    res.json({
      success: true,
      emails: result.rows,
      total: parseInt(count.rows[0].count),
      limit,
      offset
    });
  } catch (error) {
    console.error('❌ Email history error:', error);
    res.status(500).json({ error: 'Failed to get email history' });
  }
});

app.delete("/api/email-history/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM email_history WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Email not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Delete history error:', error);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// ── Email Generation ─────────────────────────────────
app.post("/api/generate", authenticateToken, rateLimit(5, 60000), async (req, res) => {
  const { business, context, tone, emailLength } = req.body;
  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
  }

  try {
    const user = req.user;
    if (user.plan === 'free' && user.emails_used >= 10) {
      return res.status(400).json({ email: "You've used all 10 free emails. Upgrade for more." });
    }

    const prompt = `
# ULTIMATE PROFESSIONAL EMAIL ARCHITECTURE SYSTEM

## BUSINESS CONTEXT:
${business}

## COMMUNICATION PURPOSE:
${context}

## TONE REQUIREMENT: ${tone}
## LENGTH CONSTRAINT: ${emailLength}

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
          signal: controller.signal,
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

    email = cleanAIResponse(email);

    // Save to history
    saveEmailToHistory(user.id, business, context, tone, email);

    // Update count for free users
    if (user.plan === 'free') {
      await pool.query('UPDATE users SET emails_used = emails_used + 1 WHERE id = $1', [user.id]);
    }

    res.json({ email });
  } catch (error) {
    console.error("🎯 Generation error:", error);
    res.json({ email: `Subject: ${context}\n\nHello,\n\nI hope this email finds you well regarding ${context}. Let me know if you have any questions.\n\nBest regards` });
  }
});

// ── Polish Email ─────────────────────────────────────
app.post("/api/polish-email", authenticateToken, async (req, res) => {
  const { originalEmail, editedEmail } = req.body;
  if (!originalEmail || !editedEmail) return res.status(400).json({ error: "Both emails required" });

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
${originalEmail}

EDITED:
${editedEmail}

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
    let polished = data.choices?.[0]?.message?.content?.trim() || editedEmail;
    polished = polished.replace(/^(Here is|Here's) (the )?(polished|refined) (version of the )?email:\s*/i, '');
    polished = polished.replace(/^(Based on your edits, here( is|'s))?/i, '').trim();

    res.json({ polishedEmail: polished || editedEmail, success: true });
  } catch (error) {
    console.error("Polish error:", error);
    res.json({ polishedEmail: editedEmail, success: false, message: "Polishing failed, returning your edits" });
  }
});

// ── Send Email ───────────────────────────────────────
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
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(to)) return res.status(400).json({ error: `Invalid recipient email: ${to}` });
  if (!emailRegex.test(replyToEmail)) return res.status(400).json({ error: `Invalid reply-to email: ${replyToEmail}` });

  try {
    let formattedContent = content.replace(/^Subject:\s*.+\n?/i, '').trim();
    const emailSubject = content.match(/^Subject:\s*(.+)/i)?.[1]?.trim() || subject;

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

// ── Smart Reply ──────────────────────────────────────
app.post("/api/smart-reply", authenticateToken, rateLimit(10, 60000), async (req, res) => {
  const { emailContent, context } = req.body;
  if (!emailContent) return res.status(400).json({ error: "Email content is required" });

  try {
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
    let repliesText = data.choices?.[0]?.message?.content?.trim() || "Error generating replies.";
    const replyOptions = [];
    const replyMatches = repliesText.match(/Reply Option \d+:([\s\S]*?)(?=Reply Option \d+:|$)/gi);
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
      replyOptions.push({ id: 1, type: 'general', content: repliesText });
    }
    res.json({ success: true, replies: replyOptions });
  } catch (error) {
    console.error("Smart reply error:", error);
    res.status(500).json({ error: "Failed to generate replies", success: false });
  }
});

// ── Health Checks ────────────────────────────────────
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
    res.status(500).json({ status: "error", database: "disconnected", error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("✅ LetiMail backend running – Guest access enabled");
});

// ── Server Start ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 LetiMail backend running on port ${PORT}`);
  console.log(`🔗 Backend URL: ${process.env.RENDER_BACKEND_URL || 'http://localhost:' + PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    pool.end(() => {
      console.log('🛑 Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    pool.end(() => {
      console.log('🛑 Server closed');
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

// Final log
if (process.env.NODE_ENV === 'production') {
  console.log('🌐 Running in PRODUCTION mode');
  console.log('📦 Database:', process.env.DATABASE_URL ? 'Configured' : 'Missing');
  console.log('🤖 AI Provider: Groq API');
  console.log('📧 Email Service: SendGrid');
} else {
  console.log('🛠️  Running in DEVELOPMENT mode');
  console.log('⚠️  JWT Secret:', JWT_SECRET.substring(0, 8) + '...');
  console.log('⚠️  GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'Configured' : 'Not configured');
  console.log('⚠️  SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'Configured' : 'Not configured');
}

console.log('✅ LetiMail Backend v2.0.0 (Guest Access) Initialized');
