const BACKEND_URL = 'https://letimail.onrender.com';  // your Render URL

// DOM elements
const elements = {
  notification: document.getElementById('notification'),
  userMenu: document.getElementById('userMenu'),
  userAvatar: document.getElementById('userAvatar'),
  avatarText: document.getElementById('avatarText'),
  userDropdown: document.getElementById('userDropdown'),
  settingsBtn: document.getElementById('settingsBtn'),
  clearSessionBtn: document.getElementById('clearSessionBtn'),
  clearSessionBtn2: document.getElementById('clearSessionBtn2'),
  closeSettingsModal: document.getElementById('closeSettingsModal'),
  settingsModal: document.getElementById('settingsModal'),
  generateBtn: document.getElementById('generateBtn'),
  output: document.getElementById('output'),
  actionButtons: document.getElementById('actionButtons'),
  copyBtn: document.getElementById('copyBtn'),
  editBtn: document.getElementById('editBtn'),
  sendBtn: document.getElementById('sendBtn'),
  preferencesForm: document.getElementById('preferencesForm'),
  defaultTone: document.getElementById('defaultTone'),
  defaultEmailLength: document.getElementById('defaultEmailLength'),
  businessDesc: document.getElementById('businessDesc'),
  context: document.getElementById('context'),
  tone: document.getElementById('tone'),
  emailLength: document.getElementById('emailLength')
};

// Notification helper
function showNotification(title, message, type = 'info') {
  const notif = elements.notification;
  if (!notif) return;
  notif.querySelector('.notification-title').textContent = title;
  notif.querySelector('.notification-message').textContent = message;
  notif.className = `notification show ${type}`;
  notif.querySelector('.notification-icon').className = `notification-icon fas ${
    type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'
  }`;
  setTimeout(() => notif.classList.remove('show'), 5000);
}

// Load saved preferences from localStorage
function loadPreferences() {
  const prefs = JSON.parse(localStorage.getItem('letimail_preferences')) || {};
  if (prefs.defaultTone) {
    elements.tone.value = prefs.defaultTone;
    if (elements.defaultTone) elements.defaultTone.value = prefs.defaultTone;
  }
  if (prefs.emailLength) {
    elements.emailLength.value = prefs.emailLength;
    if (elements.defaultEmailLength) elements.defaultEmailLength.value = prefs.emailLength;
  }
}

// Email generation – no auth
async function generateEmail() {
  const business = elements.businessDesc.value.trim();
  const context = elements.context.value.trim();
  const tone = elements.tone.value;
  const emailLength = elements.emailLength.value;

  if (!business || !context) {
    showNotification('Please fill in both fields', '', 'error');
    return;
  }

  // Loading state
  elements.generateBtn.disabled = true;
  elements.generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating…';
  elements.output.innerHTML = '<div class="output-placeholder"><div class="placeholder-animation"><div class="animation-ring"></div><div class="placeholder-icon">✉️</div></div><p>Generating…</p></div>';
  elements.actionButtons.style.display = 'none';

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business, context, tone, emailLength })
    });
    const data = await res.json();
    if (res.ok && data.email) {
      elements.output.innerText = data.email;
      elements.output.setAttribute('data-original-email', data.email);
      elements.actionButtons.style.display = 'flex';
      showNotification('Success', 'Email ready!', 'success');
    } else {
      throw new Error(data.error || 'Generation failed');
    }
  } catch (err) {
    showNotification('Error', err.message, 'error');
    elements.output.innerHTML = '<div class="output-placeholder"><p>❌ Failed</p><button onclick="generateEmail()">Retry</button></div>';
  } finally {
    elements.generateBtn.disabled = false;
    elements.generateBtn.innerHTML = '<span class="btn-icon">✨</span> Generate My Email';
  }
}

// Copy, Edit, Send helpers
function copyEmail() {
  const text = elements.output?.innerText;
  if (!text || text.includes('Generating…')) {
    showNotification('Nothing to copy', '', 'warning');
    return;
  }
  navigator.clipboard.writeText(text).then(() => showNotification('Copied!', '', 'success')).catch(() => showNotification('Copy failed', '', 'error'));
}

