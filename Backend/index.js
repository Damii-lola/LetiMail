import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pkg from 'pg';

const { Pool } = pkg;
const app = express();

// ── CORS Configuration ───────────────────────────────
const allowedOrigins = [
  'https://damii-lola.github.io',
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Database ─────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Simple IP‑based rate limiter
const rateLimitStore = new Map();
function ipRateLimit(max = 10, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    if (!rateLimitStore.has(ip)) rateLimitStore.set(ip, []);
    const timestamps = rateLimitStore.get(ip);
    const recent = timestamps.filter(t => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((recent[0] + windowMs - now) / 1000)
      });
    }
    recent.push(now);
    rateLimitStore.set(ip, recent);
    next();
  };
}

// ── AI Response Cleaner ──────────────────────────────
function cleanAIResponse(content) {
  if (!content) return "Subject: Error generating email.\n\nPlease try again.";
  let cleaned = content;
  const subjectIndex = cleaned.indexOf('Subject:');
  if (subjectIndex > 0) cleaned = cleaned.substring(subjectIndex);

  const lines = cleaned.split('\n');
  const filtered = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!started && trimmed === '') continue;
    if (trimmed.match(/^Subject:/i)) started = true;
    if (!started) continue;

    if (trimmed.match(/^(Here is|Here's|meets all the|including:|professionally crafted|relationship-appropriate|executive purpose)/i)) break;
    if (trimmed.match(/^[•\-]\s/)) break;

    filtered.push(line);
  }
  cleaned = filtered.join('\n').trim();
  if (!cleaned.startsWith('Subject:')) {
    cleaned = 'Subject: Professional Communication\n\n' + cleaned;
  }
  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\$\$?/g, '')
    .trim();
  return cleaned || "Subject: Professional Communication\n\nThank you for your message.";
}

// ── Public Endpoints ─────────────────────────────────
app.get("/", (req, res) => res.send("✅ LetiMail backend running – public access"));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: "error", database: error.message });
  }
});

// ⭐ Email generation – now with STRICT tone & length control
app.post("/api/generate", ipRateLimit(10, 60000), async (req, res) => {
  const { business, context, tone, emailLength } = req.body;
  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
  }

  // Map lengths to target sentence counts and token limits
  const lengthSettings = {
    short:   { sentences: "exactly 4-6 sentences", tokens: 400 },
    medium:  { sentences: "8-12 sentences",          tokens: 800 },
    long:    { sentences: "15+ sentences",           tokens: 1200 }
  };
  const selectedLength = lengthSettings[emailLength] || lengthSettings.medium;

  const prompt = `
You are a world‑class email copywriter. Write an email based EXACTLY on these requirements.

🔹 TONE: "${tone}"
Follow these specific tone rules:
- Friendly: warm, conversational, use "you" often, include one light-hearted phrase.
- Professional: formal but approachable, no slang, clear structure, neutral language.
- Casual: very relaxed, short sentences, maybe a contraction, like chatting with a friend.
- Formal: strict business etiquette, full words (no contractions), polite, impersonal (e.g., "I would like to request...").
- Persuasive: commanding, uses power words, creates urgency, benefits-focused.

🔹 LENGTH: "${emailLength}"
Your email must contain ${selectedLength.sentences}. Each sentence should be meaningful. Do not exceed this length.

🔹 BUSINESS CONTEXT:
${business}

🔹 WHAT TO COMMUNICATE:
${context}

🔹 STRUCTURE:
Start with "Subject: [concise subject line]".
Then a salutation (e.g., "Dear [Name],")
Then the body, following the tone and length.
End with a closing (e.g., "Best regards,") and "[Your Name]".

🔹 CRITICAL RULES:
- The subject line must match the tone and context.
- The body MUST sound exactly like the specified tone.
- Keep the email within the required number of sentences.
- Do NOT add any commentary or text outside the email.
- Do NOT include bullet points or numbered lists.
- Return ONLY the email, nothing else.

Write the email now:
`;

  let email = "Subject: Error generating email.\n\nPlease try again.";
  let retries = 2;

  while (retries > 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      // Use the more capable llama3-70b for better quality
      const model = process.env.AI_MODEL || "llama3-70b-8192";

      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: selectedLength.tokens,
          top_p: 0.95,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!groqResponse.ok) throw new Error(`API response: ${groqResponse.status}`);
      const data = await groqResponse.json();
      if (data.choices?.[0]?.message?.content) {
        email = data.choices[0].message.content.trim();
        // Rough validation: if it's too short, retry
        const sentenceCount = email.split(/[.!?]+/).filter(Boolean).length;
        if (emailLength === 'short' && sentenceCount < 3) throw new Error("Too short");
        if (emailLength === 'long' && sentenceCount < 10) throw new Error("Too short for long");
        break;
      } else {
        throw new Error("Invalid API response format");
      }
    } catch (error) {
      console.error(`❌ Attempt ${3 - retries} failed:`, error.message);
      retries--;
      if (retries === 0) {
        // Fallback email that still respects tone & length
        const fallbackSubject = `Re: ${context.substring(0, 50)}`;
        let fallbackBody = '';
        if (emailLength === 'short') {
          fallbackBody = `I wanted to touch base regarding ${context}. Let me know your thoughts.`;
        } else if (emailLength === 'medium') {
          fallbackBody = `I hope this message finds you well. I am reaching out to discuss ${context}. Please let me know a convenient time to connect.`;
        } else {
          fallbackBody = `I am writing to follow up on our previous conversation about ${context}. As we discussed, there are several important aspects to consider, and I would appreciate your input on the next steps. Please feel free to reply with your availability, and I will ensure everything is aligned. Looking forward to hearing from you.`;
        }
        email = `Subject: ${fallbackSubject}\n\nDear [Recipient],\n\n${fallbackBody}\n\nBest regards,\n[Your Name]`;
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  email = cleanAIResponse(email);
  console.log(`Generated email (${tone}/${emailLength})`);
  res.json({ email });
});

