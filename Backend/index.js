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

  // Remove everything before the first "Subject:" line
  const subjectIndex = cleaned.search(/(^|\n)Subject:/i);
  if (subjectIndex !== -1) {
    cleaned = cleaned.substring(subjectIndex).replace(/^\s*\n?/, '');
  }

  const lines = cleaned.split('\n');
  const filtered = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!started && trimmed === '') continue;
    if (trimmed.match(/^Subject:/i)) started = true;
    if (!started) continue;

    // Stop at any AI commentary markers
    if (trimmed.match(/^(Here is|Here's|meets all the|including:|professionally crafted|relationship-appropriate|executive purpose|I hope this helps|Let me know if you need)/i)) break;
    if (trimmed.match(/^[•\-]\s/)) break;

    filtered.push(line);
  }
  cleaned = filtered.join('\n').trim();

  // Make sure it starts with Subject:
  if (!cleaned.match(/^Subject:/i)) {
    cleaned = 'Subject: Professional Communication\n\n' + cleaned;
  }

  // Basic formatting
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

// ⭐ Email generation – strict tone & length with examples
app.post("/api/generate", ipRateLimit(10, 60000), async (req, res) => {
  const { business, context, tone, emailLength } = req.body;
  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
  }

  // Map lengths to sentence targets and token limits
  const lengthSettings = {
    short:  { sentences: "15-20 sentences", tokens: 400 },
    medium: { sentences: "20-25 sentences", tokens: 800 },
    long:   { sentences: "25+ sentences",  tokens: 1200 }
  };
  const selectedLength = lengthSettings[emailLength] || lengthSettings.medium;

  // Few-shot examples for tone & length (using a neutral business context)
  const toneExamples = {
    friendly: `Subject: Catching up!
Hey Alex,

Hope you’re having a fantastic week! I just wanted to touch base about the collaboration we discussed. It’s been a while and I miss our chats. Let me know when you’re free for a quick call – I’d love to hear how things are going on your end.

Take care,
[Your Name]`,
    professional: `Subject: Follow-Up on Proposed Collaboration
Dear Alex,

I hope this message finds you well. I am writing to follow up regarding the collaboration opportunity we previously discussed. I would appreciate the chance to align our next steps and clarify any outstanding points.

Please let me know a convenient time for a brief call or if you prefer to communicate via email. Thank you for your time and consideration.

Best regards,
[Your Name]`,
    casual: `Subject: Hey! Quick check in
Hey Alex,

Just wanted to drop you a line and see how things are going. Haven't heard from you in a bit, so thought I’d say hi. Let me know what's new when you have a sec.

Cheers,
[Your Name]`,
    formal: `Subject: Request for Confirmation of Meeting
Dear Mr. Smith,

I am writing to formally request confirmation of the meeting scheduled for next Tuesday at 10:00 AM GMT. I would be grateful if you could confirm your availability at your earliest convenience.

Should any adjustments be required, please do not hesitate to inform me. I look forward to our discussion.

Yours sincerely,
[Your Name]`,
    persuasive: `Subject: Don’t Miss Out – Limited Opportunity
Hi Alex,

Time is running out! I wanted to personally make sure you saw this incredible opportunity that could double your results in just 30 days. Over 500 businesses have already signed up and are seeing immediate ROI – you can’t afford to be left behind.

Click the link below to secure your spot before the deadline. Let me know if you have any questions – I’m here to help you succeed.

Act now,
[Your Name]`
  };

  // Use a system message to seed the AI with exact expectations
  const systemMessage = `You are a world‑class email copywriter who strictly follows instructions.
You will receive a business context, communication purpose, desired tone, and length.
You must produce ONLY the finished email, with no extra text, exactly matching the tone and length.
The email must start with "Subject: " followed by the subject line, then a blank line, then the body.
Do NOT include any explanations, introductions, or closing remarks like "I hope this helps".
Below are exact examples of each tone (these are only examples; do NOT reuse their content, just mimic the style and structure).`;

  const userMessage = `BUSINESS CONTEXT: ${business}
COMMUNICATION PURPOSE: ${context}
TONE: ${tone} (${toneExamples[tone] ? 'see example below' : ''})
LENGTH: ${emailLength} – ${selectedLength.sentences}

EXAMPLE OF A ${tone.toUpperCase()} EMAIL (for style only, not for reuse):
${toneExamples[tone] || 'No example available, but strictly follow the tone definition.'}

Write the complete email now. Remember: ${selectedLength.sentences}, ${tone} tone, and no extra words.`;

  let email = "Subject: Error generating email.\n\nPlease try again.";
  let retries = 2;

  while (retries > 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 40000);

      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",   // ★ latest, best LLaMA on Groq
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: selectedLength.tokens,
          top_p: 0.95,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!groqResponse.ok) throw new Error(`API response: ${groqResponse.status}`);
      const data = await groqResponse.json();
      if (data.choices?.[0]?.message?.content) {
        email = data.choices[0].message.content.trim();
        // Quick validation
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
        // Fallback that respects tone and length
        const fallbackSubject = `Re: ${context.substring(0, 50)}`;
        let fallbackBody = '';
        switch (emailLength) {
          case 'short':
            fallbackBody = tone === 'friendly' ? `Hey, just checking on ${context}. Let me know!` :
                           tone === 'professional' ? `I wanted to follow up regarding ${context}. Please advise.` :
                           tone === 'formal' ? `I am writing to inquire about ${context}. I await your response.` :
                           `Wanted to reach out about ${context}. Talk soon!`;
            break;
          case 'medium':
            fallbackBody = tone === 'friendly' ? `Hi! Hope you're great. I'm reaching out about ${context}. Let's catch up soon.` :
                           tone === 'professional' ? `I am following up on ${context} and would appreciate your feedback. Please let me know a convenient time to discuss.` :
                           tone === 'formal' ? `I would like to formally request an update regarding ${context}. I look forward to your reply.` :
                           `I'm circling back on ${context}. If you need more info, just reply.`;
            break;
          case 'long':
            fallbackBody = tone === 'friendly' ? `Hey, I've been thinking about ${context} and would love to dive deeper. Let's schedule a proper chat.` :
                           tone === 'professional' ? `I am writing to provide a comprehensive follow-up on ${context}. As previously discussed, there are several action items we need to address.` :
                           tone === 'formal' ? `I am writing to formally address the matter of ${context}. I would be grateful if you could provide a detailed response at your earliest convenience.` :
                           `I've been meaning to touch base about ${context} – it's important and I'd love to hear your perspective.`;
            break;
        }
        email = `Subject: ${fallbackSubject}\n\nDear [Recipient],\n\n${fallbackBody}\n\nBest regards,\n[Your Name]`;
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  email = cleanAIResponse(email);
  console.log(`Generated email (${tone}/${emailLength})`);
  res.json({ email });
});

// ── Polish email (unchanged) ─────────────────────────
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
        model: "llama-3.3-70b-versatile",
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

// ── Send email (unchanged) ───────────────────────────
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

// ── Smart reply (unchanged) ──────────────────────────
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
        model: "llama-3.3-70b-versatile",
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
