import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pkg from 'pg';
import sgMail from '@sendgrid/mail';

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
        emails_left INTEGER DEFAULT 25,
        last_reset_date DATE DEFAULT CURRENT_DATE,
        is_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Initialize database on startup
initializeDatabase();

// Auth Routes
app.post('/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = jwt.sign({ email }, process.env.JWT_SECRET || 'your-secret-key');

    // Create user
    const result = await pool.query(
      `INSERT INTO users (name, email, password, verification_token, emails_left) 
       VALUES ($1, $2, $3, $4, 25) RETURNING id, name, email, plan`,
      [name, email, hashedPassword, verificationToken]
    );

    // Send verification email using SendGrid
    const verificationUrl = `https://${req.get('host')}/auth/verify?token=${verificationToken}`;
    
    const msg = {
      to: email,
      from: {
        email: process.env.FROM_EMAIL,
        name: 'LetiMail'
      },
      subject: 'Verify Your LetiMail Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6366f1;">Welcome to LetiMail!</h2>
          <p>Hi ${name},</p>
          <p>Please verify your email address by clicking the button below:</p>
          <a href="${verificationUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0;">
            Verify Email Address
          </a>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
          <p>If you didn't create an account with LetiMail, please ignore this email.</p>
        </div>
      `
    };

    await sgMail.send(msg);

    res.json({ message: 'Account created successfully! Please check your email for verification instructions.' });
  } catch (error) {
    console.error('Signup error:', error);
    
    // If SendGrid fails, provide a fallback verification method
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
    }
    
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Get user
    const result = await pool.query(
      'SELECT id, name, email, password, plan, emails_used, emails_left, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if verified
    if (!user.is_verified) {
      return res.status(400).json({ error: 'Please verify your email first. Check your inbox for the verification link.' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Reset daily email count if it's a new day (for free users)
    const today = new Date().toISOString().split('T')[0];
    const lastReset = user.last_reset_date;
    
    if (lastReset && lastReset.toISOString().split('T')[0] !== today) {
      await pool.query(
        'UPDATE users SET emails_used = 0, last_reset_date = $1 WHERE id = $2',
        [today, user.id]
      );
      user.emails_used = 0;
    }

    // Create token
    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        emailsUsed: user.emails_used,
        emailsLeft: user.emails_left
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/auth/verify', async (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    await pool.query(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE email = $1',
      [decoded.email]
    );

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verified - LetiMail</title>
        <style>
          body { 
            font-family: 'Inter', Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            padding: 60px 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            max-width: 500px;
          }
          h2 { 
            color: #1a365d; 
            margin-bottom: 20px;
            font-size: 32px;
          }
          p { 
            color: #4a5568; 
            margin-bottom: 30px;
            font-size: 18px;
            line-height: 1.6;
          }
          .btn {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            padding: 16px 32px;
            text-decoration: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 16px;
            display: inline-block;
            transition: transform 0.3s ease;
          }
          .btn:hover {
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🎉 Email Verified Successfully!</h2>
          <p>Your LetiMail account has been verified. You can now log in and start creating amazing emails.</p>
          <a href="/" class="btn">Get Started with LetiMail</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(400).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #e53e3e;">Invalid Verification Link</h2>
          <p>The verification link is invalid or has expired.</p>
          <a href="/" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Go to LetiMail
          </a>
        </body>
      </html>
    `);
  }
});

