// ======================================================
// LETIMAIL SINGLE-PAGE APP - COMPLETE JAVASCRIPT
// ======================================================

// ======================================================
// 1. GLOBAL STATE & CONFIGURATION
// ======================================================

// Global state
let currentUser = null;
let authToken = null;
const BACKEND_URL = process.env.RENDER_BACKEND_URL || 'https://letimail-backend.onrender.com';

// DOM Elements
const elements = {
  notification: document.getElementById('notification'),
  userMenu: document.getElementById('userMenu'),
  userAvatar: document.getElementById('userAvatar'),
  avatarText: document.getElementById('avatarText'),
  logoutBtn: document.getElementById('logoutBtn'),
  generateBtn: document.getElementById('generateBtn'),
  output: document.getElementById('output'),
  actionButtons: document.getElementById('actionButtons'),
  copyBtn: document.getElementById('copyBtn'),
  editBtn: document.getElementById('editBtn'),
  sendBtn: document.getElementById('sendBtn'),
  profileForm: document.getElementById('profileForm'),
  preferencesForm: document.getElementById('preferencesForm'),
  passwordForm: document.getElementById('passwordForm'),
  deleteAccountBtn: document.getElementById('deleteAccountBtn')
};

// ======================================================
// 2. UTILITY FUNCTIONS
// ======================================================

/**
 * Show notification with different types
 */
function showNotification(title, message, type = 'info') {
  if (!elements.notification) return;

  const notification = elements.notification;
  const titleEl = notification.querySelector('.notification-title');
  const messageEl = notification.querySelector('.notification-message');
  const iconEl = notification.querySelector('.notification-icon');
  const closeBtn = notification.querySelector('.notification-close');

  // Set content
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;

  // Set type and icon
  const types = {
    success: { color: 'var(--success)', icon: 'fas fa-check-circle' },
    error: { color: 'var(--error)', icon: 'fas fa-exclamation-circle' },
    warning: { color: 'var(--warning)', icon: 'fas fa-exclamation-triangle' },
    info: { color: 'var(--info)', icon: 'fas fa-info-circle' }
  };

  const typeConfig = types[type] || types.info;
  notification.className = `notification show ${type}`;
  if (iconEl) iconEl.className = `notification-icon ${typeConfig.icon}`;

  // Auto-hide
  setTimeout(() => hideNotification(), 5000);
}

/**
 * Hide notification
 */
function hideNotification() {
  if (elements.notification) {
    elements.notification.classList.remove('show');
  }
}

/**
 * Show loading state on button
 */
function showButtonLoading(button) {
  if (!button) return;

  const btnText = button.querySelector('.btn-text');
  const spinner = button.querySelector('.btn-spinner');

  if (btnText) btnText.style.display = 'none';
  if (spinner) spinner.style.display = 'block';
  button.disabled = true;
}

/**
 * Hide loading state on button
 */
function hideButtonLoading(button) {
  if (!button) return;

  const btnText = button.querySelector('.btn-text');
  const spinner = button.querySelector('.btn-spinner');

  if (btnText) btnText.style.display = 'block';
  if (spinner) spinner.style.display = 'none';
  button.disabled = false;
}

/**
 * Update user avatar with initials
 */
function updateUserAvatar(userName) {
  if (elements.avatarText && userName) {
    elements.avatarText.textContent = userName.charAt(0).toUpperCase();
  }
}

/**
 * Format bytes to KB/MB
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  else return (bytes / 1048576).toFixed(2) + ' MB';
}

// ======================================================
// 3. AUTHENTICATION SYSTEM (SIMPLIFIED - NO OTP)
// ======================================================

/**
 * Initialize app - check auth state on page load
 */
async function initializeApp() {
  console.log('🔄 Initializing LetiMail...');

  // Check if user is already logged in
  await checkAuthState();

  // Setup event listeners
  setupEventListeners();

  // Setup UI elements
  setupNotificationSystem();

  console.log('✅ LetiMail initialized successfully');
}

