const generateBtn = document.getElementById("generateBtn");
const outputDiv = document.getElementById("output");
const actionButtons = document.getElementById("actionButtons");
const editBtn = document.getElementById("editBtn");
const sendBtn = document.getElementById("sendBtn");

// Store the original generated email
let originalEmail = "";
let isEditing = false;
let isGenerating = false;
let isRefining = false;

generateBtn.addEventListener("click", async () => {
  // Prevent multiple simultaneous generations
  if (isGenerating || isRefining) {
    return;
  }

  const business = document.getElementById("businessDesc").value.trim();
  const context = document.getElementById("context").value.trim();
  const tone = document.getElementById("tone").value;

  if (!business || !context) {
    outputDiv.innerText = "⚠️ Please fill in all fields.";
    hideActionButtons();
    return;
  }

  isGenerating = true;
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';

  outputDiv.innerHTML = '<div class="output-placeholder"><div class="placeholder-icon">⏳</div><p>Generating your email...</p><small>Powered by adaptive AI that learns your style</small></div>';
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
  } finally {
    isGenerating = false;
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<span class="btn-icon">✨</span> Generate My Email';
  }
});

// Edit button functionality
editBtn.addEventListener("click", () => {
  if (!isEditing && !isGenerating && !isRefining) {
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
  if (isGenerating || isRefining) {
    return;
  }
  
  const currentEmail = outputDiv.innerText;
  
  // Show recipient input modal
  showSendModal(currentEmail);
});

// Handle edit submission and cancellation
document.addEventListener('click', async (e) => {
  if (e.target.id === 'submitEditBtn' && !isRefining) {
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
  if (isRefining) {
    return;
  }

  const business = document.getElementById("businessDesc").value.trim();
  const context = document.getElementById("context").value.trim();
  const tone = document.getElementById("tone").value;

  isRefining = true;
  const submitBtn = document.getElementById('submitEditBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');
  
  submitBtn.disabled = true;
  cancelBtn.disabled = true;
  submitBtn.textContent = "Refining...";

  outputDiv.innerHTML = '<div class="output-placeholder"><div class="placeholder-icon">⏳</div><p>Refining your email...</p><small>Preserving your unique voice</small></div>';

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
  } finally {
    isRefining = false;
    submitBtn.disabled = false;
    cancelBtn.disabled = false;
    submitBtn.textContent = "✅ Submit Edit";
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

  // Prevent multiple sends
  if (isGenerating || isRefining) {
    return;
  }

  // Show sending state
  const confirmBtn = document.getElementById('confirmSendBtn');
  const cancelBtn = document.getElementById('cancelSendBtn');
  const originalText = confirmBtn.textContent;
  confirmBtn.textContent = 'Sending...';
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;

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
    cancelBtn.disabled = false;
  }
}

function extractSubject(emailContent) {
  const subjectMatch = emailContent.match(/Subject:\s*(.*?)(?:\n|$)/i);
  if (subjectMatch && subjectMatch[1]) {
    return subjectMatch[1].trim();
  }
  
  const firstLine = emailContent.split('\n')[0].trim();
  return firstLine.length > 0 ? firstLine : 'Email from LetiMail';
}
