// Backend/index.js
// Minimal Express backend:
// - POST /generate -> calls Groq LLM, returns subject + body
// - POST /send -> sends email via SendGrid and logs to Supabase
// - POST /save-draft -> stores draft in Supabase
//
// Env vars required:
// - GROQ_API_KEY
// - GROQ_MODEL (e.g., "llama-3.1-8b-instant")
// - SUPABASE_URL
// - SUPABASE_SERVICE_KEY
// - SENDGRID_API_KEY
// - FROM_EMAIL (verified sender in SendGrid)

import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const {
  GROQ_API_KEY,
  GROQ_MODEL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SENDGRID_API_KEY,
  FROM_EMAIL,
  PORT = 3000
} = process.env;

if(!GROQ_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SENDGRID_API_KEY || !FROM_EMAIL) {
  console.warn('Missing one or more env vars. Please set GROQ_API_KEY, SUPABASE_*, SENDGRID_API_KEY, FROM_EMAIL');
}

sgMail.setApiKey(SENDGRID_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();
app.use(cors());
app.use(express.json({limit: '50kb'}));

/**
 * Helper: builds a prompt with user context and optional edits for recompile
 */
function buildPrompt({business_context, email_context, tone, edits}) {
  // Keep it structured and small. Add a few examples inline if needed.
  let prompt = `You are a professional email writer. The user runs a business described here:\n"${business_context}"\n\n`;
  prompt += `Write a short subject line and a clear email body for this purpose:\n"${email_context}"\n\n`;

  prompt += `Tone: ${tone}. Write as if the sender is professional and authentic. Keep email concise (~6-12 sentences).\n`;
  if (edits) {
    prompt += `\nThe user edited the email to the following. Use the edits to improve the next generation and preserve the user's voice:\n"${edits}"\n`;
  }

  prompt += `\nReturn JSON ONLY with keys: subject, body.\n`;
  return prompt;
}

/** POST /generate
 * body: { business_context, email_context, tone, recipient (optional), edits (optional) }
 */
app.post('/generate', async (req, res) => {
  try {
    const { business_context = '', email_context = '', tone = 'neutral', edits = null } = req.body;
    if (!email_context || !business_context) {
      return res.status(400).json({ error: 'business_context and email_context required' });
    }

    const prompt = buildPrompt({ business_context, email_context, tone, edits });

    // Call Groq / LLM
    // Example Groq API usage — adapt if their API differs; this is template style
    const groqResp = await fetch(`https://api.groq.ai/v1/models/${encodeURIComponent(process.env.GROQ_MODEL || 'llama-3.1-8b-instant')}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        max_tokens: 600,
        temperature: 0.2
      })
    });

    const groqJson = await groqResp.json();
    // groqJson structure might differ by provider — adjust parsing as needed
    // Attempt common patterns:
    let text = '';
    if (groqJson?.output && Array.isArray(groqJson.output) && groqJson.output[0]?.content) {
      // hypothetical structure
      text = groqJson.output[0].content;
    } else if (groqJson?.text) {
      text = groqJson.text;
    } else {
      text = JSON.stringify(groqJson).slice(0, 2000);
    }

    // Try to parse JSON from the model output; fallback to naive split:
    let subject = '';
    let body = '';
    try {
      const parsed = JSON.parse(text);
      subject = parsed.subject || '';
      body = parsed.body || '';
    } catch (err) {
      // fallback: split first line as subject if it seems like it
      const lines = text.trim().split('\n').filter(Boolean);
      if (lines.length > 1 && lines[0].length < 120) {
        subject = lines[0];
        body = lines.slice(1).join('\n\n');
      } else {
        body = text;
      }
    }

    // Return generated subject + body
    return res.json({ subject, body });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Generation failed', details: err.message });
  }
});

/** POST /send
 * body: { recipient, subject, body, user_id (optional) }
 */
app.post('/send', async (req, res) => {
  try {
    const { recipient, subject, body, user_id = null } = req.body;
    if (!recipient || !body) return res.status(400).json({ error: 'recipient and body required' });

    const msg = {
      to: recipient,
      from: FROM_EMAIL,
      subject: subject || 'Message from you',
      text: body,
      html: body.replace(/\n/g, '<br/>')
    };

    await sgMail.send(msg);

    // Log to Supabase 'emails' table
    const id = uuidv4();
    await supabase.from('emails').insert([{
      id, user_id, recipient, subject, body, status: 'sent'
    }]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('send error', err);
    return res.status(500).json({ error: 'Send failed', details: err.message });
  }
});

/** POST /save-draft
 * body: { subject, body, user_id (optional) }
 */
app.post('/save-draft', async (req, res) => {
  try {
    const { subject, body, user_id = null } = req.body;
    const id = uuidv4();
    await supabase.from('emails').insert([{
      id, user_id, recipient: null, subject, body, status: 'draft'
    }]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('save draft', err);
    return res.status(500).json({ error: 'Save failed', details: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