/**
 * Check authentication state
 */
async function checkAuthState() {
  authToken = localStorage.getItem('authToken');
  currentUser = JSON.parse(localStorage.getItem('currentUser'));

  if (authToken && currentUser) {
    showUserMenu(currentUser);
    updateUserInfo(currentUser);
    showSection('app-section');
    console.log('✅ User is logged in:', currentUser.email);
  } else {
    showAuthButtons();
    showSection('hero');
    console.log('ℹ️ No user logged in');
  }
}

/**
 * Show user menu and hide auth buttons
 */
function showUserMenu(user) {
  if (elements.userMenu) elements.userMenu.style.display = 'flex';
  showAuthButtons(false);
  updateUserAvatar(user.name || user.email);
  updateUserInfo(user);
}

/**
 * Show/hide auth buttons
 */
function showAuthButtons(show = true) {
  const authButtons = document.querySelector('.auth-buttons');
  if (authButtons) authButtons.style.display = show ? 'flex' : 'none';
}

/**
 * Update user info display
 */
function updateUserInfo(user) {
  if (!user) return;

  // Update avatar
  updateUserAvatar(user.name || user.email);

  // Update user menu info if exists
  const planElement = document.getElementById('planType');
  const emailCountElement = document.getElementById('emailCount');

  if (planElement) {
    planElement.textContent = user.plan ? `${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Plan` : 'Free Plan';
  }

  if (emailCountElement) {
    emailCountElement.textContent = user.plan === 'free' ? `${user.emails_left || 0} emails left` : 'Unlimited';
  }
}

/**
 * Handle user signup
 */
async function handleSignup(e) {
  e.preventDefault();
  const button = e.target.querySelector('button[type="submit"]');
  showButtonLoading(button);

  const name = document.getElementById('signupName')?.value;
  const email = document.getElementById('signupEmail')?.value;
  const password = document.getElementById('signupPassword')?.value;

  if (!name || !email || !password) {
    showNotification('Error', 'Please fill in all fields', 'error');
    hideButtonLoading(button);
    return;
  }

  if (password.length < 6) {
    showNotification('Error', 'Password must be at least 6 characters', 'error');
    hideButtonLoading(button);
    return;
  }

  try {
    console.log('📝 Signing up:', email);

    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Save auth data
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      // Show success and redirect
      showNotification('Success', 'Account created successfully!', 'success');
      hideAuthModal();
      showUserMenu(currentUser);
      showSection('app-section');
      console.log('✅ User registered and logged in');

    } else {
      throw new Error(data.error || 'Registration failed');
    }
  } catch (error) {
    console.error('❌ Signup error:', error);
    showNotification('Error', error.message, 'error');
  } finally {
    hideButtonLoading(button);
  }
}

/**
 * Handle user login
 */
async function handleLogin(e) {
  e.preventDefault();
  const button = e.target.querySelector('button[type="submit"]');
  showButtonLoading(button);

  const email = document.getElementById('loginEmail')?.value;
  const password = document.getElementById('loginPassword')?.value;

  if (!email || !password) {
    showNotification('Error', 'Please enter email and password', 'error');
    hideButtonLoading(button);
    return;
  }

  try {
    console.log('🔐 Logging in:', email);

    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Save auth data
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      // Show success
      showNotification('Welcome!', 'Successfully signed in', 'success');
      hideAuthModal();
      showUserMenu(currentUser);
      showSection('app-section');
      console.log('✅ User logged in successfully');

    } else {
      throw new Error(data.error || 'Login failed. Please check your credentials.');
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    showNotification('Error', error.message, 'error');
  } finally {
    hideButtonLoading(button);
  }
}

/**
 * Handle user logout
 */
function handleLogout() {
  // Clear auth data
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');

  // Update UI
  showAuthButtons();
  showSection('hero');
  showNotification('Signed Out', 'You have been successfully signed out', 'info');

  console.log('👋 User logged out');
}

/**
 * Handle getting started - show signup modal
 */
