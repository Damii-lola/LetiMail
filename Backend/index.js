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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LetiMail backend running on port ${PORT}`));