function setupEditEmail() {
  elements.editBtn.addEventListener('click', () => {
    const outputDiv = elements.output;
    const currentText = outputDiv?.innerText;
    if (!currentText || currentText.includes('Generating…')) return;
    const isEditing = outputDiv.dataset.editMode === 'true';
    if (!isEditing) {
      outputDiv.dataset.editMode = 'true';
      outputDiv.dataset.originalContent = currentText;
      outputDiv.innerHTML = `<textarea class="email-editor-textarea" rows="15">${currentText}</textarea>
        <div class="edit-actions">
          <button id="cancelEditBtn">Cancel</button>
          <button id="saveEditBtn">Save</button>
        </div>`;
      document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
      document.getElementById('saveEditBtn').addEventListener('click', () => {
        const ta = outputDiv.querySelector('.email-editor-textarea');
        const edited = ta.value.trim();
        if (!edited) return;
        outputDiv.innerText = edited;
        outputDiv.removeAttribute('data-edit-mode');
        outputDiv.setAttribute('data-original-email', edited);
        showNotification('Saved', 'Edits applied', 'success');
      });
    }
  });
}

function cancelEdit() {
  const outputDiv = elements.output;
  if (outputDiv.dataset.editMode === 'true') {
    outputDiv.innerText = outputDiv.dataset.originalContent;
    outputDiv.removeAttribute('data-edit-mode');
  }
}

function showSendEmailModal() {
  const emailText = elements.output?.innerText;
  if (!emailText || emailText.includes('Generating…')) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'sendEmailModal';
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" id="closeSendModal"><i class="fas fa-times"></i></button>
      <h3>Send Email</h3>
      <div class="input-group"><label>Recipient</label><input type="email" id="recipientEmail" class="auth-input" required></div>
      <div class="input-group"><label>Your Name</label><input type="text" id="senderName" class="auth-input" value="User"></div>
      <div class="input-group"><label>Reply‑To</label><input type="email" id="replyToEmail" class="auth-input" value="guest@example.com"></div>
      <button id="sendEmailConfirmBtn" class="settings-btn primary"><i class="fas fa-paper-plane"></i> Send</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'flex';
  document.getElementById('closeSendModal').addEventListener('click', () => modal.remove());
  document.getElementById('sendEmailConfirmBtn').addEventListener('click', async () => {
    const to = document.getElementById('recipientEmail').value.trim();
    const senderName = document.getElementById('senderName').value.trim();
    const replyTo = document.getElementById('replyToEmail').value.trim();
    if (!to || !senderName || !replyTo) return showNotification('Missing fields', '', 'error');
    try {
      const res = await fetch(`${BACKEND_URL}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: emailText.match(/^Subject:\s*(.+)/i)?.[1]?.trim() || 'Message', content: emailText, businessName: senderName, replyToEmail: replyTo })
      });
      if (res.ok) {
        showNotification('Sent!', `Email sent to ${to}`, 'success');
        modal.remove();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Send failed');
      }
    } catch (err) {
      showNotification('Error', err.message, 'error');
    }
  });
}

// Settings modal
function openSettings() {
  elements.settingsModal.style.display = 'flex';
  loadPreferences();
}
function closeSettings() {
  elements.settingsModal.style.display = 'none';
}
elements.settingsBtn.addEventListener('click', openSettings);
elements.closeSettingsModal.addEventListener('click', closeSettings);

elements.preferencesForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const prefs = {
    defaultTone: elements.defaultTone.value,
    emailLength: elements.defaultEmailLength.value
  };
  localStorage.setItem('letimail_preferences', JSON.stringify(prefs));
  elements.tone.value = prefs.defaultTone;
  elements.emailLength.value = prefs.emailLength;
  showNotification('Saved', 'Preferences updated', 'success');
  closeSettings();
});

// Clear session now just clears preferences
if (elements.clearSessionBtn) {
  elements.clearSessionBtn.addEventListener('click', () => {
    localStorage.removeItem('letimail_preferences');
    window.location.reload();
  });
}
if (elements.clearSessionBtn2) {
  elements.clearSessionBtn2.addEventListener('click', () => {
    localStorage.removeItem('letimail_preferences');
    window.location.reload();
  });
}

// Dropdown toggle
elements.userAvatar.addEventListener('click', () => {
  elements.userDropdown.style.display = elements.userDropdown.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#userMenu')) elements.userDropdown.style.display = 'none';
});

// Initialize event listeners
elements.generateBtn.addEventListener('click', generateEmail);
elements.copyBtn.addEventListener('click', copyEmail);
elements.sendBtn.addEventListener('click', showSendEmailModal);
setupEditEmail();

// On page load
document.addEventListener('DOMContentLoaded', () => {
  loadPreferences();
  // Set avatar to "G" for guest
  elements.avatarText.textContent = 'G';
  console.log('✅ LetiMail ready (public mode)');
});