// Resend verification email endpoint
app.post('/auth/resend-verification', async (req, res) => {
  const { email } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, name, is_verified, verification_token FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Create new verification token
    const verificationToken = jwt.sign({ email }, process.env.JWT_SECRET || 'your-secret-key');
    
    await pool.query(
      'UPDATE users SET verification_token = $1 WHERE email = $2',
      [verificationToken, email]
    );

    // Send verification email
    const verificationUrl = `https://${req.get('host')}/auth/verify?token=${verificationToken}`;
    
    const msg = {
      to: email,
      from: {
        email: process.env.FROM_EMAIL,
        name: 'LetiMail'
      },
      subject: 'Verify Your LetiMail Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6366f1;">Verify Your LetiMail Account</h2>
          <p>Hi ${user.name},</p>
          <p>Please verify your email address by clicking the button below:</p>
          <a href="${verificationUrl}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0;">
            Verify Email Address
          </a>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
        </div>
      `
    };

    await sgMail.send(msg);

    res.json({ message: 'Verification email sent successfully!' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Function to clean AI comments from responses
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

// Anti-spam validation function
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

// Function to add human-like imperfections
function addHumanTouches(email) {
  if (!email) return email;
  
  let humanEmail = email
    // Replace perfect AI phrases with more human ones
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

app.get("/", (req, res) => {
  res.send("✅ LetiMail backend running with PostgreSQL Authentication");
});

// Update email generation endpoint to check limits
app.post("/generate", authenticateToken, async (req, res) => {
  const { business, context, tone } = req.body;
  
  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
  }

  try {
    // Check user's email limits
    const userResult = await pool.query(
      'SELECT emails_used, emails_left, plan FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ email: "User not found" });
    }

    const user = userResult.rows[0];
    
    // Check monthly limit
    if (user.emails_left <= 0) {
      return res.status(400).json({ 
        email: "❌ Monthly email limit reached. Upgrade to Premium for more emails." 
      });
    }

    // Check daily limit for free users
    if (user.plan === 'free' && user.emails_used >= 5) {
      return res.status(400).json({ 
        email: "❌ Daily email limit reached (5 emails/day). Upgrade to Premium for unlimited daily emails." 
      });
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
      'UPDATE users SET emails_used = emails_used + 1, emails_left = emails_left - 1 WHERE id = $1',
      [req.user.id]
    );
    
    res.json({ email });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({ email: "Error generating email." });
  }
});

app.post("/refine-email", authenticateToken, async (req, res) => {
  const { business, context, tone, originalEmail, editedEmail } = req.body;

  if (!validateEmailContent(editedEmail, business, context)) {
    return res.status(400).json({ 
      email: "❌ Unable to process edits." 
    });
  }

  const prompt = `
Apply professional formatting to this email while preserving ALL user content exactly. Make it maintain a human-written feel.

USER'S EXACT WORDS (DO NOT CHANGE CONTENT):
${editedEmail}

CONTEXT (for reference only):
- Business: ${business}
- Purpose: ${context} 
- Tone: ${tone}

INSTRUCTIONS:
- Preserve every word exactly as written
- Apply clean email formatting only
- Maintain the human-like flow and imperfections
- Don't "improve" or "correct" the writing style
- Keep any casual language or contractions
- Return ONLY the formatted email

Formatted email:
`;

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || editedEmail;
    
    email = cleanAIResponse(email);
    
    if (!email || email.length < 10) {
      email = editedEmail;
    }
    
    res.json({ email });
  } catch (error) {
    console.error("Groq API Error:", error);
    res.json({ email: editedEmail });
  }
});

// SendGrid email sending endpoint
app.post("/send-email", authenticateToken, async (req, res) => {
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

// Updated HTML email formatting - Preserve original bullets only
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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.7;
      color: #2D3748;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    
    .email-wrapper {
      max-width: 680px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 24px;
      box-shadow: 
        0 20px 60px rgba(0, 0, 0, 0.1),
        0 0 0 1px rgba(255, 255, 255, 0.1);
      overflow: hidden;
      backdrop-filter: blur(10px);
    }
    
    .email-header {
      background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
      color: white;
      padding: 50px 40px 40px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .email-header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0,0 L100,0 L100,100 Z" fill="rgba(255,255,255,0.05)"/></svg>');
      background-size: cover;
    }
    
    .subject-line {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 32px;
      font-weight: 600;
      line-height: 1.2;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    
    .header-meta {
      font-size: 14px;
      opacity: 0.8;
      font-weight: 400;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    
    .email-body {
      padding: 50px 40px;
    }
    
    .email-content {
      font-size: 17px;
      line-height: 1.8;
      color: #4A5568;
    }
    
    .email-content p {
      margin-bottom: 24px;
      font-weight: 400;
    }
    
    .greeting {
      font-size: 18px;
      font-weight: 500;
      color: #2D3748;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #EDF2F7;
    }
    
    .closing {
      margin-top: 40px;
      padding-top: 30px;
      border-top: 2px solid #EDF2F7;
    }
    
    .signature-block {
      margin-top: 40px;
      padding: 30px;
      background: linear-gradient(135deg, #F7FAFC 0%, #EDF2F7 100%);
      border-radius: 16px;
      border-left: 4px solid #667eea;
    }
    
    .sender-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 22px;
      font-weight: 600;
      color: #2D3748;
      margin-bottom: 8px;
    }
    
    .sender-title {
      font-size: 15px;
      color: #718096;
      font-weight: 500;
      margin-bottom: 16px;
    }
    
    .contact-info {
      font-size: 14px;
      color: #4A5568;
    }
    
    .footer {
      background: #1A202C;
      color: #A0AEC0;
      padding: 40px;
      text-align: center;
    }
    
    .brand {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 24px;
      font-weight: 600;
      color: #FFFFFF;
      margin-bottom: 16px;
      letter-spacing: 1px;
    }
    
    .tagline {
      font-size: 14px;
      margin-bottom: 24px;
      opacity: 0.8;
    }
    
    .copyright {
      font-size: 12px;
      opacity: 0.6;
      margin-top: 20px;
    }
    
    @media only screen and (max-width: 600px) {
      body {
        padding: 20px 10px;
      }
      
      .email-header {
        padding: 40px 20px 30px;
      }
      
      .subject-line {
        font-size: 26px;
      }
      
      .email-body {
        padding: 30px 20px;
      }
      
      .email-content {
        font-size: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-header">
      <h1 class="subject-line">${emailSubject}</h1>
      <div class="header-meta">Professional Communication</div>
    </div>
    
    <div class="email-body">
      <div class="email-content">
        ${htmlContent}
      </div>
      
      <div class="signature-block">
        <div class="sender-name">${senderName || 'Professional Contact'}</div>
        <div class="sender-title">Sent via LetiMail</div>
        <div class="contact-info">
          Professional Email Crafting Service
        </div>
      </div>
    </div>
    
    <div class="footer">
      <div class="brand">LetiMail</div>
      <div class="tagline">Crafting professional emails with elegance and precision</div>
      <div class="copyright">
        &copy; 2024 LetiMail. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  return htmlEmail;
}

// Simple HTML conversion - Preserve original bullets only, no automatic conversion
function convertTextToSimpleHTML(text) {
  if (!text) return '<p>No content available.</p>';
  
  let html = '';
  const lines = text.split('\n');
  let currentParagraph = '';
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      // Empty line - finish current paragraph
      if (currentParagraph) {
        html += `<p>${currentParagraph}</p>`;
        currentParagraph = '';
      }
      return;
    }
    
    // Check if this line is a bullet point in the original content
    const isBulletPoint = trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || /^\d+\./.test(trimmedLine);
    
    if (isBulletPoint) {
      // Finish current paragraph if exists
      if (currentParagraph) {
        html += `<p>${currentParagraph}</p>`;
        currentParagraph = '';
      }
      // Add bullet point as a simple paragraph with the bullet character
      const cleanLine = trimmedLine.replace(/^[•\-\d+\.]\s*/, '');
      html += `<p>• ${cleanLine}</p>`;
    } else {
      // Regular text line - add to current paragraph
      if (currentParagraph) {
        currentParagraph += '<br>' + trimmedLine;
      } else {
        currentParagraph = trimmedLine;
      }
    }
  });
  
  // Add any remaining paragraph
  if (currentParagraph) {
    html += `<p>${currentParagraph}</p>`;
  }
  
  return html;
}

// Extract subject from content
function extractSubject(content) {
  const subjectMatch = content.match(/Subject:\s*(.*?)(?:\n|$)/i);
  return subjectMatch ? subjectMatch[1].trim() : null;
}

// User profile endpoint
app.get('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, plan, emails_used, emails_left, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OTP Login endpoints
app.post('/auth/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, name, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    const user = userResult.rows[0];

    if (!user.is_verified) {
      return res.status(400).json({ error: 'Please verify your email first' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in database
    await pool.query(
      'UPDATE users SET otp_code = $1, otp_expiry = $2 WHERE email = $3',
      [otp, otpExpiry, email]
    );

    // Send OTP email
    const msg = {
      to: email,
      from: {
        email: process.env.FROM_EMAIL,
        name: 'LetiMail'
      },
      subject: 'Your LetiMail Login OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6366f1;">Your Login OTP</h2>
          <p>Hi ${user.name},</p>
          <p>Use the following OTP to sign in to your LetiMail account:</p>
          <div style="background: #f8fafc; border: 2px dashed #cbd5e0; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #6366f1; font-size: 48px; margin: 0; letter-spacing: 8px;">${otp}</h1>
          </div>
          <p style="color: #666; font-size: 14px;">This OTP will expire in 10 minutes.</p>
          <p>If you didn't request this OTP, please ignore this email.</p>
        </div>
      `
    };

    await sgMail.send(msg);

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

app.post('/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    // Verify OTP
    const result = await pool.query(
      'SELECT id, name, email, plan, emails_used, emails_left, otp_code, otp_expiry FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid OTP' });
    }

    const user = result.rows[0];

    if (!user.otp_code || user.otp_code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (new Date() > user.otp_expiry) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Clear OTP after successful verification
    await pool.query(
      'UPDATE users SET otp_code = NULL, otp_expiry = NULL WHERE email = $1',
      [email]
    );

    // Create token
    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        emailsUsed: user.emails_used,
        emailsLeft: user.emails_left
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Update user profile endpoint
app.post('/auth/update-profile', authenticateToken, async (req, res) => {
  const { name, company, role } = req.body;

  try {
    await pool.query(
      'UPDATE users SET name = $1, company = $2, role = $3 WHERE id = $4',
      [name, company, role, req.user.id]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password endpoint
app.post('/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    // Verify current password
    const userResult = await pool.query(
      'SELECT password FROM users WHERE id = $1',
      [req.user.id]
    );

    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Update preferences endpoint
app.post('/auth/update-preferences', authenticateToken, async (req, res) => {
  const { preferences } = req.body;

  try {
    await pool.query(
      'UPDATE users SET preferences = $1 WHERE id = $2',
      [JSON.stringify(preferences), req.user.id]
    );

    res.json({ message: 'Preferences updated successfully' });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Update notifications endpoint
app.post('/auth/update-notifications', authenticateToken, async (req, res) => {
  const { notifications } = req.body;

  try {
    await pool.query(
      'UPDATE users SET notification_settings = $1 WHERE id = $2',
      [JSON.stringify(notifications), req.user.id]
    );

    res.json({ message: 'Notification settings updated successfully' });
  } catch (error) {
    console.error('Update notifications error:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