function handleGetStarted() {
  if (elements.userMenu && elements.userMenu.style.display === 'flex') {
    showSection('app-section');
  } else {
    showSignupModal();
  }
}

/**
 * Show signup modal
 */
function showSignupModal() {
  hideAllModals();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'signupModal';

  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="hideAuthModal()">
        <i class="fas fa-times"></i>
      </button>
      <div class="auth-header">
        <h3>Create Your Account</h3>
        <p>Join thousands of professionals using LetiMail</p>
      </div>
      <form id="signupForm" class="auth-form">
        <div class="input-group">
          <label for="signupName">Full Name</label>
          <input type="text" id="signupName" required class="auth-input" placeholder="Enter your full name">
        </div>
        <div class="input-group">
          <label for="signupEmail">Email</label>
          <input type="email" id="signupEmail" required class="auth-input" placeholder="Enter your email">
        </div>
        <div class="input-group">
          <label for="signupPassword">Password</label>
          <input type="password" id="signupPassword" required class="auth-input" placeholder="Create a password (min. 6 characters)" minlength="6">
        </div>
        <button type="submit" class="auth-btn primary">
          <span class="btn-text">Create Account</span>
          <div class="btn-spinner"></div>
        </button>
      </form>
      <div class="auth-footer">
        <p>Already have an account? <a href="#" id="showLoginFromSignup" class="link">Sign in</a></p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';

  // Setup event listeners for the modal
  document.getElementById('signupForm').addEventListener('submit', handleSignup);
  document.getElementById('showLoginFromSignup').addEventListener('click', (e) => {
    e.preventDefault();
    showLoginModal();
  });
}

/**
 * Show login modal
 */
function showLoginModal() {
  hideAllModals();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'loginModal';

  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="hideAuthModal()">
        <i class="fas fa-times"></i>
      </button>
      <div class="auth-header">
        <h3>Welcome Back</h3>
        <p>Sign in to your LetiMail account</p>
      </div>
      <form id="loginForm" class="auth-form">
        <div class="input-group">
          <label for="loginEmail">Email</label>
          <input type="email" id="loginEmail" required class="auth-input" placeholder="Enter your email">
        </div>
        <div class="input-group">
          <label for="loginPassword">Password</label>
          <input type="password" id="loginPassword" required class="auth-input" placeholder="Enter your password">
        </div>
        <button type="submit" class="auth-btn primary">
          <span class="btn-text">Sign In</span>
          <div class="btn-spinner"></div>
        </button>
      </form>
      <div class="auth-footer">
        <p>Don't have an account? <a href="#" id="showSignupFromLogin" class="link">Sign up</a></p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';

  // Setup event listeners
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('showSignupFromLogin').addEventListener('click', (e) => {
    e.preventDefault();
    showSignupModal();
  });
}

/**
 * Hide all auth modals
 */
function hideAuthModal() {
  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => {
    if (modal) modal.style.display = 'none';
  });
}

/**
 * Hide all modals (generic)
 */
function hideAllModals() {
  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => {
    if (modal) modal.remove();
  });
}

/**
 * Reset forms
 */
function resetForms() {
  const forms = document.querySelectorAll('.auth-form');
  forms.forEach(form => {
    form.reset();
  });
}

/**
 * Delete account
 */
