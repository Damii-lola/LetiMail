// ====================================================================
// LETIMAIL – INSTANT ACCESS (no signup required)
// ====================================================================

const BACKEND_URL = 'https://letimail.onrender.com';  // ⬅️ your Render service URL
let authToken = null;
let currentUser = null;

// ── DOM Elements ──────────────────────────────────────
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

// ── Notification Helper ──────────────────────────────
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

// ── Guest Session Auto‑Login ─────────────────────────
async function initGuestSession() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (data.success) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      updateUserInfo(currentUser);
    } else {
      throw new Error(data.error || 'Guest session failed');
    }
  } catch (err) {
    console.error('Guest session error:', err);
    showNotification('Error', 'Could not start a session. Please refresh.', 'error');
  }
}

function updateUserInfo(user) {
  if (!user) return;
  elements.avatarText.textContent = user.name.charAt(0).toUpperCase() || 'G';
  // Load saved preferences (localStorage)
  const prefs = JSON.parse(localStorage.getItem('letimail_preferences')) || {};
  if (prefs.defaultTone) elements.tone.value = prefs.defaultTone;
  if (prefs.emailLength) elements.emailLength.value = prefs.emailLength;
  if (prefs.defaultTone) elements.defaultTone.value = prefs.defaultTone;
  if (prefs.emailLength) elements.defaultEmailLength.value = prefs.emailLength;
}

// ── Clear session ────────────────────────────────────
function clearSession() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('letimail_preferences');
  authToken = null;
  currentUser = null;
  window.location.reload();
}

// ── Email Generation ─────────────────────────────────
async function generateEmail() {
  if (!authToken) {
    showNotification('Session expired', 'Refreshing…', 'warning');
    await initGuestSession();
    if (!authToken) return;
  }

  const business = elements.businessDesc.value.trim();
  const context = elements.context.value.trim();
  const tone = elements.tone.value;
  const emailLength = elements.emailLength.value;

  if (!business || !context) {
    showNotification('Please fill in both fields', '', 'error');
    return;
  }

  // Show loading
  elements.generateBtn.disabled = true;
  elements.generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating…';
  elements.output.innerHTML = '<div class="output-placeholder"><div class="placeholder-animation"><div class="animation-ring"></div><div class="placeholder-icon">✉️</div></div><p>Generating…</p></div>';
  elements.actionButtons.style.display = 'none';

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
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

// ── Copy / Edit / Send (keep as original, with authToken) ──
function copyEmail() {
  const text = elements.output?.innerText;
  if (!text || text.includes('Generating…')) {
    showNotification('Nothing to copy', '', 'warning');
    return;
  }
  navigator.clipboard.writeText(text).then(() => showNotification('Copied!', '', 'success')).catch(() => showNotification('Copy failed', '', 'error'));
}

// Edit mode (simplified, no polish backend call – just toggle textarea)
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

// Send email modal
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
      <div class="input-group"><label>Your Name</label><input type="text" id="senderName" class="auth-input" value="${currentUser?.name || ''}"></div>
      <div class="input-group"><label>Reply‑To</label><input type="email" id="replyToEmail" class="auth-input" value="${currentUser?.email || ''}"></div>
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
        headers: {
          'Content-Type':'application/json',
          'Authorization':`Bearer ${authToken}`
        },
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

// ── Settings Modal ───────────────────────────────────
function openSettings() {
  elements.settingsModal.style.display = 'flex';
  // Load current prefs
  const prefs = JSON.parse(localStorage.getItem('letimail_preferences')) || {};
  if (prefs.defaultTone) elements.defaultTone.value = prefs.defaultTone;
  if (prefs.emailLength) elements.defaultEmailLength.value = prefs.emailLength;
}

function closeSettings() {
  elements.settingsModal.style.display = 'none';
}

elements.settingsBtn.addEventListener('click', openSettings);
elements.closeSettingsModal.addEventListener('click', closeSettings);
elements.clearSessionBtn.addEventListener('click', clearSession);
if (elements.clearSessionBtn2) elements.clearSessionBtn2.addEventListener('click', clearSession);

elements.preferencesForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const prefs = {
    defaultTone: elements.defaultTone.value,
    emailLength: elements.defaultEmailLength.value
  };
  localStorage.setItem('letimail_preferences', JSON.stringify(prefs));
  // Apply to main inputs
  elements.tone.value = prefs.defaultTone;
  elements.emailLength.value = prefs.emailLength;
  showNotification('Saved', 'Preferences updated', 'success');
  closeSettings();
});

// ── Event Listeners ──────────────────────────────────
elements.generateBtn.addEventListener('click', generateEmail);
elements.copyBtn.addEventListener('click', copyEmail);
elements.sendBtn.addEventListener('click', showSendEmailModal);
setupEditEmail();

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#userMenu')) {
    elements.userDropdown.style.display = 'none';
  }
});
elements.userAvatar.addEventListener('click', () => {
  elements.userDropdown.style.display = elements.userDropdown.style.display === 'block' ? 'none' : 'block';
});

// ── Initialise on page load ──────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Check if token exists in localStorage (from previous session)
  const savedToken = localStorage.getItem('authToken');
  if (savedToken) {
    authToken = savedToken;
    // Try to fetch user info to verify token is still valid
    try {
      const meRes = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (meRes.ok) {
        const data = await meRes.json();
        currentUser = data.user;
        updateUserInfo(currentUser);
      } else {
        // Invalid token – get new guest
        await initGuestSession();
      }
    } catch {
      await initGuestSession();
    }
  } else {
    await initGuestSession();
  }
});
