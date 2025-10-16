const themeToggle = document.getElementById("themeToggle");
const generateBtn = document.getElementById("generateBtn");
const outputDiv = document.getElementById("output");

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  themeToggle.textContent = savedTheme === "dark" ? "☀️" : "🌙";
});

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const newTheme = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", newTheme);
  themeToggle.textContent = newTheme === "dark" ? "☀️" : "🌙";
  localStorage.setItem("theme", newTheme);
});

generateBtn.addEventListener("click", async () => {
  const business = document.getElementById("businessDesc").value.trim();
  const context = document.getElementById("context").value.trim();
  const tone = document.getElementById("tone").value;

  if (!business || !context) {
    outputDiv.innerText = "⚠️ Please fill in all fields.";
    return;
  }

  outputDiv.innerHTML = "Generating your email <span class='dots'>...</span>";

  try {
    const response = await fetch("https://letimail-production.up.railway.app/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business, context, tone }),
    });

    const data = await response.json();
    outputDiv.innerText = data.email || "Something went wrong.";
  } catch (err) {
    console.error(err);
    outputDiv.innerText = "❌ Server error. Please try again later.";
  }
});
