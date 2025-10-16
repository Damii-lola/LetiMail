import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// Function to clean AI comments from responses
function cleanAIResponse(content) {
  if (!content) return content;
  
  // Remove common AI explanatory text patterns
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
    // Spammy phrases
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

  // Check for spam indicators
  for (const pattern of spamIndicators) {
    if (pattern.test(content)) {
      return false;
    }
  }

  // Check for excessive capitalization
  const excessiveCaps = (content.match(/[A-Z]{3,}/g) || []).length;
  if (excessiveCaps > 3) {
    return false;
  }

  // Check for excessive exclamation marks
  const excessiveExclamations = (content.match(/!/g) || []).length;
  if (excessiveExclamations > 2) {
    return false;
  }

  // Ensure content is relevant to business and context
  const businessWords = business.toLowerCase().split(/\s+/);
  const contextWords = context.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();

  let relevanceScore = 0;
  [...businessWords, ...contextWords].forEach(word => {
    if (word.length > 3 && contentLower.includes(word)) {
      relevanceScore++;
    }
  });

  // Require some relevance to the original request
  if (relevanceScore < 2 && businessWords.length + contextWords.length > 3) {
    return false;
  }

  return true;
}

app.get("/", (req, res) => {
  res.send("✅ LetiMail backend running with Groq AI");
});

app.post("/generate", async (req, res) => {
  const { business, context, tone } = req.body;
  
  // Validate input to prevent spam generation
  if (!business || !context) {
    return res.status(400).json({ email: "Business description and context are required." });
  }

  // Check for spammy input patterns
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

  const emotionalProfiles = {
    friendly: {
      primary: "Warmth and genuine connection",
      secondary: "Enthusiasm and approachability", 
    },
    formal: {
      primary: "Respect and professionalism",
      secondary: "Confidence and consideration",
    },
    persuasive: {
      primary: "Conviction and value-focused",
      secondary: "Professional enthusiasm",
    },
    casual: {
      primary: "Relaxed connection",
      secondary: "Authenticity and ease",
    }
  };

  const emotion = emotionalProfiles[tone];

  const prompt = `
Create a legitimate, professional email that provides genuine value. This must be a real business communication, NOT spam.

STRICT ANTI-SPAM REQUIREMENTS:
- NO "act now" or urgency language
- NO "free money" or get-rich-quick schemes
- NO excessive capitalization or exclamation marks
- NO fake offers or deceptive claims
- NO inappropriate or illegal content
- Focus on genuine business value and relationship building

BUSINESS CONTEXT:
- Business: ${business}
- Purpose: ${context}
- Tone: ${tone} (${emotion.primary} with ${emotion.secondary})

EMAIL GUIDELINES:
- Provide legitimate value to the recipient
- Focus on relationship building, not quick sales
- Use professional, authentic language
- Offer genuine insights or helpful information
- Build trust and credibility
- Be transparent and honest

EMAIL STRUCTURE:
Subject: [Professional, non-spammy subject line]

Body:
- Professional greeting
- Clear context and purpose
- Value proposition focused on recipient benefits
- Professional call-to-action (if appropriate)
- Polite closing

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
    
    // Clean the response
    email = cleanAIResponse(email);
    
    // Validate email content against spam
    if (!validateEmailContent(email, business, context)) {
      return res.status(400).json({ 
        email: "❌ Unable to generate appropriate email content. Please refine your business description and context." 
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

  // Validate edited content against spam
  if (!validateEmailContent(editedEmail, business, context)) {
    return res.status(400).json({ 
      email: "❌ Unable to process edits. Content appears inappropriate for professional email communication." 
    });
  }

  const prompt = `
Apply professional formatting to this legitimate business email while preserving ALL user content exactly. Return ONLY the formatted email.

STRICT REQUIREMENTS:
- Preserve all user content exactly
- Ensure professional, non-spammy formatting
- Maintain legitimate business communication standards
- No spam indicators or deceptive language

USER'S EDITED CONTENT (PRESERVE EXACTLY):
${editedEmail}

CONTEXT (for formatting reference only):
- Business: ${business}
- Purpose: ${context} 
- Tone: ${tone}

Return ONLY the professionally formatted email starting with "Subject:" if present.
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
    
    // Clean the response
    email = cleanAIResponse(email);
    
    // Validate the final content
    if (!validateEmailContent(email, business, context)) {
      return res.json({ email: editedEmail }); // Return user's original if validation fails
    }
    
    // Fallback to user's original if cleaning removed everything
    if (!email || email.length < 10) {
      email = editedEmail;
    }
    
    res.json({ email });
  } catch (error) {
    console.error("Groq API Error:", error);
    res.json({ email: editedEmail });
  }
});

// SendGrid email sending endpoint with spam prevention
app.post("/send-email", async (req, res) => {
  const { to, subject, content, senderName } = req.body;

  if (!to || !subject || !content) {
    return res.status(400).json({ error: "Missing required fields: to, subject, content" });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ error: "Invalid recipient email address" });
  }

  // Final spam check before sending
  const spamIndicators = [
    /\b(act now|limited time|urgent|immediate)\b/gi,
    /\b(free money|get rich|millionaire)\b/gi,
    /\b(click here|buy now|order now)\b/gi,
    /\b(viagra|cialis|pharmacy)\b/gi
  ];

  for (const pattern of spamIndicators) {
    if (pattern.test(content) || pattern.test(subject)) {
      return res.status(400).json({ 
        error: "Unable to send email. Content appears inappropriate for professional communication." 
      });
    }
  }

  try {
    const formattedContent = formatEmailContent(content, senderName);

    const sendGridResponse = await fetch("https://api.sendGrid.com/v3/mail/send", {
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
          name: senderName || "Professional Contact"
        },
        content: [
          {
            type: "text/plain",
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
      
      // Check if SendGrid rejected due to spam concerns
      if (errorData.includes('spam') || errorData.includes('rejected')) {
        res.status(400).json({ 
          error: "Email rejected by provider. Please review content and try again." 
        });
      } else {
        res.status(500).json({ error: "Failed to send email via SendGrid" });
      }
    }
  } catch (error) {
    console.error("Send Email Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatEmailContent(content, senderName) {
  let formatted = content.replace(/^Subject:\s*.+\n?/i, '').trim();
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\n+/g, '\n');
  
  if (senderName) {
    const lines = formatted.split('\n');
    const lastFewLines = lines.slice(-4).join('\n');
    
    const hasSignature = lastFewLines.includes('Best') || 
                        lastFewLines.includes('Regards') || 
                        lastFewLines.includes('Sincerely') ||
                        lastFewLines.includes('Thanks') ||
                        lastFewLines.includes('Thank you');
    
    if (!hasSignature) {
      formatted += `\n\nBest regards,\n${senderName}`;
    }
  }
  
  // Only add LetiMail attribution for legitimate professional emails
  formatted += `\n\n---\nProfessional email crafted with LetiMail`;
  
  return formatted;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