// Polish email
app.post("/api/polish-email", async (req, res) => {
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

Return ONLY the polished email, nothing else.
`;
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });
    const data = await groqResponse.json();
    let polished = data.choices?.[0]?.message?.content?.trim() || editedEmail;
    polished = polished.replace(/^(Here is|Here's) (the )?(polished|refined) (version of the )?email:\s*/i, '').trim();
    res.json({ polishedEmail: polished || editedEmail, success: true });
  } catch (error) {
    console.error("Polish error:", error);
    res.json({ polishedEmail: editedEmail, success: false, message: "Polishing failed, returning your edits" });
  }
});

// Send email
app.post("/api/send-email", async (req, res) => {
  const { to, subject, content, businessName, replyToEmail } = req.body;
  if (!to || !subject || !content || !businessName || !replyToEmail) {
    return res.status(400).json({ error: "All fields are required (to, subject, content, businessName, replyToEmail)" });
  }
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(to) || !emailRegex.test(replyToEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

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
        personalizations: [{ to: [{ email: to }], subject: emailSubject }],
        from: {
          email: process.env.FROM_EMAIL || "noreply@letimail.app",
          name: businessName || "LetiMail User"
        },
        reply_to: { email: replyToEmail, name: businessName },
        content: [{
          type: "text/html",
          value: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>body { font-family: Arial, sans-serif; line-height: 1.6; }</style>
</head>
<body>
  <div class="email-content">
    ${htmlContent}
    <p>--<br>Sent via <strong>LetiMail</strong> - AI Email Assistant</p>
  </div>
</body>
</html>
          `
        }]
      })
    });

    if (sendGridResponse.ok) {
      console.log('✅ Email sent to:', to);
      res.json({ success: true, message: "Email sent" });
    } else {
      const errorData = await sendGridResponse.text();
      console.error("❌ SendGrid Error:", errorData);
      res.status(500).json({ error: "Failed to send email via SendGrid" });
    }
  } catch (error) {
    console.error("❌ Send Email Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Smart reply
app.post("/api/smart-reply", ipRateLimit(20, 60000), async (req, res) => {
  const { emailContent, context } = req.body;
  if (!emailContent) return res.status(400).json({ error: "Email content required" });

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
        model: "llama3-70b-8192",
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
        replyOptions.push({
          id: index + 1,
          type: index === 0 ? 'brief' : index === 1 ? 'detailed' : 'friendly',
          content: match.replace(/Reply Option \d+:/i, '').trim()
        });
      });
    } else {
      replyOptions.push({ id: 1, type: 'general', content: repliesText });
    }
    res.json({ success: true, replies: replyOptions });
  } catch (error) {
    console.error("Smart reply error:", error);
    res.status(500).json({ error: "Failed to generate replies" });
  }
});

// ── Server Start ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 LetiMail backend (public) running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    pool.end(() => {
      console.log('🛑 Server closed');
      process.exit(0);
    });
  });
});
process.on('SIGINT', () => {
  server.close(() => {
    pool.end(() => process.exit(0));
  });
});