async function handleDeleteAccount() {
  if (!confirm('⚠️ Are you sure? This action cannot be undone!')) {
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/delete-account`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (response.ok) {
      showNotification('Account Deleted', 'Your account has been successfully deleted.', 'success');
      handleLogout();
    } else {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete account');
    }
  } catch (error) {
    console.error('Delete account error:', error);
    showNotification('Error', error.message, 'error');
  }
}

// ======================================================
// 4. EMAIL GENERATION SYSTEM (CORE FUNCTIONALITY)
// ======================================================

/**
 * Generate email with tone matching
 */
async function generateEmail() {
  if (!currentUser || !authToken) {
    showNotification('Authentication Required', 'Please sign in to generate emails', 'error');
    showLoginModal();
    return;
  }

  const business = document.getElementById('businessDesc')?.value;
  const context = document.getElementById('context')?.value;
  const tone = document.getElementById('tone')?.value;
  const emailLength = document.getElementById('emailLength')?.value || 'medium';

  if (!business || !context) {
    showNotification('Error', 'Please fill in all fields', 'error');
    return;
  }

  // Show loading state
  const button = elements.generateBtn;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
  }

  if (elements.output) {
    elements.output.innerHTML = `
      <div class="output-placeholder">
        <div class="placeholder-animation">
          <div class="animation-ring"></div>
          <div class="placeholder-icon">✉️</div>
        </div>
        <p>Generating your personalized email...</p>
        <small>AI is analyzing your writing style and creating the perfect email</small>
      </div>
    `;
  }

  try {
    console.log('🎯 Generating email for:', currentUser.email);

    const response = await fetch(`${BACKEND_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        business,
        context,
        tone,
        emailLength
      })
    });

    const data = await response.json();

    if (response.ok && data.email) {
      // Display the generated email
      if (elements.output) {
        elements.output.innerHTML = '';
        elements.output.innerText = data.email;
        elements.output.setAttribute('data-original-email', data.email);
      }

      // Show action buttons
      if (elements.actionButtons) {
        elements.actionButtons.style.display = 'flex';
      }

      showNotification('Success', 'Email generated successfully!', 'success');
      console.log('✅ Email generated successfully');

    } else {
      throw new Error(data.error || 'Failed to generate email. Please try again.');
    }

  } catch (error) {
    console.error('❌ Generation error:', error);

    const errorMessage = error.message.includes('Backend connection')
      ? 'Could not connect to the AI service. Please try again later.'
      : error.message;

    if (elements.output) {
      elements.output.innerHTML = `
        <div class="output-placeholder">
          <div class="error-icon">❌</div>
          <p>Failed to generate email</p>
          <small>\${errorMessage}</small>
          <button onclick="generateEmail()" class="retry-btn">Try Again</button>
        </div>
      `;
    }

    showNotification('Error', errorMessage, 'error');

  } finally {
    // Reset button state
    if (button) {
      button.disabled = false;
      button.innerHTML = '<span class="btn-icon">✨</span><span class="btn-text">Generate My Email</span>';
    }
  }
}

/**
 * Copy email to clipboard
 */
function copyEmail() {
  if (!elements.output || !elements.output.innerText) {
    showNotification('Error', 'No email content to copy', 'error');
    return;
  }

  const text = elements.output.innerText;

  navigator.clipboard.writeText(text)
    .then(() => {
      showNotification('Copied!', 'Email copied to clipboard', 'success');
    })
    .catch(err => {
      showNotification('Error', 'Failed to copy email', 'error');
      console.error('Copy error:', err);
    });
}

/**
 * Edit email functionality
 */
function setupEditEmail() {
  if (!elements.editBtn) return;

  elements.editBtn.addEventListener('click', function() {
    const outputDiv = elements.output;
    const currentText = outputDiv?.innerText || '';

    if (!currentText || currentText.includes('Your personalized email') || currentText.includes('Generating')) {
      showNotification('Error', 'Please generate an email first', 'error');
      return;
    }

    // Toggle edit mode
    const isEditing = outputDiv.dataset.editMode === 'true';

    if (!isEditing) {
      // Enter edit mode
      outputDiv.dataset.editMode = 'true';
      outputDiv.dataset.originalContent = currentText;

      outputDiv.innerHTML = `
        <textarea class="email-editor-textarea" rows="15">\${currentText}</textarea>
        <div class="edit-actions">
          <button id="cancelEditBtn" class="cancel-edit-btn">Cancel</button>
          <button id="saveEditBtn" class="submit-edit-btn">Save Changes</button>
        </div>
      `;

      // Focus textarea
      const textarea = outputDiv.querySelector('.email-editor-textarea');
      if (textarea) textarea.focus();

      // Setup save/cancel buttons
      document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);
      document.getElementById('saveEditBtn')?.addEventListener('click', saveEdit);

      elements.editBtn.innerHTML = '<span class="btn-icon">💾</span> Save Changes';

    } else {
      // Exit edit mode (cancel)
      cancelEdit();
    }
  });
}

