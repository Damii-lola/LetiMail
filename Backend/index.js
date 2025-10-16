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

  const prompt = `
Write a professional business email that is formal but concise. Get straight to the point while maintaining professional tone.

FORMAL BUT CONCISE PRINCIPLES:
- Professional tone and language
- Clear purpose stated early
- Necessary details only
- Respectful but direct
- 3-4 paragraphs maximum

BUSINESS CONTEXT:
- Business: ${business}
- Purpose: ${context}
- Tone: ${tone}

STRUCTURE:
Subject: [Clear professional subject]

[Professional greeting],

[Paragraph 1: State purpose and context clearly]
[Paragraph 2: Key details or explanation]
[Paragraph 3: Action items or next steps]

[Professional closing],
[Name]

Keep it professional but not overly long. Be clear and direct.

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
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || "Error generating email.";
    
    email = cleanAIResponse(email);
    
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
Apply professional formatting to this email while preserving ALL user content exactly.

USER'S EXACT WORDS (DO NOT CHANGE CONTENT):
${editedEmail}

Make it professionally formatted but keep it concise.

Return ONLY the formatted email starting with "Subject:" if present.
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
        temperature: 0.3,
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

// Premium HTML email formatting with sophisticated typography
function formatEmailContent(content, senderName) {
  let emailBody = content.replace(/^Subject:\s*.+\n?/i, '').trim();
  let htmlContent = convertTextToPremiumHTML(emailBody);
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
    
    .email-content strong {
      font-weight: 600;
      color: #2D3748;
      background: linear-gradient(120deg, #fed7aa 0%, #fed7aa 100%);
      background-repeat: no-repeat;
      background-size: 100% 0.3em;
      background-position: 0 88%;
      padding: 0.1em 0.2em;
      border-radius: 2px;
    }
    
    .email-content em {
      font-style: italic;
      color: #718096;
      font-weight: 500;
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
    
    .bullet-points {
      margin: 30px 0;
      padding-left: 0;
    }
    
    .bullet-points li {
      margin-bottom: 16px;
      padding-left: 30px;
      position: relative;
      font-weight: 400;
    }
    
    .bullet-points li::before {
      content: '▸';
      position: absolute;
      left: 0;
      color: #667eea;
      font-weight: bold;
      font-size: 18px;
    }
    
    .highlight-box {
      background: linear-gradient(135deg, #EBF4FF 0%, #E6FFFA 100%);
      border: 1px solid #BEE3F8;
      border-left: 4px solid #4299E1;
      padding: 25px 30px;
      margin: 30px 0;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(66, 153, 225, 0.1);
    }
    
    .highlight-box strong {
      font-size: 16px;
      color: #2B6CB0;
      display: block;
      margin-bottom: 8px;
    }
    
    .quote {
      font-style: italic;
      font-size: 18px;
      color: #4A5568;
      border-left: 4px solid #CBD5E0;
      padding-left: 24px;
      margin: 30px 0;
      font-weight: 400;
    }
    
    .action-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 32px;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
      transition: all 0.3s ease;
    }
    
    .action-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
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

// Enhanced text to HTML conversion with sophisticated formatting
function convertTextToPremiumHTML(text) {
  if (!text) return '<p>No content available.</p>';
  
  let html = '';
  const paragraphs = text.split('\n\n');
  
  paragraphs.forEach((paragraph, index) => {
    if (!paragraph.trim()) return;
    
    const trimmedPara = paragraph.trim();
    
    // Handle greetings (first paragraph)
    if (index === 0 && (trimmedPara.includes('Dear') || trimmedPara.includes('Hello') || trimmedPara.includes('Hi'))) {
      html += `<div class="greeting">${trimmedPara.replace(/\n/g, '<br>')}</div>`;
      return;
    }
    
    // Handle closings (last paragraph)
    if (index === paragraphs.length - 2 && (trimmedPara.includes('Best') || trimmedPara.includes('Sincerely') || trimmedPara.includes('Regards'))) {
      html += `<div class="closing">${trimmedPara.replace(/\n/g, '<br>')}</div>`;
      return;
    }
    
    // Handle bullet points
    if (trimmedPara.includes('•') || trimmedPara.match(/^\d+\./) || trimmedPara.includes('- ')) {
      const lines = trimmedPara.split('\n');
      let listItems = [];
      
      lines.forEach(line => {
        const cleanLine = line.replace(/^[•\-\d+\.]\s*/, '').trim();
        if (cleanLine) {
          // Add emphasis to key points in lists
          const emphasizedLine = cleanLine
            .replace(/\b(important|key|critical|essential|major)\b/gi, '<strong>$1</strong>')
            .replace(/\b(please note|remember|consider)\b/gi, '<em>$1</em>');
          listItems.push(`<li>${emphasizedLine}</li>`);
        }
      });
      
      if (listItems.length > 0) {
        html += `<ul class="bullet-points">${listItems.join('')}</ul>`;
      }
      return;
    }
    
    // Handle important announcements
    if (trimmedPara.match(/^(important|note|attention|key point)/i)) {
      const cleanPara = trimmedPara.replace(/^(important|note|attention|key point):?\s*/i, '');
      html += `
        <div class="highlight-box">
          <strong>${trimmedPara.match(/^(important|note|attention|key point)/i)[0].toUpperCase()}:</strong>
          ${cleanPara.replace(/\n/g, '<br>')}
        </div>
      `;
      return;
    }
    
    // Handle quotes or special statements
    if (trimmedPara.includes('"') || trimmedPara.match(/^'.*'$/)) {
      html += `<div class="quote">${trimmedPara.replace(/\n/g, '<br>')}</div>`;
      return;
    }
    
    // Handle action items or calls to action
    if (trimmedPara.match(/\b(please|request|suggest|recommend|action required)\b/gi)) {
      const actionPara = trimmedPara
        .replace(/\b(please|kindly)\b/gi, '<strong>$1</strong>')
        .replace(/\b(request|suggest|recommend|action required)\b/gi, '<em>$1</em>');
      html += `<p>${actionPara.replace(/\n/g, '<br>')}</p>`;
      return;
    }
    
    // Regular paragraph with smart formatting
    let formattedPara = trimmedPara
      // Bold important business terms
      .replace(/\b(meeting|deadline|project|proposal|agreement|contract)\b/gi, '<strong>$1</strong>')
      // Italicize descriptive terms
      .replace(/\b(very|quite|rather|extremely|highly)\b/gi, '<em>$1</em>')
      // Bold numbers and dates
      .replace(/(\$\d+|\d+%|\b\d{1,2}\/\d{1,2}\/\d{4}\b)/g, '<strong>$1</strong>')
      // Add emphasis to key actions
      .replace(/\b(submit|complete|review|approve|confirm)\b/gi, '<strong>$1</strong>');
    
    html += `<p>${formattedPara.replace(/\n/g, '<br>')}</p>`;
  });
  
  return html;
}

// Extract subject from content
function extractSubject(content) {
  const subjectMatch = content.match(/Subject:\s*(.*?)(?:\n|$)/i);
  return subjectMatch ? subjectMatch[1].trim() : null;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
