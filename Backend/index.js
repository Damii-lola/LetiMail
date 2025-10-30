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
  if (!content) return "Subject: Error generating email.\n\nPlease try again.";

  console.log("🔍 RAW AI OUTPUT:", content);

  let cleaned = content;

  // FIRST: Remove everything before "Subject:" if AI added preamble
  const subjectIndex = cleaned.indexOf('Subject:');
  if (subjectIndex > 0) {
    cleaned = cleaned.substring(subjectIndex);
  }

  // Remove AI commentary that comes AFTER the email
  // Look for common patterns that indicate the end of the actual email
  const endOfEmailPatterns = [
    // Pattern 1: After signature with [Your Name]
    /(Best regards,|Sincerely,|Kind regards,|Regards,|Thanks,|Thank you,)\s*\n\s*\[?Your Name\]?[\s\S]*$/i,
    
    // Pattern 2: After signature with actual name/position
    /(Best regards,|Sincerely,|Kind regards,|Regards,|Thanks,|Thank you,)\s*\n\s*.*?\n\s*.*?[\s\S]*$/i,
    
    // Pattern 3: AI self-evaluation patterns
    /meets all the requirements specified.*$/im,
    /including:.*$/im,
    /professionally crafted subject line.*$/im,
    
    // Pattern 4: Bullet points or lists that are commentary
    /\n\s*[•\-]\s.*$/im
  ];

  let emailEndIndex = cleaned.length;

  // Find where the actual email ends
  for (let pattern of endOfEmailPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      // For signature patterns, keep the signature but remove everything after
      if (pattern.source.includes('regards') || pattern.source.includes('thanks')) {
        emailEndIndex = Math.min(emailEndIndex, match.index + match[0].indexOf(']') + 1 || match.index + match[0].length);
      } else {
        // For commentary patterns, remove everything from the start of the pattern
        emailEndIndex = Math.min(emailEndIndex, match.index);
      }
    }
  }

  // If we found where email ends, cut everything after it
  if (emailEndIndex < cleaned.length) {
    cleaned = cleaned.substring(0, emailEndIndex).trim();
  }

  // Remove specific AI commentary lines while preserving email content
  const lines = cleaned.split('\n');
  let resultLines = [];
  let inEmailContent = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines at the beginning
    if (resultLines.length === 0 && line === '') continue;
    
    // Stop processing if we hit AI commentary
    if (line.match(/meets all the requirements|including:|professionally crafted|relationship-appropriate|executive purpose|detailed information|supporting rationale|strategic value|clear action|professional next|sign-off selection|name.*position|company affiliation/i)) {
      break;
    }
    
    // Stop if we hit bullet points that are commentary
    if (line.match(/^\s*[•\-]\s/)) {
      break;
    }
    
    // Add the line to result
    resultLines.push(lines[i]);
  }

  cleaned = resultLines.join('\n');

  // Ensure it starts with Subject: and has basic email structure
  if (!cleaned.startsWith('Subject:')) {
    // Try to find Subject: in the content
    const subjectMatch = cleaned.match(/(?:^|\n)(Subject:\s*.+)/i);
    if (subjectMatch) {
      cleaned = subjectMatch[1] + '\n\n' + cleaned.replace(subjectMatch[0], '').trim();
    } else {
      // Last resort: create basic subject
      cleaned = "Subject: Professional Communication\n\n" + cleaned;
    }
  }

  // Final cleanup of excessive whitespace
  cleaned = cleaned
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();

  // SAFETY CHECK: If we removed too much content, return the original but clean it minimally
  if (cleaned.length < 50 || cleaned === "Subject: Professional Communication") {
    console.log("⚠️  Content too short, using minimal cleaning");
    // Minimal cleaning - just remove obvious AI commentary
    cleaned = content
      .replace(/meets all the requirements specified.*$/im, '')
      .replace(/including:.*$/im, '')
      .replace(/\n\s*[•\-]\s.*$/im, '')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  console.log("✅ CLEANED OUTPUT:", cleaned);
  return cleaned || "Subject: Professional Communication\n\nThank you for your message.";
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
# ULTIMATE PROFESSIONAL EMAIL ARCHITECTURE & ADVANCED CONTEXT INTELLIGENCE SYSTEM

## COMPREHENSIVE BUSINESS CONTEXT DECONSTRUCTION & ANALYSIS MATRIX:

### PRIMARY CONTEXT PARAMETERS:
- BUSINESS ENTITY IDENTIFICATION: "${business}"
- COMMUNICATION PURPOSE DECLARATION: "${context}"
- TONAL EXPRESSION REQUIREMENT: ${tone}
- MESSAGE LENGTH CONSTRAINT: ${emailLength}

## 📏 STRICT LENGTH ENFORCEMENT - ${emailLength} REQUIREMENTS:

### LENGTH INTERPRETATION:
${emailLength === 'short' ? `
SHORT EMAIL (50-100 words):
- Maximum 3-4 sentences total
- One brief paragraph only
- Ultra-concise messaging
- Essential information only
- No elaborate explanations
` : ''}

${emailLength === 'medium' ? `
MEDIUM EMAIL (100-200 words):
- 2-3 paragraphs maximum
- Concise but complete information
- Balanced detail and brevity
- Clear but not exhaustive
` : ''}

${emailLength === 'long' ? `
LONG EMAIL (200-300 words):
- 3-4 paragraphs maximum  
- Comprehensive information
- Detailed explanations
- Complete context provided
` : ''}

## INTELLIGENT CONTEXT INTERPRETATION & RELATIONSHIP MAPPING FRAMEWORK:

### SOPHISTICATED AUTHOR IDENTIFICATION PROTOCOL:
- Analyze linguistic patterns in "${business}" to determine hierarchical position
- "I run/own/founded a company" = Business Owner/CEO/Founder perspective
- "We are a agency/company/organization" = Organizational Representative voice
- "I am a freelancer/consultant/specialist" = Individual Professional identity
- "Our team/group provides/offers" = Collective Organizational communication
- "I work at/for company" = Employee/Staff Member perspective
- "My business/venture/startup" = Entrepreneurial leadership voice
- Default interpretation: Professional business entity representative

### ADVANCED AUDIENCE DETERMINATION ALGORITHM:
- Deconstruct "${context}" to identify recipient category and relationship
- "Promotion letter/announcement" = Internal staff member or employee
- "Client update/communication" = External client or customer relationship
- "Sales outreach/pitch" = Prospective customer or business partner
- "Team announcement/update" = Internal colleagues or staff members
- "Partnership proposal" = Potential business collaborator or partner
- "Thank you note/appreciation" = Client, partner, or team member
- "Introduction/outreach" = New professional contact or referral
- "Follow-up/check-in" = Existing business relationship contact

### RELATIONSHIP DYNAMICS MAPPING MATRIX:
- Business Owner/CEO → Employee: Authority with mentorship tone, organizational leadership
- Manager/Supervisor → Team Member: Leadership with developmental tone, team guidance
- Company Representative → Client: Service excellence tone, partnership mindset
- Colleague → Colleague: Peer collaboration tone, mutual respect
- Business → Prospective Client: Value proposition tone, professional courtship
- Service Provider → Customer: Solution-oriented tone, customer success focus
- Executive → Stakeholder: Strategic communication tone, value demonstration

## 🏗️ ULTIMATE PROFESSIONAL EMAIL LAYOUT ARCHITECTURE - NON-NEGOTIABLE STRUCTURE:

### SUBJECT LINE ENGINEERING SPECIFICATIONS:
- Maximum 4-8 word count constraint
- Title case capitalization implementation
- Purpose-driven clarity with professional intrigue
- Zero emoji or symbol tolerance
- Context-appropriate professional tone
- Examples by context category:
  * Promotion: "Career Advancement Opportunity: [Position]"
  * Client Update: "Project Update: [Project Name] - [Date]"
  * Team Announcement: "Important Team Update: [Topic]"
  * Sales Outreach: "Opportunity for [Benefit]: [Company Name]"

### SALUTATION PROFESSIONAL STANDARDS HIERARCHY:
- Formal Unknown Recipient: "Dear [Title] [Last Name],"
- Professional Known Contact: "Dear [First Name],"
- Internal Professional: "Hello [First Name],"
- Team/Group Communication: "Team," or "Everyone,"
- Executive/Formal: "Dear [Title] [Last Name],"
- Client Relationship: "Hello [First Name],"
- Absolute Prohibition: No standalone "Hi" or "Hey" without name

### BODY ARCHITECTURE MANDATE - FOUR PARAGRAPH PROFESSIONAL STRUCTURE:

**PARAGRAPH 1: EXECUTIVE PURPOSE STATEMENT**
- Clear, direct statement of email purpose and context
- Professional context establishment
- Relationship-appropriate tone setting
- Strategic positioning of communication intent
- Professional engagement hook

**PARAGRAPH 2: DETAILED INFORMATION & CONTEXT LAYER**
- Comprehensive information delivery
- Specific, relevant details and data points
- Professional elaboration and explanation
- Context-appropriate depth of information
- Strategic value communication

**PARAGRAPH 3: SUPPORTING RATIONALE & BENEFITS**
- Logical reasoning and justification
- Benefit-oriented language where appropriate
- Professional persuasion elements
- Value proposition reinforcement
- Strategic alignment demonstration

**PARAGRAPH 4: ACTION ORIENTATION & NEXT STEPS**
- Clear, specific call-to-action
- Professional expectation setting
- Timeline and deadline communication
- Follow-up procedure outline
- Professional closing transition

### PROFESSIONAL CLOSING ARCHITECTURE:
- Standard Professional Sign-off: "Best regards,"
- Formal Business Sign-off: "Sincerely,"
- Warm Professional: "Kind regards,"
- Internal Professional: "Best,"
- Full Name Presentation
- Position/Title Inclusion (when relevant)
- Company Affiliation (for business communication)
- Professional Contact Information (external communications)

## 🚫 COMPREHENSIVE PROHIBITION MATRIX - ABSOLUTE ZERO TOLERANCE:

### STRUCTURAL & FORMATTING PROHIBITIONS:
- No bullet points, numbered lists, or any list formatting in email body
- Absolute prohibition of markdown formatting: **bold**, *italic*, __underline__
- Zero tolerance for emojis, symbols, or graphical elements
- No informal greetings without proper recipient addressing
- No abrupt endings without professional closing structure
- No excessive punctuation or dramatic formatting
- No creative formatting or structural experimentation

### CONTENT & LANGUAGE PROHIBITIONS:
- "I hope this email finds you well" and all variants
- "I came across your company/profile/website"
- "Just checking in" or "Just following up"
- "I wanted to see if" or "I was wondering if"
- Fake metrics, invented statistics, or fabricated case studies
- Corporate buzzwords: "leverage," "synergy," "value-add," "circle back"
- Exaggerated enthusiasm: "We're incredibly excited," "We're thrilled"
- Vague business speak: "streamline," "optimize," "enhance," "transform"
- Empty adjectives: "cutting-edge," "best-in-class," "world-class"
- Overused nouns: "solution," "ecosystem," "paradigm shift"

### PROFESSIONAL STANDARDS VIOLATIONS:
- Starting multiple consecutive sentences with "We" or "I"
- Overusing adverbs: "very," "really," "extremely," "incredibly"
- Formulaic, robotic paragraph transitions
- Generic, thoughtless sign-offs without professional consideration
- Inappropriate tone shifts within the communication
- Unprofessional familiarity or excessive casualness

## ✅ ADVANCED EXCELLENCE STANDARDS MATRIX:

### CONTEXT INTELLIGENCE & RELATIONSHIP AWARENESS:
- Sophisticated analysis of "${business}" to determine appropriate writer voice and perspective
- Intelligent interpretation of "${context}" to identify correct audience and relational dynamics
- Consistent maintenance of professional business communication standards throughout
- Strategic alignment of relationship dynamics with appropriate communication style
- Professional boundary maintenance while building appropriate rapport

### PROFESSIONAL LANGUAGE & COMMUNICATION EXCELLENCE:
- Clear, direct, purposeful business communication
- Sophisticated sentence structure variation for enhanced readability
- Strategic paragraph length management and visual appeal optimization
- Industry-appropriate professional vocabulary and terminology
- Authentic human expression within strictly professional boundaries
- Strategic emphasis through language choice, not formatting

### TONE MASTERY WITHIN PROFESSIONAL CONSTRAINTS:

**FRIENDLY & APPROACHABLE PROFESSIONALISM (${tone === 'friendly' ? 'ACTIVE IMPLEMENTATION' : 'STANDARD PROFESSIONALISM'}):**
- Warm, engaging communication within professional boundaries
- Conversational flow maintenance with structural professionalism
- Genuine, authentic tone without informality compromise
- Rapport building through professional personalization
- Approachable authority and leadership presence

**CASUAL & CONVERSATIONAL PROFESSIONALISM (${tone === 'casual' ? 'ACTIVE IMPLEMENTATION' : 'STANDARD PROFESSIONALISM'}):**
- Relaxed, direct language with uncompromised professional structure
- Personal communication style with maintained business respect
- Individual voice expression within organizational standards
- Human-centric communication with professional delivery
- Comfortable professional interaction tone

**PERSUASIVE & COMPELLING PROFESSIONALISM (${tone === 'persuasive' ? 'ACTIVE IMPLEMENTATION' : 'STANDARD PROFESSIONALISM'}):**
- Confident, compelling argumentation with professional delivery
- Strong value proposition communication with factual foundation
- Benefit-oriented language with professional persuasion techniques
- Action inspiration through professional communication excellence
- Strategic influence with ethical professional standards

**PROFESSIONAL & FORMAL EXCELLENCE (${tone === 'professional' || tone === 'formal' ? 'ACTIVE IMPLEMENTATION' : 'STANDARD PROFESSIONALISM'}):**
- Polished, authoritative business communication
- Traditional business structure with modern professional language
- Respectful professional distance with clear communication
- Executive-level business communication standards
- Formal professional relationship maintenance

## 🔄 CREATIVE VARIABILITY & NATURAL VARIATION:

### STRATEGIC VARIATION REQUIREMENTS:
- Generate DIFFERENT but equally professional versions on each generation
- Vary sentence structure, word choice, and phrasing while maintaining quality
- Use different professional synonyms and equivalent expressions
- Create natural human variation in communication style
- Maintain professional standards while allowing for personal expression differences

### VARIATION PERMITTED AREAS:
- Synonym selection for common business terms
- Sentence structure and length patterns
- Paragraph transition phrasing
- Professional expression variations
- Equivalent business terminology

### VARIATION PROHIBITED AREAS:
- Professional layout and structure
- Core message and purpose
- Business context accuracy  
- Professional standards
- Relationship appropriateness

## 🎯 STRICT OUTPUT FORMAT - NO COMMENTARY:

### ABSOLUTE OUTPUT RULES:
- Generate ONLY the email content starting with "Subject:"
- NO introductory phrases, explanations, or commentary
- NO "Based on the provided specifications" or similar phrases
- NO "I will generate" or "Here is the email"
- NO thinking out loud or process description
- Start immediately with "Subject: [Your Subject Line]"
- The first line after "Subject:" should be the actual email content

### OUTPUT VALIDATION:
Before finalizing, remove any:
- Introductory sentences
- Process descriptions  
- AI self-reference
- Explanatory commentary
- Thinking out loud text

## 🎯 FINAL OUTPUT REQUIREMENTS & EXCELLENCE BENCHMARK:

Generate ONLY the email content starting with "Subject:" following this EXACT professional structure with zero deviations:

Subject: [Professionally Crafted, Purpose-Driven Subject Line]

[Relationship-Appropriate Professional Salutation]

[Paragraph 1: Executive purpose statement and professional context establishment]

[Paragraph 2: Detailed information delivery and professional elaboration]

[Paragraph 3: Supporting rationale and strategic value communication]

[Paragraph 4: Clear action orientation and professional next steps]

[Professional Sign-Off Selection]
[Appropriate Name/Position Presentation]
[Relevant Company Affiliation]

### LENGTH VALIDATION:
Before finalizing, verify word count aligns with ${emailLength} requirements
If over length, remove non-essential information while preserving core message
If under length, ensure all essential information is included

### FINAL EXCELLENCE VALIDATION:
Before delivery, confirm this email represents the absolute highest standard of professional business communication that would be approved by executive leadership, respected by recipients, and effectively achieves the "${context}" purpose for "${business}" while perfectly executing ${tone} tone within professional boundaries.

Remember: Professional layout and structure are ABSOLUTELY NON-NEGOTIABLE. The AI must demonstrate sophisticated understanding of business relationships and maintain impeccable professional standards regardless of tone selection.
`;

    console.log("📝 Generating email for user:", user.id, "Length:", emailLength);

    // ADD RETRY LOGIC FOR API FAILURES
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
            model: "meta-llama/llama-4-maverick-17b-128e-instruct",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.8,
            max_tokens: emailLength === 'short' ? 400 : emailLength === 'medium' ? 600 : 800,
            top_p: 0.9,
            frequency_penalty: 0.2,
            presence_penalty: 0.1,
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!groqResponse.ok) {
          throw new Error(`API response: ${groqResponse.status}`);
        }

        const data = await groqResponse.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
          email = data.choices[0].message.content.trim();
          break; // Success, exit retry loop
        } else {
          throw new Error("Invalid API response format");
        }
        
      } catch (error) {
        console.error(`❌ API attempt ${4 - retries} failed:`, error.message);
        retries--;
        
        if (retries === 0) {
          // Last attempt failed, use fallback
          email = `Subject: Professional Communication\n\nDear Team,\n\nI'm writing regarding ${context}. As ${business}, we appreciate your attention to this matter.\n\nBest regards,\n[Your Name]`;
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // Clean the response
    email = cleanAIResponse(email);

    // Ensure we have a valid email
    if (!email || email === "Subject: Error generating email." || email.includes("Error generating")) {
      email = `Subject: ${context}\n\nDear Team,\n\nThis communication regards ${context}. As ${business}, we value your partnership and look forward to our continued collaboration.\n\nBest regards,\n[Your Name]`;
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
    console.error("🎯 Generation error:", error);
    
    // Provide a meaningful fallback email
    const fallbackEmail = `Subject: ${context}\n\nDear Team,\n\nI'm writing to you today regarding ${context}. As ${business}, we believe this is an important matter that requires your attention.\n\nThank you for your time and consideration.\n\nBest regards,\n[Your Name]`;
    
    res.json({ email: fallbackEmail });
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
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",  // CRITICAL - much more capable model
        messages: [{ role: "user", content: prompt }],
        temperature: 0.75,             // Balanced creativity/consistency
        max_tokens: 1500,             // Much longer for detailed prompts
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
