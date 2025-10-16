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

  const excessiveCaps = (content.match(/[A-Z]{3,}/g) || []).length;
  if (excessiveCaps > 3) {
    return false;
  }

  const excessiveExclamations = (content.match(/!/g) || []).length;
  if (excessiveExclamations > 2) {
    return false;
  }

  const businessWords = business.toLowerCase().split(/\s+/);
  const contextWords = context.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();

  let relevanceScore = 0;
  [...businessWords, ...contextWords].forEach(word => {
    if (word.length > 3 && contentLower.includes(word)) {
      relevanceScore++;
    }
  });

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

  const formalWritingStyles = {
    friendly: {
      approach: "Warm and comprehensive formal writing",
      characteristics: "Thorough explanations with a personal touch, maintaining formal structure while being approachable"
    },
    formal: {
      approach: "Traditional elaborate formal writing",
      characteristics: "Comprehensive details, proper formalities, extensive explanations, traditional business language"
    },
    persuasive: {
      approach: "Detailed and compelling formal argument",
      characteristics: "Thorough reasoning, comprehensive benefits explanation, detailed value proposition"
    },
    casual: {
      approach: "Relaxed but comprehensive formal writing",
      characteristics: "Complete explanations with casual language, maintaining formal structure but relaxed tone"
    }
  };

  const style = formalWritingStyles[tone];

  const prompt = `
Write a comprehensive formal business letter that follows traditional elaborate formal writing style. This should be detailed, thorough, and properly structured with all formalities.

ELABORATE FORMAL WRITING PRINCIPLES (MUST FOLLOW):
1. **Formal Greeting**: Use proper salutation with full formalities
2. **Comprehensive Opening**: Begin with context and purpose in detail
3. **Thorough Explanation**: Provide complete background and reasoning
4. **Detailed Body**: Multiple paragraphs with extensive explanations
5. **Proper Formal Language**: Use traditional business vocabulary and phrasing
6. **Complete Closing**: Formal sign-off with all necessary details
7. **Length**: Should be comprehensive, not brief - proper formal letters are detailed

BUSINESS CONTEXT:
- Business: ${business}
- Purpose: ${context}
- Writing Style: ${style.approach} - ${style.characteristics}

TRADITIONAL FORMAL LETTER STRUCTURE:
Subject: [Formal, descriptive subject line]

[Formal Salutation],

[Paragraph 1: Comprehensive opening with full context, background, and purpose]
[Paragraph 2: Detailed explanation of the situation or proposal]
[Paragraph 3: Additional supporting information or considerations]
[Paragraph 4: Specific requests, actions, or next steps in detail]
[Paragraph 5: Closing remarks and appreciation]

[Formal Closing],
[Full Name and Title if appropriate]

FORMAL PHRASES TO INCLUDE:
- "I am writing to inform you regarding..."
- "It is with great pleasure that I..."
- "Please be advised that..."
- "I would like to take this opportunity to..."
- "In accordance with our previous correspondence..."
- "We respectfully request your attention to..."
- "Thank you for your time and consideration in this matter"

CRITICAL: 
- Do NOT be brief or direct
- Use complete sentences and proper grammar
- Include all necessary formalities and courtesies
- Provide thorough explanations and background
- Make it comprehensive and detailed like a proper formal letter
- Use traditional business language throughout

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
        max_tokens: 1200, // Increased for comprehensive formal letters
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || "Error generating email.";
    
    // Clean the response
    email = cleanAIResponse(email);
    
    // Enhance formal style
    email = enhanceFormalStyle(email);
    
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

// Function to enhance formal style with traditional phrasing
function enhanceFormalStyle(email) {
  if (!email) return email;
  
  let formalEmail = email
    // Ensure proper formal openings
    .replace(/^Hi\s+/gi, 'Dear ')
    .replace(/^Hello\s+/gi, 'Dear ')
    .replace(/^Hey\s+/gi, 'Dear ')
    
    // Enhance formal language
    .replace(/I'm writing about/gi, 'I am writing to inform you regarding')
    .replace(/I want to/gi, 'I would like to')
    .replace(/I need you to/gi, 'We respectfully request that you')
    .replace(/Please\s*$/gi, 'We would appreciate your prompt attention to this matter.')
    .replace(/Thanks/gi, 'Thank you for your time and consideration')
    .replace(/Talk soon/gi, 'We look forward to your response');
  
  // Ensure comprehensive structure with multiple paragraphs
  const lines = formalEmail.split('\n');
  if (lines.length < 8) {
    // Add more formal content if too brief
    formalEmail = formalEmail.replace(/(Sincerely|Regards|Best regards),/gi, 
      'Thank you for your attention to this important matter.\n\n$1,');
  }
  
  return formalEmail;
}

app.post("/refine-email", async (req, res) => {
  const { business, context, tone, originalEmail, editedEmail } = req.body;

  // Validate edited content against spam
  if (!validateEmailContent(editedEmail, business, context)) {
    return res.status(400).json({ 
      email: "❌ Unable to process edits. Content appears inappropriate for professional email communication." 
    });
  }

  const prompt = `
Apply comprehensive formal business letter formatting to this email while preserving ALL user content exactly. Make it elaborate and detailed in the traditional formal style.

USER'S EXACT WORDS (DO NOT CHANGE CONTENT):
${editedEmail}

FORMAL FORMATTING REQUIREMENTS:
- Structure as a traditional elaborate formal letter
- Use proper formal language and phrasing
- Maintain comprehensive explanations
- Include all formal courtesies and structure
- Keep every word the user wrote

FORMAL PRINCIPLES TO APPLY:
- Formal salutation and closing
- Multiple paragraphs with detailed explanations
- Traditional business vocabulary
- Complete sentences and proper grammar
- Thorough background and context

Return ONLY the formatted formal letter starting with "Subject:" if present.
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
        max_tokens: 1200,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || editedEmail;
    
    // Clean the response
    email = cleanAIResponse(email);
    
    // Enhance formal style on refined email
    email = enhanceFormalStyle(email);
    
    // Validate the final content
    if (!validateEmailContent(email, business, context)) {
      return res.json({ email: editedEmail });
    }
    
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
    return res.status(400).json({ error: "Missing required fields: to, subject, content" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ error: "Invalid recipient email address" });
  }

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
    
    const hasSignature = lastFewLines.includes('Sincerely') || 
                        lastFewLines.includes('Respectfully') || 
                        lastFewLines.includes('Yours faithfully') ||
                        lastFewLines.includes('Best regards');
    
    if (!hasSignature) {
      formatted += `\n\nSincerely,\n${senderName}`;
    }
  }
  
  formatted += `\n\n---\nProfessional formal letter crafted with LetiMail`;
  
  return formatted;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