function cancelEdit() {
  const outputDiv = elements.output;
  if (!outputDiv) return;

  outputDiv.innerText = outputDiv.dataset.originalContent || '';
  outputDiv.removeAttribute('data-edit-mode');
  outputDiv.removeAttribute('data-original-content');

  if (elements.editBtn) {
    elements.editBtn.innerHTML = '<span class="btn-icon">✏️</span> Edit Email';
  }
}

async function saveEdit() {
  const outputDiv = elements.output;
  if (!outputDiv) return;

  const textarea = outputDiv.querySelector('.email-editor-textarea');
  if (!textarea) return;

  const editedText = textarea.value.trim();
  const originalText = outputDiv.dataset.originalContent || '';

  if (!editedText) {
    showNotification('Error', 'Email cannot be empty', 'error');
    return;
  }

  // Show loading state
  const editBtn = elements.editBtn;
  if (editBtn) {
    editBtn.disabled = true;
    editBtn.innerHTML = '<span class="btn-icon">⏳</span> Saving...';
  }

  try {
    // Send to backend for polishing
    const response = await fetch(`${BACKEND_URL}/api/polish-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        originalEmail: originalText,
        editedEmail: editedText
      })
    });

    const data = await response.json();

    if (response.ok && data.polishedEmail) {
      // Display polished email
      outputDiv.innerText = data.polishedEmail;
      outputDiv.setAttribute('data-original-email', data.polishedEmail);

      showNotification('Success', 'Email polished and saved!', 'success');
    } else {
      // Use edited text directly
      outputDiv.innerText = editedText;
      outputDiv.setAttribute('data-original-email', editedText);
      showNotification('Saved', 'Your edits have been saved', 'info');
    }

  } catch (error) {
    console.error('Edit save error:', error);
    outputDiv.innerText = editedText;
    outputDiv.setAttribute('data-original-email', editedText);
    showNotification('Saved', 'Your edits have been saved', 'success');
  } finally {
    // Reset edit mode and button
    outputDiv.removeAttribute('data-edit-mode');
    outputDiv.removeAttribute('data-original-content');

    if (editBtn) {
      editBtn.disabled = false;
      editBtn.innerHTML = '<span class="btn-icon">✏️</span> Edit Email';
    }
  }
}

/**
 * Show send email modal
 */
function showSendEmailModal() {
  const outputDiv = elements.output;
  const emailContent = outputDiv?.innerText || '';

  if (!emailContent || emailContent.includes('Your personalized email') || emailContent.includes('Generating')) {
    showNotification('Error', 'Please generate an email first', 'error');
    return;
  }

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'sendEmailModal';

  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeSendModal()">
        <i class="fas fa-times"></i>
      </button>
      <h3>Send Email</h3>
      <p class="modal-description">Send your generated email directly from LetiMail.</p>

      <div class="input-group">
        <label for="recipientEmail">Recipient Email</label>
        <input type="email" id="recipientEmail" class="auth-input" placeholder="recipient@example.com" required>
      </div>

      <div class="input-group">
        <label for="businessName">Business Name</label>
        <input type="text" id="businessName" class="auth-input" placeholder="Your Business Name" value="${currentUser?.name || ''}" required>
      </div>

      <div class="input-group">
        <label for="replyToEmail">Reply-To Email</label>
        <input type="email" id="replyToEmail" class="auth-input" placeholder="your-email@example.com" value="${currentUser?.email || ''}" required>
        <span class="input-hint">Replies will be sent directly to this email</span>
      </div>

      <div class="modal-actions">
        <button class="settings-btn secondary" onclick="closeSendModal()">Cancel</button>
        <button class="settings-btn primary" id="sendEmailConfirmBtn">
          <i class="fas fa-paper-plane"></i> Send Email
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';

  // Focus on recipient email field
  setTimeout(() => {
    const recipientInput = document.getElementById('recipientEmail');
    recipientInput?.focus();
  }, 100);

  // Setup send button
  document.getElementById('sendEmailConfirmBtn')?.addEventListener('click', confirmSendEmail);
}

/**
 * Close send email modal
 */
function closeSendModal() {
  const modal = document.getElementById('sendEmailModal');
  if (modal) modal.remove();
}

/**
 * Confirm and send email
 */
async function confirmSendEmail() {
  const to = document.getElementById('recipientEmail')?.value?.trim();
  const businessName = document.getElementById('businessName')?.value?.trim();
  const replyToEmail = document.getElementById('replyToEmail')?.value?.trim();
  const outputDiv = elements.output;

  // Validate inputs
  if (!to || !businessName || !replyToEmail || !outputDiv?.innerText) {
    showNotification('Error', 'Please fill in all required fields', 'error');
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+\$/;
  if (!emailRegex.test(to)) {
    showNotification('Error', 'Please enter a valid recipient email', 'error');
    return;
  }

  if (!emailRegex.test(replyToEmail)) {
    showNotification('Error', 'Please enter a valid reply-to email', 'error');
    return;
  }

  // Show loading state
  const sendBtn = document.getElementById('sendEmailConfirmBtn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="btn-spinner"></span> Sending...';
  }

  try {
    const emailContent = outputDiv.innerText;
    const subjectMatch = emailContent.match(/^Subject:\s*(.+)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : 'Professional Communication';

    console.log('📤 Sending email to:', to);

    const response = await fetch(`${BACKEND_URL}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        to,
        subject,
        content: emailContent,
        businessName,
        replyToEmail
      })
    });

    const data = await response.json();

    if (response.ok) {
      showNotification('Email Sent!', `Email successfully sent to ${to}`, 'success');
      closeSendModal();

      // Update email count if free user
      if (currentUser?.plan === 'free') {
        currentUser.emails_used = (currentUser.emails_used || 0) + 1;
        updateUserInfo(currentUser);
      }

    } else {
      throw new Error(data.error || 'Failed to send email. Please try again.');
    }

  } catch (error) {
    console.error('Send error:', error);
    showNotification('Error', error.message, 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Email';
    }
  }
}

