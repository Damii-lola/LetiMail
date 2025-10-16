const themeToggle = document.getElementById("themeToggle");
const generateBtn = document.getElementById("generateBtn");
const outputDiv = document.getElementById("output");
const actionButtons = document.getElementById("actionButtons");
const editBtn = document.getElementById("editBtn");
const sendBtn = document.getElementById("sendBtn");

// Store the original generated email
let originalEmail = "";
let isEditing = false;

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
    hideActionButtons();
    return;
  }

  outputDiv.innerHTML = "Generating your email <span class='dots'>...</span>";
  hideActionButtons();

  try {
    const response = await fetch("https://letimail-production.up.railway.app/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business, context, tone }),
    });

    const data = await response.json();
    const email = data.email || "Something went wrong.";
    
    outputDiv.innerText = email;
    originalEmail = email;
    showActionButtons();
    
  } catch (err) {
    console.error(err);
    outputDiv.innerText = "❌ Server error. Please try again later.";
    hideActionButtons();
  }
});

// Edit button functionality
editBtn.addEventListener("click", () => {
  if (!isEditing) {
    // Enter edit mode
    const currentEmail = outputDiv.innerText;
    outputDiv.innerHTML = `
      <textarea id="emailEditor" class="email-editor">${currentEmail}</textarea>
      <div class="edit-actions">
        <button id="submitEditBtn" class="submit-edit-btn">✅ Submit Edit</button>
        <button id="cancelEditBtn" class="cancel-edit-btn">❌ Cancel</button>
      </div>
    `;
    isEditing = true;
    editBtn.style.display = 'none';
    sendBtn.style.display = 'none';
  }
});

// Send button functionality (do nothing for now)
sendBtn.addEventListener("click", () => {
  // Do nothing as requested
  console.log("Send button clicked - no action taken");
});

// Handle edit submission and cancellation
document.addEventListener('click', async (e) => {
  if (e.target.id === 'submitEditBtn') {
    const editedEmail = document.getElementById('emailEditor').value;
    await submitEditedEmail(editedEmail);
  } else if (e.target.id === 'cancelEditBtn') {
    cancelEdit();
  }
});

async function submitEditedEmail(editedEmail) {
  const business = document.getElementById("businessDesc").value.trim();
  const context = document.getElementById("context").value.trim();
  const tone = document.getElementById("tone").value;

  outputDiv.innerHTML = "Refining your email <span class='dots'>...</span>";

  try {
    const response = await fetch("https://letimail-production.up.railway.app/refine-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business,
        context,
        tone,
        originalEmail,
        editedEmail
      }),
    });

    const data = await response.json();
    const refinedEmail = data.email || "Something went wrong.";
    
    outputDiv.innerText = refinedEmail;
    originalEmail = refinedEmail;
    isEditing = false;
    showActionButtons();
    
  } catch (err) {
    console.error(err);
    outputDiv.innerText = "❌ Server error. Please try again later.";
    isEditing = false;
    showActionButtons();
  }
}

function cancelEdit() {
  outputDiv.innerText = originalEmail;
  isEditing = false;
  showActionButtons();
}

function showActionButtons() {
  actionButtons.style.display = 'flex';
  editBtn.style.display = 'block';
  sendBtn.style.display = 'block';
}

function hideActionButtons() {
  actionButtons.style.display = 'none';
}
