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

  const humanWritingStyles = {
    friendly: {
      style: "Warm and conversational like you're writing to a colleague you like",
      phrases: [
        "Hope you're having a great week",
        "Just wanted to quickly follow up",
        "I was thinking about our conversation",
        "Would love to hear your thoughts",
        "No rush at all on this"
      ],
      imperfections: ["Quick question", "Circling back", "Touching base", "Following up on"]
    },
    formal: {
      style: "Polished but personal, like a senior professional writing to a respected counterpart",
      phrases: [
        "I hope this message finds you well",
        "I'm writing to discuss",
        "I would appreciate your perspective",
        "Thank you for your time and consideration",
        "I look forward to hearing from you"
      ],
      imperfections: ["I wanted to briefly mention", "In reference to", "With regard to"]
    },
    persuasive: {
      style: "Confident and compelling but authentic, like a trusted advisor",
      phrases: [
        "I believe this could be valuable for",
        "What stood out to me was",
        "This aligns well with your goals",
        "I'm confident this could help",
        "The key benefit I see is"
      ],
      imperfections: ["What if we", "Have you considered", "One thought that occurred to me"]
    },
    casual: {
      style: "Relaxed and direct, like you're messaging a work friend",
      phrases: [
        "Hey, just wanted to check in",
        "Quick update for you",
        "Let me know what you think",
        "No pressure either way",
        "Happy to chat more about this"
      ],
      imperfections: ["BTW", "Quick one", "Just a heads up", "When you get a moment"]
    }
  };

  const style = humanWritingStyles[tone];

  const prompt = `
Write a completely human-sounding email that sounds like a real person wrote it naturally. This should NOT sound like AI-generated content.

IMPORTANT: Make it sound authentically human with:
- Natural conversational flow
- Occasional informal phrasing
- Varied sentence lengths
- Personal touches and specifics
- Minor imperfections that make it feel real
- Context-appropriate details

BUSINESS CONTEXT:
- My business: ${business}
- What I'm writing about: ${context}
- Tone style: ${tone} - ${style.style}

HUMAN WRITING TECHNIQUES TO USE:
1. Start with a natural greeting that fits the relationship
2. Include specific, believable details that relate to the context
3. Use occasional conversational phrases like "${style.phrases[0]}" or "${style.phrases[1]}"
4. Vary sentence structure - mix short and long sentences
5. Add personal observations or thoughts
6. Use natural transitions between ideas
7. Include minor imperfections that make it feel human-written
8. End with a genuine, appropriate closing

AVOID:
- Perfect, robotic language
- Overly formal or stiff phrasing
- Generic, template-like content
- Repetitive sentence structures
- Anything that sounds like AI

EMAIL STRUCTURE (make it flow naturally):
Subject: [Human-sounding subject line - not too perfect]

[Natural opening that sets context]
[Body with authentic details and personal touch]
[Genuine closing that matches the tone]

Remember: This should sound like a busy professional wrote it quickly, not like a perfectly crafted corporate message.

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
        temperature: 0.8, // Higher temperature for more varied, human-like output
        max_tokens: 800,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || "Error generating email.";
    
    // Clean the response
    email = cleanAIResponse(email);
    
    // Add final human touches
    email = addHumanTouches(email, tone);
    
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

// Function to add human touches to the email
function addHumanTouches(email, tone) {
  if (!email) return email;
  
  // Remove any remaining overly perfect phrasing
  let humanEmail = email
    .replace(/per your request/gi, 'as we discussed')
    .replace(/please be advised/gi, 'just wanted to let you know')
    .replace(/it is imperative that/gi, 'it would be great if')
    .replace(/utilize/gi, 'use')
    .replace(/commence/gi, 'start')
    .replace(/terminate/gi, 'end');
  
  // Ensure natural paragraph breaks
  humanEmail = humanEmail.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return humanEmail;
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
The user has edited their email. Please apply natural formatting while keeping ALL their exact words and making it sound human-written.

USER'S EXACT WORDS (DO NOT CHANGE CONTENT):
${editedEmail}

CONTEXT (for tone reference only):
- Business: ${business}
- Situation: ${context}
- Preferred tone: ${tone}

YOUR TASK:
1. Preserve every single word exactly as the user wrote them
2. Apply natural email formatting that sounds human-written
3. Maintain the ${tone} tone while keeping it authentic
4. Ensure it flows like a real person wrote it
5. Don't make it sound "perfect" or corporate

IMPORTANT: 
- Keep all the user's phrasing, even if it seems imperfect
- Maintain any personal touches or unique wording they used
- Only adjust formatting and structure for readability
- Make it sound like a genuine human email

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
        temperature: 0.4,
        max_tokens: 800,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || editedEmail;
    
    // Clean the response
    email = cleanAIResponse(email);
    
    // Add human touches to refined email
    email = addHumanTouches(email, tone);
    
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
    
    const hasSignature = lastFewLines.includes('Best') || 
                        lastFewLines.includes('Regards') || 
                        lastFewLines.includes('Sincerely') ||
                        lastFewLines.includes('Thanks') ||
                        lastFewLines.includes('Thank you');
    
    if (!hasSignature) {
      formatted += `\n\nBest regards,\n${senderName}`;
    }
  }
  
  formatted += `\n\n---\nProfessional email crafted with LetiMail`;
  
  return formatted;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
