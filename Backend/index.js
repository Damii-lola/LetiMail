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
      emails_left INTEGER DEFAULT 10,
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
// AUTH ENDPOINTS - NO OTP
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
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      console.log('❌ Email already registered');
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user directly
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, plan, emails_used, emails_left)
       VALUES ($1, $2, $3, 'free', 0, 10)
       RETURNING id, name, email, plan, emails_used, emails_left, created_at`,
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
        emails_used: user.emails_used,
        emails_left: user.emails_left
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
// SETTINGS ENDPOINTS
// ============================================

// Update user profile
app.put("/api/auth/profile", authenticateToken, async (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, email, plan',
      [name.trim(), req.user.id]
    );

    console.log('✅ Profile updated for user:', req.user.id);
    
    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
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
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    console.log('✅ Password changed for user:', req.user.id);
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Save user preferences
app.put("/api/auth/preferences", authenticateToken, async (req, res) => {
  const { defaultTone, emailLength, autoSave, spellCheck } = req.body;
  
  try {
    // Store preferences as JSON in database
    const preferences = {
      defaultTone: defaultTone || 'friendly',
      emailLength: emailLength || 'medium',
      autoSave: autoSave !== undefined ? autoSave : true,
      spellCheck: spellCheck !== undefined ? spellCheck : true
    };

    await pool.query(
      `UPDATE users SET 
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [req.user.id]
    );

    console.log('✅ Preferences saved for user:', req.user.id);
    
    res.json({ success: true, preferences });
  } catch (error) {
    console.error('Preferences save error:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ============================================
// EMAIL HISTORY
// ============================================

// Save email to history
async function saveEmailToHistory(userId, business, context, tone, generatedEmail) {
  try {
    await pool.query(
      `INSERT INTO email_history (user_id, business_context, email_context, tone, generated_email)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, business, context, tone, generatedEmail]
    );
    console.log('✅ Email saved to history');
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
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM email_history WHERE user_id = $1',
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
    console.error('Email history error:', error);
    res.status(500).json({ error: 'Failed to get email history' });
  }
});

// Delete email from history
app.delete("/api/email-history/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM email_history WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json({ success: true, message: 'Email deleted from history' });
  } catch (error) {
    console.error('Delete history error:', error);
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
    
    // Clean up old entries every 100 requests
    if (Math.random() < 0.01) {
      for (const [key, times] of rateLimitStore.entries()) {
        const recent = times.filter(time => now - time < windowMs);
        if (recent.length === 0) {
          rateLimitStore.delete(key);
        } else {
          rateLimitStore.set(key, recent);
        }
      }
    }
    
    next();
  };
}

// ============================================
// ENHANCED EMAIL GENERATION WITH HISTORY
// ============================================

function cleanAIResponse(content) {
  if (!content) return content;
  
  let cleaned = content
    // REMOVE ALL INTERNAL THINKING/REASONING BLOCKS
    .replace(/\*\*.*?:\*\*[\s\S]*?(?=\n\n|$)/g, '') // Remove "**Proof:**" etc. blocks
    .replace(/\*{2}[\s\S]*?\*{2}/g, '') // Remove any **bold** formatting
    .replace(/\*([^*]+)\*/g, '$1') // Remove *italic* formatting  
    .replace(/_{2}([^_]+)_{2}/g, '$1') // Remove __underline__
    .replace(/`{3}[\s\S]*?`{3}/g, '') // Remove ```code blocks```
    .replace(/`([^`]+)`/g, '$1') // Remove `inline code`
    
    // REMOVE ALL NUMBERED/BULLETED LISTS THAT ARE FORMATTING
    .replace(/\n\s*\d+\.\s*\*\*[^*]+\*\*[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/\n\s*•\s*\*\*[^*]+\*\*[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/\n\s*[-*•]\s*/g, '\n') // Clean bullet points
    
    // REMOVE AI SELF-REFERENCE AND INSTRUCTIONS
    .replace(/\n\s*\d+\.\s*"[^"]+"[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/The tone is[\s\S]*?corporate-speak\./g, '')
    .replace(/CC:.*$/gim, '')
    .replace(/Implementation Details:[\s\S]*?(?=What's Next:|$)/gi, '')
    
    // CLEAN UP RANDOM FORMATTING ARTIFACTS
    .replace(/\*\*/g, '') // Remove any remaining **
    .replace(/\*/g, '') // Remove any remaining *
    .replace(/_{2}/g, '') // Remove any remaining __
    
    // NORMALIZE WHITESPACE
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();

  if (!cleaned.startsWith('Subject:')) {
    const subjectMatch = cleaned.match(/(?:^|\n)Subject:\s*(.*?)(?:\n|$)/i);
    if (subjectMatch) {
      cleaned = 'Subject: ' + subjectMatch[1].trim() + '\n\n' + cleaned.replace(/(?:^|\n)Subject:\s*(.*?)(?:\n|$)/i, '');
    } else {
      cleaned = "Subject: Professional Communication\n\n" + cleaned;
    }
  }

  cleaned = cleaned
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      // Remove lines that are clearly formatting commands
      if (trimmed.match(/^(\d+\.\s*")|(The tone is)|(Implementation Details:)|(What's Next:)|(CC:)/i)) return false;
      // Remove lines that are just single words in caps
      if (trimmed.match(/^[A-Z\s]{2,}$/) && trimmed.length < 20) return false;
      return true;
    })
    .join('\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  return cleaned || content;
}

app.post("/api/generate", authenticateToken, rateLimit(5, 60000), async (req, res) => {
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
MISSION: Generate business emails that sound like they were written by a top-tier executive coach, sales strategist, or communication expert. Every email must feel intentionally crafted, psychologically sharp, and strategically sound.

## 📋 FOUNDATIONAL PRINCIPLES

### 🚫 ABSOLUTELY FORBIDDEN PHRASES & PATTERNS - INSTANT REJECTION:
OPENING LINES:
- "I hope this email finds you well"
- "I came across your company" / "I was looking at your website"
- "My name is [X] and I'm from [Y]"
- "I'm reaching out because" / "I wanted to touch base"
- "Just checking in" / "Just following up"
- "I wanted to see if" / "I was wondering if"

CORPORATE BUZZWORDS - ZERO TOLERANCE:
- "Leverage," "synergy," "value-add," "circle back"
- "Streamline," "optimize," "enhance," "transform"
- "Cutting-edge," "best-in-class," "world-class"
- "Solution," "ecosystem," "paradigm shift"
- "Align with," "going forward," "touch base," "move the needle"

WEAK LANGUAGE PATTERNS - COMPLETE ELIMINATION:
- "We're incredibly excited" / "We're thrilled" (fake enthusiasm)
- "I think you might be interested" (uncertainty)
- "Would you be available?" / "Let me know what you think" (weak CTAs)
- "Please don't hesitate to contact me" (corporate cliché)
- Fake metrics, invented client names, or hallucinated case studies

ROBOTIC STRUCTURES - STRICTLY PROHIBITED:
- Starting every sentence with "We" or "I"
- Overusing adverbs: "very," "really," "extremely"
- Formulaic paragraph transitions
- Generic sign-offs: "Best regards," "Sincerely"
- Markdown formatting, bullet points, or numbered lists in output

### ✅ MANDATORY EXCELLENCE STANDARDS - NON-NEGOTIABLE:

SUBJECT LINE ARCHITECTURE (Psychological Triggers):
- CURIOSITY: "One question about [their pain point]"
- VALUE: "3 ways to [achieve benefit]"
- URGENCY: "Quick thought on [timely topic]"
- RELEVANCE: "Regarding [specific project/initiative]"
- CLARITY: "Update: [project name] status"
- Length: 6-10 words maximum, no exceptions

OPENING HOOK PSYCHOLOGY (First 10-15 words must grab attention):
- INSIGHT LED: Specific observation about their situation
- QUESTION LED: Thought-provoking question about their challenges
- VALUE LED: Immediate benefit or idea for their business
- STORY LED: Relevant anecdote or case example
- DIRECT LED: Straight to the point when appropriate

BODY COPY EXCELLENCE (Progressive Value Delivery):
- PARAGRAPH 1: Immediate relevance to reader's world
- PARAGRAPH 2: Concrete evidence or specific examples
- PARAGRAPH 3: Clear connection to their objectives
- PARAGRAPH 4: Natural progression to next steps

CALL TO ACTION ENGINEERING (Conversion-Focused):
- SPECIFIC: "Schedule 15 minutes Tuesday at 2 PM ET"
- LOW-FRICTION: "Reply with 'yes' if this makes sense"
- TIME-BOUND: "By Friday if possible"
- VALUE-ORIENTED: "Let's discuss how this saves 5 hours weekly"
- OPTION-BASED: "Either works for me - your call"

HUMAN VOICE INDICATORS (Authenticity Markers):
- Occasional contractions ("I'm," "you're," "we'll")
- Natural interjections ("Actually," "By the way," "Quick question")
- Varied sentence length (mix of short punchy and longer explanatory)
- Authentic phrasing over corporate speech
- Personal pronouns when appropriate

## 🎯 CONTEXT INTELLIGENCE - CRITICAL THINKING FRAMEWORK

PERSPECTIVE ANALYSIS:
- You Are: "${business}"
- Writing For: "${context}"
- Core Objective: Achieve the purpose while maintaining authentic voice

AUDIENCE DETERMINATION:
- Analyze the purpose to determine appropriate recipient
- External communication = clients, customers, partners
- Internal communication = team members, colleagues
- Self-promotion = potential clients or market
- Response communication = replying to specific inquiry

CONTEXT BOUNDARIES - STRICT ADHERENCE:
- NEVER invent fictional businesses, clients, or scenarios
- NEVER create fake metrics, case studies, or testimonials
- NEVER assume unprovided details about the business
- ALWAYS work within the provided context framework
- If specifics aren't provided, speak to general principles and methodologies

TRUTH PRESERVATION PRINCIPLES:
- Use "Our experience shows..." instead of fabricated results
- Use "Typically we see..." instead of specific invented metrics
- Use "Businesses like yours often..." instead of fake client names
- Focus on capabilities and approach rather than imaginary outcomes

## 🏗️ STRATEGIC EMAIL ARCHITECTURE BY PSYCHOLOGICAL PROFILE

### PERSUASION ARCHITECTURE (Cold Outreach & Sales):
Subject: Intriguing insight/question about their world
Opener: Specific, relevant observation
Body: Progressive value revelation with social proof
CTA: Low-commitment, high-value next step

### RELATIONSHIP ARCHITECTURE (Client Communication):
Subject: Clear, direct purpose statement
Opener: Respectful context setting
Body: Transparent information sharing
CTA: Collaborative next steps

### AUTHORITY ARCHITECTURE (Internal Leadership):
Subject: Action-oriented headline
Opener: Bottom-line up front
Body: Strategic context and direction
CTA: Clear ownership and deadlines

### EMPATHY ARCHITECTURE (Sensitive Topics):
Subject: Respectful acknowledgment
Opener: Understanding and validation
Body: Clear path forward with support
CTA: Reassuring next steps

## 🎭 TONE MASTERY - NUANCED EXECUTION

PROFESSIONAL TONE (${tone}):
- Clear, direct, but warm human voice
- Authority without arrogance or stiffness
- Expertise without condescension
- Polished but approachable language
- Replace corporate phrases with human equivalents

LENGTH OPTIMIZATION (${emailLength}):
- Ruthless conciseness - every word earns its place
- No filler phrases or redundant statements
- Strategic white space for readability
- Progressive information disclosure
- Quality of message over quantity of words

${stylePrompt ? `**VOICE INSTRUCTIONS:** ${stylePrompt}` : ''}

## 🧠 ADVANCED PSYCHOLOGICAL TRIGGERS

SOCIAL PROOF INTEGRATION:
- "Similar businesses have found..."
- "Our methodology typically results in..."
- "The approach we use often leads to..."

SCARCITY & URGENCY (Ethical Application):
- "We have limited capacity this quarter..."
- "This insight is particularly relevant now because..."
- "Timing matters here because..."

RECIPROCITY PRINCIPLES:
- "Here's one immediate idea you can use..."
- "I was thinking about your situation and..."
- "This might help you with..."

AUTHORITY ESTABLISHMENT:
- "Based on our work in this industry..."
- "Our experience shows that..."
- "We've found that the most effective approach is..."

CONSISTENCY LEVERAGING:
- "Since you value [principle], this aligns with..."
- "Given your focus on [goal], this approach..."
- "Consistent with your [stated preference]..."

## 🔧 TECHNICAL EXCELLENCE REQUIREMENTS

CONCISENESS ENGINEERING:
- Eliminate all unnecessary words
- Every sentence must advance the objective
- Cut 30% mentally before finalizing

SPECIFICITY MANDATE:
- Concrete details over vague claims
- Quantifiable concepts over generalities
- Tangible examples over abstract ideas

READABILITY OPTIMIZATION:
- Varied sentence structure and length
- Strategic paragraph breaks for scannability
- Natural flow and progression

RHYTHM AND PACING:
- Mix of short, medium, and long sentences
- Strategic repetition for emphasis
- Natural conversational flow

## 🚀 GENERATION PROTOCOL - STEP BY STEP

STEP 1: CONTEXT ASSIMILATION
- Internalize business identity: "${business}"
- Understand communication purpose: "${context}"
- Adopt appropriate tone: ${tone}
- Apply length constraints: ${emailLength}

STEP 2: STRATEGIC POSITIONING
- Determine psychological approach based on purpose
- Select appropriate email architecture
- Plan progressive value delivery

STEP 3: SUBJECT LINE CRAFTING
- Apply psychological trigger principles
- Ensure relevance and intrigue
- Maintain truth and authenticity

STEP 4: OPENING HOOK DEVELOPMENT
- Earn attention within first 10 words
- Establish immediate relevance
- Create natural progression to body

STEP 5: BODY COPY CONSTRUCTION
- Lead with reader's perspective
- Deliver value progressively
- Maintain authentic human voice throughout

STEP 6: CALL TO ACTION ENGINEERING
- Make next step clear and compelling
- Ensure appropriate commitment level
- Provide value justification

STEP 7: HUMAN VOICE POLISHING
- Inject natural language patterns
- Eliminate corporate-speak remnants
- Ensure conversational flow

STEP 8: QUALITY ASSURANCE
- Verify no prohibited phrases
- Confirm context adherence
- Ensure strategic soundness

## 🎯 OUTPUT FORMATTING RULES - STRICT COMPLIANCE

CRITICAL: You MUST output ONLY pure email text with NO formatting, NO markdown, NO internal reasoning, and NO lists.

STRICTLY PROHIBITED IN OUTPUT:
- NO **bold** or *italic* text
- NO bullet points with • or *
- NO numbered lists (1. 2. 3.)
- NO section headers like "Proof:" or "CTA:"
- NO internal commentary about tone or strategy
- NO formatting commands or instructions
- NO emojis or symbols (🚫, ✅, 🎯)

REQUIRED OUTPUT FORMAT:
- Start immediately with "Subject: [Your Subject Line]"
- Use plain text only
- Use normal paragraph breaks (empty line between paragraphs)
- End with a simple sign-off like "Best," or "Regards,"
- Maintain professional but human tone throughout

## FINAL EXCELLENCE BENCHMARK

Generate ONLY the email content starting with "Subject:". The output should meet this standard:

"If a Fortune 500 CEO received this email, they would:
1. Read it immediately due to compelling subject line
2. Feel respected and understood by the content
3. Trust the authenticity of the voice
4. Take the requested action willingly
5. Remember the communication as exceptionally professional"

REMEMBER: You are "${business}" writing for "${context}". No hallucinations, no invented details, no corporate bullshit. Every word must be strategically intentional and authentically human.

BENCHMARK QUESTION: Would the actual business owner send this exact email to achieve their stated purpose? If not, revise until true.
`;

    console.log("📝 Generating email for user:", user.id);

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,             // Balanced creativity/consistency
        max_tokens: 800,             // Much longer for detailed prompts
        top_p: 0.0,
        frequency_penalty: 0.5,       // Stronger penalty for repetition
        presence_penalty: 0.5,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || "Error generating email.";
    email = cleanAIResponse(email);

    if (!email.startsWith("Subject:")) {
      email = "Subject: Professional Communication\n\n" + email;
    }

    // Save to history (async, don't wait)
    saveEmailToHistory(user.id, business, context, tone, email);

    // Update email count
    if (user.plan === 'free') {
      await pool.query(
        'UPDATE users SET emails_used = emails_used + 1 WHERE id = $1',
        [user.id]
      );
    }

    res.json({ email });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({ error: "Error generating email. Please try again." });
  }
});

// Polish edited email - FREE (doesn't count against email limit)
app.post("/api/polish-email", authenticateToken, async (req, res) => {
  const { originalEmail, editedEmail } = req.body;
  
  if (!originalEmail || !editedEmail) {
    return res.status(400).json({ error: "Both original and edited email are required" });
  }

  try {
    console.log('✨ Polishing edited email...');

    const prompt = `You are an email editor. The user made edits to an AI-generated email. Your job is to:

1. Keep ALL the user's edits and changes intact
2. Make the edited parts flow naturally with the rest of the email
3. Fix any grammar, punctuation, or formatting issues
4. Ensure consistent tone and style throughout
5. Keep the same structure and formatting as the original

ORIGINAL EMAIL:
${originalEmail}

USER'S EDITED VERSION:
${editedEmail}

IMPORTANT RULES:
- Preserve the user's intended changes completely
- Only polish grammar, punctuation, and flow
- Do NOT rewrite or change the user's edits
- Make edited sections blend seamlessly with unchanged sections
- Maintain the original email's tone and formality

Return ONLY the polished email, nothing else.`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",  // CRITICAL - much more capable model
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,             // Balanced creativity/consistency
        max_tokens: 1000,             // Much longer for detailed prompts
      }),
    });

    const data = await groqResponse.json();
    let polishedEmail = data.choices?.[0]?.message?.content?.trim() || editedEmail;

    // Clean up any AI prefixes
    polishedEmail = polishedEmail.replace(/^(Here is|Here's) (the )?(polished|refined|edited) (version of the )?email:\s*/i, '');
    polishedEmail = polishedEmail.replace(/^(Based on your edits, here( is|'s))?/i, '');
    polishedEmail = polishedEmail.trim();

    console.log('✅ Email polished successfully');

    res.json({
      polishedEmail: polishedEmail || editedEmail,
      success: true
    });
  } catch (error) {
    console.error("Polish error:", error);
    res.json({
      polishedEmail: editedEmail,
      success: false,
      message: "Polishing failed, returning your edits"
    });
  }
});

// Send email endpoint
app.post("/api/send-email", authenticateToken, async (req, res) => {
  const { to, subject, content, businessName, replyToEmail } = req.body;
  
  console.log('📧 Send email request:', { to, subject, businessName, replyToEmail, hasContent: !!content });
  
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

  // More lenient email validation
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
    const formattedContent = formatEmailContent(content, businessName);

    console.log('📤 Sending via SendGrid...');

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
      console.log('✅ Email sent successfully');
      res.json({
        success: true,
        message: "Email sent successfully",
        replyTo: replyToEmail
      });
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

// Smart Reply - Generate reply suggestions
app.post("/api/smart-reply", authenticateToken, rateLimit(10, 60000), async (req, res) => {
  const { emailContent, context } = req.body;
  
  if (!emailContent) {
    return res.status(400).json({ error: "Email content is required" });
  }

  try {
    console.log('🤖 Generating smart reply...');

    const prompt = `You are an email reply assistant. Read the email below and generate 3 different reply options.

EMAIL RECEIVED:
${emailContent}

${context ? `ADDITIONAL CONTEXT: ${context}` : ''}

Generate 3 reply options:
1. A brief, professional reply (2-3 sentences)
2. A detailed, thoughtful reply (4-6 sentences)
3. A friendly, conversational reply (3-4 sentences)

Format each reply with a "Reply Option X:" prefix.
Return ONLY the 3 reply options, nothing else.`;

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
      // Fallback: return as single option
      replyOptions.push({
        id: 1,
        type: 'general',
        content: replies
      });
    }

    console.log('✅ Smart replies generated');

    res.json({
      success: true,
      replies: replyOptions
    });
  } catch (error) {
    console.error("Smart reply error:", error);
    res.status(500).json({ 
      error: "Failed to generate replies. Please try again.",
      success: false
    });
  }
});

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
  res.send("✅ LetiMail backend running - Simple registration, AI polish feature included");
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