// ======================================================
// 5. SETTINGS SYSTEM
// ======================================================

/**
 * Setup settings page
 */
function setupSettingsPage() {
  if (!document.getElementById('settings-panels')) return;

  // Setup tab switching
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', function() {
      const tab = this.getAttribute('data-tab');
      switchSettingsTab(tab);
    });
  });

  // Setup forms
  if (elements.profileForm) {
    elements.profileForm.addEventListener('submit', handleProfileUpdate);
  }

  if (elements.preferencesForm) {
    elements.preferencesForm.addEventListener('submit', handlePreferencesUpdate);
  }

  if (elements.passwordForm) {
    elements.passwordForm.addEventListener('submit', handlePasswordChange);
  }

  if (elements.deleteAccountBtn) {
    elements.deleteAccountBtn.addEventListener('click', handleDeleteAccount);
  }

  // Load initial data
  updateSettingsPage();
  loadToneManagementUI();
}

/**
 * Update settings page with user data
 */
function updateSettingsPage() {
  if (!currentUser || !document.getElementById('settings-panels')) return;

  // Profile tab
  document.getElementById('profileName')?.value = currentUser.name || '';
  document.getElementById('profileEmail')?.value = currentUser.email || '';
  document.getElementById('profileCompany')?.value = currentUser.company || '';
  document.getElementById('profileRole')?.value = currentUser.role || '';

  // Subscription tab
  document.getElementById('currentPlanName')?.textContent = currentUser.plan ?
    `${currentUser.plan.charAt(0).toUpperCase() + currentUser.plan.slice(1)} Plan` : 'Free Plan';

  document.getElementById('emailsUsed')?.textContent = `${currentUser.emails_used || 0}/10`;
  document.getElementById('trialDays')?.textContent = currentUser.plan === 'free' ? '5 days' : 'Unlimited';

  // Preferences tab
  document.getElementById('defaultTone')?.value = currentUser.defaultTone || 'friendly';
  document.getElementById('emailLength')?.value = currentUser.emailLength || 'medium';
  document.getElementById('autoSave')?.checked = currentUser.autoSave !== false;
  document.getElementById('spellCheck')?.checked = currentUser.spellCheck !== false;
}

