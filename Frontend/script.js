document.getElementById("generateBtn").addEventListener("click", async () => {
  const business = document.getElementById("businessDesc").value.trim();
  const context = document.getElementById("context").value.trim();
  const tone = document.getElementById("tone").value;
  const outputDiv = document.getElementById("output");

  if (!business || !context) {
    outputDiv.innerText = "Please fill in all fields.";
    return;
  }

  outputDiv.innerText = "Generating your email... ⏳";

  try {
    const response = await fetch("https://YOUR-RAILWAY-BACKEND-URL/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business, context, tone }),
    });

    const data = await response.json();
    outputDiv.innerText = data.email || "Something went wrong.";
  } catch (err) {
    console.error(err);
    outputDiv.innerText = "Server error. Please try again later.";
  }
});
