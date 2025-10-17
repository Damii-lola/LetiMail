import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

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
  res.send("✅ LetiMail backend running with Groq AI");
});

app.post("/generate", async (req, res) => {
  const { business, context, tone } = req.body;
  
  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
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

  const style = humanWritingStyles[tone];

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
    
    res.json({ email });
  } catch (error) {
    console.error("Groq API Error:", error);
    res.status(500).json({ email: "Error connecting to Groq API." });
  }
});

app.post("/refine-email", async (req, res) => {
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
app.post("/send-email", async (req, res) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
