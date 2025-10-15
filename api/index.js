import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { method, url } = req;

  const {
    GROQ_API_KEY,
    GROQ_MODEL,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SENDGRID_API_KEY,
    FROM_EMAIL
  } = process.env;

  sgMail.setApiKey(SENDGRID_API_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Allow CORS for your frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') return res.status(200).end();

  try {
    if (url.endsWith('/generate') && method === 'POST') {
      const body = req.body || (await parseBody(req));
      const { business_context, email_context, tone, edits } = body;

      const prompt = buildPrompt({ business_context, email_context, tone, edits });
      const groqRes = await fetch(`https://api.groq.ai/v1/models/${GROQ_MODEL}/generate`, {
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
      const groqJson = await groqRes.json();
      let text = groqJson?.output?.[0]?.content || groqJson?.text || '';

      let subject = '', emailBody = '';
      try {
        const parsed = JSON.parse(text);
        subject = parsed.subject || '';
        emailBody = parsed.body || '';
      } catch {
        const lines = text.split('\n');
        subject = lines.shift() || 'Follow-up';
        emailBody = lines.join('\n');
      }

      return res.status(200).json({ subject, body: emailBody });
    }

    if (url.endsWith('/send') && method === 'POST') {
      const body = req.body || (await parseBody(req));
      const { recipient, subject, body: emailBody, user_id } = body;

      const msg = {
        to: recipient,
        from: FROM_EMAIL,
        subject,
        text: emailBody,
        html: emailBody.replace(/\n/g, '<br>')
      };
      await sgMail.send(msg);

      await supabase.from('emails').insert([{ recipient, subject, body: emailBody, user_id, status: 'sent' }]);
      return res.status(200).json({ ok: true });
    }

    if (url.endsWith('/save-draft') && method === 'POST') {
      const body = req.body || (await parseBody(req));
      const { subject, body: emailBody, user_id } = body;

      await supabase.from('emails').insert([{ subject, body: emailBody, user_id, status: 'draft' }]);
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}

// ---------- helpers ----------
function buildPrompt({ business_context, email_context, tone, edits }) {
  let prompt = `You are a professional email writer. The sender's business:\n${business_context}\n\n`;
  prompt += `Purpose: ${email_context}\nTone: ${tone}\n`;
  if (edits) prompt += `Refine using these edits:\n${edits}\n`;
  prompt += `Output JSON: {"subject": "...", "body": "..."}`;
  return prompt;
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (err) {
        reject(err);
      }
    });
  });
}
