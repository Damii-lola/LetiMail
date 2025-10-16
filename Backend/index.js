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

// Enhanced HTML email formatting
function formatEmailContent(content, senderName) {
  // Remove Subject line from content
  let emailBody = content.replace(/^Subject:\s*.+\n?/i, '').trim();
  
  // Convert plain text to HTML with proper formatting
  let htmlContent = convertTextToHTML(emailBody);
  
  // Create beautiful HTML email template
  const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${extractSubject(content) || 'Professional Email'}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9f9f9;
    }
    .email-container {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .email-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .email-header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .email-body {
      padding: 40px;
    }
    .email-content {
      font-size: 16px;
      line-height: 1.7;
    }
    .email-content p {
      margin-bottom: 16px;
    }
    .email-signature {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #f0f0f0;
    }
    .sender-name {
      font-size: 18px;
      font-weight: bold;
      color: #667eea;
      margin-bottom: 5px;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #6c757d;
      font-size: 14px;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .bullet-points {
      margin: 20px 0;
      padding-left: 20px;
    }
    .bullet-points li {
      margin-bottom: 8px;
      position: relative;
    }
    .highlight-box {
      background: #f8f9ff;
      border-left: 4px solid #667eea;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    @media only screen and (max-width: 600px) {
      .email-body {
        padding: 20px;
      }
      body {
        padding: 10px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>${extractSubject(content) || 'Professional Communication'}</h1>
    </div>
    
    <div class="email-body">
      <div class="email-content">
        ${htmlContent}
      </div>
      
      <div class="email-signature">
        <div class="sender-name">${senderName || 'Professional Contact'}</div>
        <div style="color: #6c757d; font-size: 14px;">
          Sent via LetiMail • Professional Email Assistant
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>
        This email was professionally crafted using 
        <a href="#" style="color: #667eea; text-decoration: none; font-weight: 500;">LetiMail</a>
      </p>
      <p style="font-size: 12px; margin-top: 10px; color: #adb5bd;">
        &copy; 2024 LetiMail. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `;
  
  return htmlEmail;
}

// Convert plain text to formatted HTML
function convertTextToHTML(text) {
  if (!text) return '';
  
  let html = text
    // Convert line breaks to paragraphs
    .split('\n\n')
    .map(paragraph => {
      if (!paragraph.trim()) return '';
      
      // Check if it's a bullet point section
      if (paragraph.includes('•') || paragraph.includes('-')) {
        const lines = paragraph.split('\n');
        const listItems = lines.map(line => {
          const cleanLine = line.replace(/^[•\-]\s*/, '').trim();
          return cleanLine ? `<li>${cleanLine}</li>` : '';
        }).filter(item => item);
        
        if (listItems.length > 0) {
          return `<div class="bullet-points"><ul>${listItems.join('')}</ul></div>`;
        }
      }
      
      // Check if it's an important point (starts with bold indicators)
      if (paragraph.match(/^(Important|Note|Key Point)/i)) {
        return `<div class="highlight-box"><strong>${paragraph.replace(/^(Important|Note|Key Point):?\s*/i, '$1: ')}</strong></div>`;
      }
      
      // Regular paragraph
      return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
  
  return html;
}

// Extract subject from content
function extractSubject(content) {
  const subjectMatch = content.match(/Subject:\s*(.*?)(?:\n|$)/i);
  return subjectMatch ? subjectMatch[1].trim() : null;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
