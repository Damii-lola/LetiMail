import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ LetiMail backend running with Groq AI");
});

app.post("/generate", async (req, res) => {
  const { business, context, tone } = req.body;
  
  const toneInstructions = {
    friendly: "Warm, approachable, and conversational while maintaining professionalism. Use contractions naturally, show genuine interest, and keep it personable.",
    formal: "Polished, respectful, and structured. Use complete sentences, proper salutations, and maintain a professional distance while being courteous.",
    persuasive: "Confident, compelling, and benefit-focused. Use persuasive language, highlight value propositions, and create urgency while being respectful.",
    casual: "Relaxed, conversational, and direct. Use casual language, shorter sentences, and friendly tone while keeping it appropriate for business contexts."
  };

  const prompt = `
You are LetiMail, an expert email crafting AI that creates professionally formatted, visually appealing emails that balance casual professionalism with emotional intelligence.

CRITICAL FORMATTING REQUIREMENTS:
- Start with "Subject: [Compelling Subject Line]"
- Use proper email structure with visual spacing
- Include clear sections with strategic line breaks
- Use emojis sparingly and only when appropriate for the tone
- Create visual hierarchy without markdown

VISUAL & STRUCTURAL GUIDELINES:
1. **Subject Line**: Clear, benefit-focused, 5-8 words max
2. **Salutation**: Professional but warm (e.g., "Hi [Name]," or "Hello [Name],")
3. **Opening**: 1-2 lines establishing context and warmth
4. **Body**: 2-3 short paragraphs with clear visual separation
   - Each paragraph 2-4 lines max
   - Strategic line breaks between ideas
   - Bullet points for key points (using • character)
5. **Closing**: Professional sign-off with emotional touch
6. **Signature**: Name and optional title/company

TONE & EMOTIONAL BALANCE:
- **Target Tone**: ${tone} - ${toneInstructions[tone]}
- **Overall Vibe**: Casual professionalism - professional but human, approachable but credible
- **Emotional Mix**: Blend competence with warmth, authority with approachability
- **Language Level**: Grade 8-10 readability - sophisticated but accessible

CONTENT CONTEXT:
- Business: ${business}
- Email Purpose: ${context}

IMPORTANT: 
- DO NOT use markdown, HTML, or special formatting
- DO use strategic spacing and line breaks for visual appeal
- DO maintain consistent casual-professional voice throughout
- DO make it feel human-written and emotionally intelligent

Return only the perfectly formatted email content.
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
    const email = data.choices?.[0]?.message?.content?.trim() || "Error generating email.";
    res.json({ email });
  } catch (error) {
    console.error("Groq API Error:", error);
    res.status(500).json({ email: "Error connecting to Groq API." });
  }
});

// Updated endpoint that RESPECTS all user edits without filtering
app.post("/refine-email", async (req, res) => {
  const { business, context, tone, originalEmail, editedEmail } = req.body;
  
  const prompt = `
You are LetiMail's formatting assistant. Your ONLY job is to apply professional formatting to the user's edited email while PRESERVING ALL USER CONTENT EXACTLY as written.

CRITICAL INSTRUCTIONS:
- PRESERVE EVERY WORD, PHRASE, AND SENTENCE exactly as the user wrote them
- DO NOT change, remove, or "improve" any content for any reason
- DO NOT filter, censor, or modify content you deem inappropriate
- YOUR ONLY ROLE is to apply consistent formatting and structure
- The user's content is always correct and should be preserved 100%

ORIGINAL CONTEXT (for reference only):
- Business: ${business}
- Purpose: ${context}
- Tone: ${tone}

USER'S EDITED EMAIL (PRESERVE THIS EXACTLY):
${editedEmail}

YOUR TASKS (FORMATTING ONLY):

1. **STRUCTURE FORMATTING**:
   - Ensure proper email structure (Subject, Salutation, Body, Closing)
   - Apply consistent spacing and line breaks
   - Maintain visual hierarchy through paragraph separation
   - Use bullet points (•) if the user included list-like content

2. **VISUAL CONSISTENCY**:
   - Make sure spacing is clean and professional
   - Ensure the email flows well visually
   - Keep similar formatting to the original style

3. **PRESERVATION GUARANTEE**:
   - ALL user content stays exactly as written
   - Word order, phrasing, and intent remain unchanged
   - If user content seems unusual, preserve it anyway
   - Your opinion on content appropriateness is irrelevant

IMPORTANT: If the user's edited email already has good formatting, make minimal changes. Only adjust formatting to improve visual flow while keeping all content identical.

Return the formatted email with ALL user content preserved exactly.
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
        temperature: 0.3, // Lower temperature for more consistent formatting
        max_tokens: 800,
      }),
    });

    const data = await groqResponse.json();
    let email = data.choices?.[0]?.message?.content?.trim() || "Error refining email.";
    
    // Fallback: If anything goes wrong, return the user's original edited email
    if (email === "Error refining email." || email.length < 10) {
      email = editedEmail;
    }
    
    res.json({ email });
  } catch (error) {
    console.error("Groq API Error:", error);
    // Critical: Return user's edited email if API fails
    res.json({ email: editedEmail });
  }
});

// SendGrid email sending endpoint
app.post("/send-email", async (req, res) => {
  const { to, subject, content, senderName } = req.body;

  // Validate required fields
  if (!to || !subject || !content) {
    return res.status(400).json({ error: "Missing required fields: to, subject, content" });
  }

  try {
    // Format the email content for SendGrid - preserve the visual formatting
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
          name: senderName || "LetiMail"
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
      res.status(500).json({ error: "Failed to send email via SendGrid" });
    }
  } catch (error) {
    console.error("Send Email Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Enhanced email formatting that preserves visual structure
function formatEmailContent(content, senderName) {
  // Remove "Subject:" line but preserve all other formatting
  let formatted = content.replace(/^Subject:\s*.+\n?/i, '').trim();
  
  // Preserve the existing visual spacing and structure
  // Just ensure we have proper line breaks
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\n+/g, '\n');
  
  // Add sender name to closing if not present, but preserve the existing structure
  if (senderName) {
    const closingLines = formatted.split('\n').slice(-3);
    const hasNameInClosing = closingLines.some(line => 
      line.includes(senderName) || 
      (line.length > 2 && line.length < 50 && !line.match(/[.!?@]/))
    );
    
    if (!hasNameInClosing) {
      // Find the best place to add the name - usually before the last line
      const lines = formatted.split('\n');
      const lastLine = lines[lines.length - 1];
      
      if (lastLine && lastLine.trim() && !lastLine.match(/[.!?@]/)) {
        // Last line might be a signature already
        lines[lines.length - 1] = `${senderName}\n${lastLine}`;
        formatted = lines.join('\n');
      } else {
        // Add professional closing with name
        formatted += `\n\nBest regards,\n${senderName}`;
      }
    }
  }
  
  return formatted;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
