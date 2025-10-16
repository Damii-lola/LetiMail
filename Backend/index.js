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

  const prompt = `
Create a formal business letter following proper formal letter structure. This should be structured exactly like a traditional formal letter, regardless of the specific tone requested.

FORMAL LETTER STRUCTURE (MUST FOLLOW THIS EXACT FORMAT):

[Current Date]

[Recipient's Name]
[Recipient's Title]
[Recipient's Company/Organization]
[Recipient's Address]

SUBJECT: [Clear and concise subject line]

Dear [Appropriate Salutation],

[Body Paragraph 1: Introduction and purpose of the letter]
- State who you are and your business
- Clearly state the purpose of the letter
- Provide necessary context

[Body Paragraph 2: Main content and details]
- Elaborate on the main points
- Provide specific details and information
- Support your purpose with relevant facts

[Body Paragraph 3: Conclusion and call to action]
- Summarize key points
- State what you expect or hope for
- Provide clear next steps or call to action

[Closing Paragraph: Polite conclusion]
- Express appreciation
- Offer availability for further discussion
- Restate your contact information

Sincerely,

[Your Name]
[Your Title]
[Your Company]
[Your Contact Information]

BUSINESS CONTEXT TO INCORPORATE:
- Your Business: ${business}
- Purpose of Letter: ${context}
- Overall Approach: Professional and formal

IMPORTANT RULES:
1. MUST use the exact formal letter structure shown above
2. Include placeholders in square brackets for personalization (e.g., [Recipient's Name])
3. Use formal business language throughout
4. Maintain professional tone and formatting
5. Do not use casual language or slang
6. Ensure proper spacing and paragraph structure
7. Include all standard formal letter elements

Fill in the structure with appropriate content based on the business context provided. Use professional, formal business language that would be appropriate for any business communication.

Return ONLY the formal letter content following the exact structure above.
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
        max_tokens: 1000,
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
The user has edited their formal business letter. Please ensure it maintains proper formal letter structure while preserving ALL their exact words.

USER'S EXACT WORDS (DO NOT CHANGE CONTENT):
${editedEmail}

FORMAL LETTER STRUCTURE REQUIREMENTS:
- Must maintain formal business letter format
- Proper date, recipient information, subject line
- Formal salutation and closing
- Structured paragraphs with clear purpose
- Professional language throughout

YOUR TASK:
1. Preserve every single word exactly as the user wrote them
2. Ensure the content follows formal letter structure
3. Maintain professional formatting and spacing
4. Keep all placeholders and formal elements intact
5. Do not change the user's content, only adjust structure if needed

CONTEXT (for reference only):
- Business: ${business}
- Purpose: ${context}

Return ONLY the formatted formal letter maintaining proper structure.
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
        max_tokens: 1000,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || editedEmail;
    
    // Clean the response
    email = cleanAIResponse(email);
    
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

// SendGrid email sending endpoint - Updated for formal letters
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
    const formattedContent = formatFormalLetterContent(content, senderName);

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
      res.json({ success: true, message: "Formal letter sent successfully" });
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

// Updated formatting function for formal letters
function formatFormalLetterContent(content, senderName) {
  let formatted = content;
  
  // Ensure the letter maintains its formal structure
  // Just clean up any extra line breaks but preserve the format
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // Add LetiMail attribution at the very end, after the formal closing
  formatted += `\n\n---\nFormal letter crafted with LetiMail`;
  
  return formatted;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
