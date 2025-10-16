import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("LetiMail backend running 🚀");
});

app.post("/generate", async (req, res) => {
  const { business, context, tone } = req.body;

  // Mock AI response (replace with real Llama or OpenAI API later)
  const email = `
Subject: ${tone === "friendly" ? "Hey there!" : "Follow-up regarding our last message"}

Hi there,

${context}. Based on what you do (${business}), this email could express your intent clearly while maintaining a ${tone} tone.

Kind regards,
The LetiMail Team
  `;

  res.json({ email });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ LetiMail backend running on port ${PORT}`));