/**
 * Switch between settings tabs
 */
function switchSettingsTab(tabName) {
  // Update nav items
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-tab') === tabName) {
      item.classList.add('active');
    }
  });

  // Update panels
  const panels = document.querySelectorAll('.settings-panel');
  panels.forEach(panel => {
    panel.classList.remove('active');
    if (panel.id === `${tabName}-panel`) {
      panel.classList.add('active');
    }
  });

  // Load tone management if switching to tone tab
  if (tabName === 'tone') {
    setTimeout(() => loadToneManagementUI(), 50);
  }
}

/**
 * Handle profile update
 */
async function handleProfileUpdate(e) {
  e.preventDefault();
  const button = e.target.querySelector('button[type="submit"]');
  showButtonLoading(button);

  try {
    const name = document.getElementById('profileName')?.value;
    const company = document.getElementById('profileCompany')?.value;
    const role = document.getElementById('profileRole')?.value;

    if (!name) {
      showNotification('Error', 'Name is required', 'error');
      return;
    }

    const response = await fetch(`${BACKEND_URL}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ name, company, role })
    });

    const data = await response.json();

    if (response.ok) {
      currentUser.name = name;
      currentUser.company = company;
      currentUser.role = role;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      showNotification('Success', 'Profile updated successfully!', 'success');
      updateUserInfo(currentUser);
      updateSettingsPage();

      // Update avatar if name changed
      updateUserAvatar(name);
    } else {
      throw new Error(data.error || 'Failed to update profile');
    }

  } catch (error) {
    console.error('Profile update error:', error);
    showNotification('Error', error.message, 'error');
  } finally {
    hideButtonLoading(button);
  }
}

/**
 * Handle preferences update
 */
async function handlePreferencesUpdate(e) {
  e.preventDefault();
  const button = e.target.querySelector('button[type="submit"]');
  showButtonLoading(button);

  try {
    const defaultTone = document.getElementById('defaultTone')?.value;
    const emailLength = document.getElementById('emailLength')?.value;
    const autoSave = document.getElementById('autoSave')?.checked;
    const spellCheck = document.getElementById('spellCheck')?.checked;

    // Save preferences
    const preferences = { defaultTone, emailLength, autoSave, spellCheck };
    localStorage.setItem('letimail_preferences', JSON.stringify(preferences));

    // Update current user
    currentUser.defaultTone = defaultTone;
    currentUser.emailLength = emailLength;
    currentUser.autoSave = autoSave;
    currentUser.spellCheck = spellCheck;

    // Send to backend if authenticated
    if (authToken) {
      await fetch(`${BACKEND_URL}/api/auth/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(preferences)
      });
    }

    showNotification('Success', 'Preferences saved successfully!', 'success');

  } catch (error) {
    console.error('Preferences error:', error);
    showNotification('Error', error.message || 'Failed to save preferences', 'error');
  } finally {
    hideButtonLoading(button);
  }
}

/**
 * Handle password change
 */
