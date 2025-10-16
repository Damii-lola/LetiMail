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

// Send button functionality with SendGrid
sendBtn.addEventListener("click", async () => {
  const currentEmail = outputDiv.innerText;
  
  // Show recipient input modal
  showSendModal(currentEmail);
});

// Handle edit submission and cancellation
document.addEventListener('click', async (e) => {
  if (e.target.id === 'submitEditBtn') {
    const editedEmail = document.getElementById('emailEditor').value;
    await submitEditedEmail(editedEmail);
  } else if (e.target.id === 'cancelEditBtn') {
    cancelEdit();
  } else if (e.target.id === 'confirmSendBtn') {
    await sendEmail();
  } else if (e.target.id === 'cancelSendBtn') {
    hideSendModal();
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

// Send Email Modal Functions
function showSendModal(emailContent) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Send Email</h3>
      <div class="input-group">
        <label for="recipientEmail">Recipient Email:</label>
        <input type="email" id="recipientEmail" placeholder="Enter recipient email address" class="email-input" />
      </div>
      <div class="input-group">
        <label for="senderName">Your Name:</label>
        <input type="text" id="senderName" placeholder="Enter your name" class="name-input" />
      </div>
      <div class="modal-actions">
        <button id="confirmSendBtn" class="confirm-send-btn">📤 Send Email</button>
        <button id="cancelSendBtn" class="cancel-send-btn">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add modal styles if not already added
  if (!document.querySelector('#modal-styles')) {
    const style = document.createElement('style');
    style.id = 'modal-styles';
    style.textContent = `
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }
      .modal-content {
        background: var(--card);
        padding: 2rem;
        border-radius: var(--radius);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        max-width: 500px;
        width: 90%;
      }
      .modal-content h3 {
        margin-top: 0;
        color: var(--text);
      }
      .input-group {
        margin-bottom: 1rem;
      }
      .input-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: var(--text);
      }
      .email-input, .name-input {
        width: 100%;
        padding: 0.8rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        color: var(--text);
        font-size: 1rem;
      }
      .modal-actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
        margin-top: 1.5rem;
      }
      .confirm-send-btn, .cancel-send-btn {
        padding: 0.8rem 1.5rem;
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.3s ease;
      }
      .confirm-send-btn {
        background: #10b981;
        color: white;
      }
      .confirm-send-btn:hover {
        background: #059669;
      }
      .cancel-send-btn {
        background: #6b7280;
        color: white;
      }
      .cancel-send-btn:hover {
        background: #4b5563;
      }
    `;
    document.head.appendChild(style);
  }
}

function hideSendModal() {
  const modal = document.querySelector('.modal-overlay');
  if (modal) {
    modal.remove();
  }
}

async function sendEmail() {
  const recipientEmail = document.getElementById('recipientEmail').value.trim();
  const senderName = document.getElementById('senderName').value.trim();
  const emailContent = outputDiv.innerText;

  if (!recipientEmail) {
    alert('Please enter a recipient email address');
    return;
  }

  if (!senderName) {
    alert('Please enter your name');
    return;
  }

  // Show sending state
  const confirmBtn = document.getElementById('confirmSendBtn');
  const originalText = confirmBtn.textContent;
  confirmBtn.textContent = 'Sending...';
  confirmBtn.disabled = true;

  try {
    const response = await fetch('https://letimail-production.up.railway.app/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipientEmail,
        subject: extractSubject(emailContent),
        content: emailContent,
        senderName: senderName
      }),
    });

    const result = await response.json();

    if (response.ok) {
      alert('✅ Email sent successfully!');
      hideSendModal();
    } else {
      throw new Error(result.error || 'Failed to send email');
    }
  } catch (error) {
    console.error('Send error:', error);
    alert('❌ Failed to send email: ' + error.message);
  } finally {
    confirmBtn.textContent = originalText;
    confirmBtn.disabled = false;
  }
}

function extractSubject(emailContent) {
  // Extract subject from email content (assuming format: "Subject: Your Subject Here")
  const subjectMatch = emailContent.match(/Subject:\s*(.*?)(?:\n|$)/i);
  if (subjectMatch && subjectMatch[1]) {
    return subjectMatch[1].trim();
  }
  
  // Fallback: use first line or generate generic subject
  const firstLine = emailContent.split('\n')[0].trim();
  return firstLine.length > 0 ? firstLine : 'Email from LetiMail';
}
