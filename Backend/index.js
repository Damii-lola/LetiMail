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
  const prompt = `
You are LetiMail, an award-winning AI email copywriter that crafts high-impact professional emails.

Goal: Write an email that is clear, visually structured, emotionally engaging, and tailored for conversion.

Follow these non-negotiable principles:
1. **Visual & structural clarity:** Use short paragraphs, headers (if appropriate), and natural flow.
2. **Personalization:** Reference recipient name, role, or context if provided.
3. **Powerful subject line:** Start your response with "Subject:" and a compelling subject line.
4. **Tone:** Match the tone style provided (${tone}) but keep it elegant and authentic.
5. **Strong CTA:** Make the reader clearly understand what to do next.
6. **Memorability:** Include a closing line that leaves an emotional impression or brand value.
7. **Accessibility:** Keep language readable (grade 7–9 level).

Details to base this on:
- Business: ${business}
- Email context: ${context}

Return only the completed email content with a subject line, body, and closing signature (no explanations or code).
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

// New endpoint for refining emails based on user edits
app.post("/refine-email", async (req, res) => {
  const { business, context, tone, originalEmail, editedEmail } = req.body;
  
  const prompt = `
You are LetiMail, an expert email refinement AI. Your task is to analyze the user's edits and professionally incorporate them while maintaining the original email's style and structure.

ORIGINAL BUSINESS CONTEXT:
- Business: ${business}
- Email Context: ${context}
- Desired Tone: ${tone}

ORIGINAL GENERATED EMAIL:
${originalEmail}

USER-EDITED VERSION:
${editedEmail}

INSTRUCTIONS:
1. Carefully compare the original and edited versions
2. Identify what the user:
   - Added (new content)
   - Removed (deleted content) 
   - Modified (changed content)
3. Preserve the original email's:
   - Overall structure and format
   - Professional vibe and tone (${tone})
   - Visual clarity and paragraph flow
4. Seamlessly integrate the user's changes while making them sound professional and natural
5. Maintain the subject line format if it was edited
6. Keep the email engaging and conversion-focused

Return ONLY the refined email content (no analysis or explanations). Make sure the final result feels cohesive and professional.
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
        temperature: 0.5, // Lower temperature for more consistent refinements
      }),
    });

    const data = await groqResponse.json();
    const email = data.choices?.[0]?.message?.content?.trim() || "Error refining email.";
    res.json({ email });
  } catch (error) {
    console.error("Groq API Error:", error);
    res.status(500).json({ email: "Error connecting to Groq API." });
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
    // Format the email content for SendGrid
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

// Helper function to format email content
function formatEmailContent(content, senderName) {
  // Remove "Subject:" line from the content since we're using it separately
  let formatted = content.replace(/^Subject:\s*.+\n?/i, '').trim();
  
  // Ensure proper formatting
  formatted = formatted.replace(/\n\s*\n/g, '\n\n'); // Normalize line breaks
  
  // Add sender name to signature if not already present
  if (senderName && !formatted.includes(senderName)) {
    const lines = formatted.split('\n');
    const lastLine = lines[lines.length - 1];
    
    // If last line looks like a signature (short line, might be a name)
    if (lastLine && lastLine.length < 50 && !lastLine.includes('@')) {
      lines[lines.length - 1] = `${senderName}\n${lastLine}`;
      formatted = lines.join('\n');
    } else {
      formatted += `\n\nBest regards,\n${senderName}`;
    }
  }
  
  return formatted;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