async function handlePasswordChange(e) {
  e.preventDefault();
  const button = e.target.querySelector('button[type="submit"]');
  showButtonLoading(button);

  try {
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      showNotification('Error', 'Please fill in all password fields', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showNotification('Error', 'New passwords do not match', 'error');
      return;
    }

    if (newPassword.length < 6) {
      showNotification('Error', 'Password must be at least 6 characters', 'error');
      return;
    }

    const response = await fetch(`${BACKEND_URL}/api/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    if (response.ok) {
      showNotification('Success', 'Password updated successfully!', 'success');
      e.target.reset();
    } else {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update password');
    }

  } catch (error) {
    console.error('Password change error:', error);
    showNotification('Error', error.message, 'error');
  } finally {
    hideButtonLoading(button);
  }
}

// ======================================================
// 6. SECTION NAVIGATION
// ======================================================

/**
 * Show specific section and hide others
 */
function showSection(sectionId) {
  // Hide all sections
  const sections = document.querySelectorAll('section');
  sections.forEach(section => {
    section.style.display = 'none';
  });

  // Show target section
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.style.display = 'block';
    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Update active nav links
  const navLinks = document.querySelectorAll('.nav-container a[href^="#"]');
  navLinks.forEach(link => {
    link.style.color = link.getAttribute('href') === `#${sectionId}` ? 'var(--accent-primary)' : '';
  });
}

/**
 * Setup notification system
 */
function setupNotificationSystem() {
  if (!elements.notification) return;

  // Close button
  elements.notification.querySelector('.notification-close')?.addEventListener('click', hideNotification);

  // Auto-hide after 5 seconds
  elements.notification.addEventListener('animationend', (e) => {
    if (e.animationName === 'notificationSlideIn' && elements.notification.classList.contains('show')) {
      setTimeout(hideNotification, 5000);
    }
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Logout button
  elements.logoutBtn?.addEventListener('click', handleLogout);

  // Generate email button
  elements.generateBtn?.addEventListener('click', generateEmail);

  // Copy, edit, send buttons
  elements.copyBtn?.addEventListener('click', copyEmail);
  elements.sendBtn?.addEventListener('click', showSendEmailModal);

  // Setup edit email functionality
  setupEditEmail();

  // Close modal when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      hideAllModals();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideAllModals();
    }
  });
}

// ======================================================
// 7. INITIALIZATION
// ======================================================

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Expose functions to global scope for HTML onclick handlers
window.showLoginModal = showLoginModal;
window.showSignupModal = showSignupModal;
window.hideAuthModal = hideAuthModal;
window.handleGetStarted = handleGetStarted;
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.handleDeleteAccount = handleDeleteAccount;
window.generateEmail = generateEmail;
window.copyEmail = copyEmail;
window.showSection = showSection;
window.switchSettingsTab = switchSettingsTab;

// ======================================================
// 8. UTILITY FUNCTIONS
// ======================================================

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Truncate text
 */
function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Check if element is in viewport
 */
function isInViewport(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Smooth scroll to element
 */
function smoothScrollTo(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
}

// ======================================================
// 9. PERFORMANCE MONITORING
// ======================================================

// Track performance
if (console.time) {
  console.time('LetiMail Initialization');
}

// Track page load
window.addEventListener('load', () => {
  if (console.timeEnd) {
    console.timeEnd('LetiMail Initialization');
  }

  // Add performance metrics to console
  if (window.performance) {
    const perfData = window.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
    console.log(`🚀 Page loaded in ${pageLoadTime}ms`);
  }
});

// ======================================================
// 10. ERROR HANDLING & FALLBACKS
// ======================================================

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  showNotification('Error', 'Something went wrong. Please refresh the page.', 'error');
});

// Unhandled rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  showNotification('Error', 'An error occurred. Please try again.', 'error');
});

// Offline detection
window.addEventListener('offline', () => {
  showNotification('Offline', 'You are currently offline. Some features may not work.', 'warning');
});

window.addEventListener('online', () => {
  showNotification('Online', 'Connection restored!', 'success');
});

// ======================================================
// 11. FINAL INITIALIZATION
// ======================================================

console.log('✅ LetiMail Single-Page App Loaded Successfully!');
console.log('📦 Version: 2.0.0');
console.log('🔧 Backend URL:', BACKEND_URL);
