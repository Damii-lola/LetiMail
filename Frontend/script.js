// Global State
let currentUser = null;
let authToken = null;
let signupData = {};
let emailHistory = [];
let toneProfile = {};
let userPreferences = {};
let isEditing = false;
let originalEmailContent = '';
let currentEditMode = null;

// Configuration
const BACKEND_URL = 'https://letimail-production.up.railway.app';
const DEV_MODE = true; // Set to false in production

// DOM Elements Cache
const elements = {
  // Auth elements
  loginBtn: null,
  signupBtn: null,
  userMenu: null,
  authButtons: null,
  logoutBtn: null,

  // App elements
  generateBtn: null,
  copyBtn: null,
  editBtn: null,
  sendBtn: null,
  outputDiv: null,
  businessDesc: null,
  context: null,
  toneSelect: null,
  emailLength: null,
  actionButtons: null,

  // Modals
  authModals: null,
  signupModal: null,
  loginModal: null,
  sendEmailModal: null,

  // Settings elements
  settingsPanels: null,
  navItems: null,
  profileForm: null,
  preferencesForm: null,
  toneManagement: null,

  // Notification
  notification: null
};

// Tone Profile Manager
const ToneProfileManager = {
  // Get all reference emails
  getReferenceEmails: function() {
    const training = localStorage.getItem('letimail_tone_training');
    const edited = localStorage.getItem('letimail_edited_emails');

    const trainingEmails = training ? JSON.parse(training).emails || [] : [];
    const editedEmails = edited ? JSON.parse(edited) || [] : [];

    return {
      training: trainingEmails,
      edited: editedEmails,
      all: [...trainingEmails, ...editedEmails]
    };
  },

  // Add training email
  addTrainingEmail: function(emailContent) {
    const data = localStorage.getItem('letimail_tone_training');
    const profile = data ? JSON.parse(data) : { emails: [], trained: false };

    profile.emails.push({
      content: emailContent,
      dateAdded: new Date().toISOString(),
      id: Date.now()
    });

    profile.trained = true;
    profile.lastUpdated = new Date().toISOString();

    localStorage.setItem('letimail_tone_training', JSON.stringify(profile));
    return profile;
  },

  // Update training email
  updateTrainingEmail: function(id, newContent) {
    const data = localStorage.getItem('letimail_tone_training');
    if (!data) return null;

    const profile = JSON.parse(data);
    const emailIndex = profile.emails.findIndex(e => e.id === id);

    if (emailIndex !== -1) {
      profile.emails[emailIndex].content = newContent;
      profile.emails[emailIndex].lastEdited = new Date().toISOString();
      profile.lastUpdated = new Date().toISOString();

      localStorage.setItem('letimail_tone_training', JSON.stringify(profile));
      return profile;
    }
    return null;
  },

  // Delete training email
  deleteTrainingEmail: function(id) {
    const data = localStorage.getItem('letimail_tone_training');
    if (!data) return null;

    const profile = JSON.parse(data);
    profile.emails = profile.emails.filter(e => e.id !== id);
    profile.lastUpdated = new Date().toISOString();

    localStorage.setItem('letimail_tone_training', JSON.stringify(profile));
    return profile;
  },

  // Save edited email
  saveEditedEmail: function(originalEmail, editedEmail) {
    // Only save if significantly edited (more than 30% changed)
    const similarity = this.calculateSimilarity(originalEmail, editedEmail);

    if (similarity < 0.7) { // More than 30% different
      const data = localStorage.getItem('letimail_edited_emails');
      const editedEmails = data ? JSON.parse(data) : [];

      editedEmails.push({
        content: editedEmail,
        original: originalEmail,
        dateEdited: new Date().toISOString(),
        id: Date.now(),
        similarity: similarity
      });

      // Keep only last 20 edited emails
      if (editedEmails.length > 20) {
        editedEmails.shift();
      }

      localStorage.setItem('letimail_edited_emails', JSON.stringify(editedEmails));
      return true;
    }
    return false;
  },

  // Calculate text similarity
  calculateSimilarity: function(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  },

  // Analyze writing style
  analyzeWritingStyle: function(emails) {
    if (!emails || emails.length === 0) return null;

    const allText = emails.map(e => typeof e === 'string' ? e : e.content).join(' ');
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = allText.split(/\s+/);

    // Calculate metrics
    const avgSentenceLength = words.length / sentences.length;
    const avgWordLength = allText.replace(/\s/g, '').length / words.length;

    // Common phrases
    const commonPhrases = this.extractCommonPhrases(allText);

    // Formality indicators
    const contractions = (allText.match(/n't|'m|'re|'ve|'ll|'d/g) || []).length;
    const formalWords = (allText.match(/\b(furthermore|moreover|therefore|consequently|nevertheless|hence|thus)\b/gi) || []).length;

    // Sentiment analysis (simple)
    const positiveWords = (allText.match(/\b(excellent|great|wonderful|fantastic|amazing|awesome|perfect|outstanding)\b/gi) || []).length;
    const negativeWords = (allText.match(/\b(poor|bad|terrible|awful|horrible|disappointing)\b/gi) || []).length;

    return {
      avgSentenceLength: Math.round(avgSentenceLength),
      avgWordLength: Math.round(avgWordLength),
      totalEmails: emails.length,
      commonPhrases: commonPhrases.slice(0, 5),
      usesContractions: contractions > 5,
      formalityScore: Math.min(100, Math.round(formalityWords / (words.length / 100) * 100)),
      sentimentScore: positiveWords - negativeWords,
      sentences: sentences.slice(0, 3).map(s => s.trim())
    };
  },

  // Extract common phrases
  extractCommonPhrases: function(text) {
    const words = text.toLowerCase().split(/\s+/);
    const phrases = {};

    // Extract 2-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      phrases[phrase] = (phrases[phrase] || 0) + 1;
    }

    // Extract 3-word phrases
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      phrases[phrase] = (phrases[phrase] || 0) + 1;
    }

    return Object.entries(phrases)
      .filter(([_, count]) => count > 1) // Only phrases that appear more than once
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, 10) // Take top 10
      .map(([phrase]) => phrase);
  },

  // Generate style prompt for AI
  generateStylePrompt: function() {
    const refs = this.getReferenceEmails();

    if (refs.all.length === 0) {
      return '';
    }

    const style = this.analyzeWritingStyle(refs.all);

    let prompt = `\n\nWRITING STYLE GUIDELINES:
The user has provided ${style.totalEmails} reference email${style.totalEmails !== 1 ? 's' : ''}. Adapt to their unique style:

WRITING CHARACTERISTICS:
- Average sentence length: ${style.avgSentenceLength} words
- Average word length: ${style.avgWordLength} characters
- ${style.usesContractions ? 'Uses contractions frequently (e.g., I\'m, don\'t, can\'t)' : 'Prefers full forms (e.g., I am, do not, cannot)'}
- Formality level: ${style.formalityScore > 70 ? 'High' : style.formalityScore > 40 ? 'Medium' : 'Low'}
- Sentiment tendency: \${style.sentimentScore > 0 ? 'Positive' : style.sentimentScore < 0 ? 'Negative' : 'Neutral'}`;

    if (style.commonPhrases.length > 0) {
      prompt += `
COMMON PHRASES TO INCORPORATE:
- "\${style.commonPhrases.join('"
- "')}"`;
    }

    if (style.sentences.length > 0) {
      prompt += `
EXAMPLE SENTENCES FROM USER:
\${style.sentences.map((sentence, i) => `${i + 1}. "${sentence}"`).join('\n')}`;
    }

    prompt += `
MATCH THIS STYLE CLOSELY:
- Use similar sentence structures and length
- Maintain the same level of formality
- Incorporate common phrases where natural
- Preserve the overall tone and sentiment
- Make it sound like the user wrote it themselves`;

    return prompt;
  }
};

// Utility Functions
function showNotification(title, message, type = 'info', duration = 5000) {
  const notification = document.getElementById('notification');
  if (!notification) {
    console.log(`${type.toUpperCase()}: ${title} - ${message}`);
    return;
  }

  const titleEl = notification.querySelector('.notification-title');
  const messageEl = notification.querySelector('.notification-message');
  const iconEl = notification.querySelector('.notification-icon');

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;

  // Set notification type
  notification.className = `notification ${type}`;
  notification.classList.add('show');

  // Set appropriate icon
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };

  if (iconEl) {
    iconEl.className = `notification-icon ${icons[type] || icons.info}`;
  }

  // Auto-hide after duration
  setTimeout(() => {
    notification.classList.remove('show');
  }, duration);
}

function showButtonLoading(button) {
  if (!button) return;

  const btnText = button.querySelector('.btn-text');
  const spinner = button.querySelector('.btn-spinner');

  if (btnText) btnText.style.display = 'none';
  if (spinner) spinner.style.display = 'block';
  button.disabled = true;
}

function hideButtonLoading(button) {
  if (!button) return;

  const btnText = button.querySelector('.btn-text');
  const spinner = button.querySelector('.btn-spinner');

  if (btnText) btnText.style.display = 'block';
  if (spinner) spinner.style.display = 'none';
  button.disabled = false;
}

function cacheDOMElements() {
  // Auth elements
  elements.loginBtn = document.getElementById('loginBtn');
  elements.signupBtn = document.getElementById('signupBtn');
  elements.userMenu = document.getElementById('userMenu');
  elements.authButtons = document.getElementById('authButtons');
  elements.logoutBtn = document.getElementById('logoutBtn');

  // App elements
  elements.generateBtn = document.getElementById('generateBtn');
  elements.copyBtn = document.getElementById('copyBtn');
  elements.editBtn = document.getElementById('editBtn');
  elements.sendBtn = document.getElementById('sendBtn');
  elements.outputDiv = document.getElementById('output');
  elements.businessDesc = document.getElementById('businessDesc');
  elements.context = document.getElementById('context');
  elements.toneSelect = document.getElementById('tone');
  elements.emailLength = document.getElementById('emailLength');
  elements.actionButtons = document.getElementById('actionButtons');

  // Modals
  elements.authModals = document.getElementById('authModals');
  elements.signupModal = document.getElementById('signupModal');
  elements.loginModal = document.getElementById('loginModal');

  // Settings elements
  elements.settingsPanels = document.getElementById('settings-panels');
  elements.navItems = document.querySelectorAll('.nav-item');
  elements.profileForm = document.getElementById('profileForm');
  elements.preferencesForm = document.getElementById('preferencesForm');
  elements.toneManagement = document.getElementById('toneManagement');

  // Notification
  elements.notification = document.getElementById('notification');
}

function setupEventListeners() {
  // Auth buttons
  if (elements.loginBtn) {
    elements.loginBtn.addEventListener('click', showLoginModal);
  }

  if (elements.signupBtn) {
    elements.signupBtn.addEventListener('click', showSignupModal);
  }

  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', handleLogout);
  }

  // User menu dropdown
  const userAvatar = document.getElementById('userAvatar');
  if (userAvatar) {
    userAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = userAvatar.nextElementSibling;
      if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
      }
    });

    document.addEventListener('click', () => {
      const dropdowns = document.querySelectorAll('.dropdown-menu');
      dropdowns.forEach(dropdown => {
        dropdown.style.display = 'none';
      });
    });
  }

  // Form submissions
  document.addEventListener('submit', function(e) {
    if (e.target.id === 'loginForm') {
      e.preventDefault();
      handleLogin(e);
    }
    if (e.target.id === 'profileForm') {
      e.preventDefault();
      handleProfileUpdate(e);
    }
    if (e.target.id === 'preferencesForm') {
      e.preventDefault();
      handlePreferencesUpdate(e);
    }
  });

  // Modal close buttons
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-close')) {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.style.display = 'none';
    }

    if (e.target.id === 'showLoginFromSignup') {
      e.preventDefault();
      showLoginModal();
    }

    if (e.target.id === 'showSignupFromLogin') {
      e.preventDefault();
      showSignupModal();
    }

    if (e.target.classList.contains('modal-overlay')) {
      hideAllModals();
    }
  });

  // App buttons
  if (elements.generateBtn) {
    elements.generateBtn.addEventListener('click', generateEmailWithTone);
  }

  if (elements.copyBtn) {
    elements.copyBtn.addEventListener('click', copyEmailToClipboard);
  }

  if (elements.editBtn) {
    elements.editBtn.addEventListener('click', startEmailEditing);
  }

  if (elements.sendBtn) {
    elements.sendBtn.addEventListener('click', showSendEmailModal);
  }

  // Settings navigation
  if (elements.navItems) {
    elements.navItems.forEach(item => {
      item.addEventListener('click', function() {
        const tab = this.getAttribute('data-tab');
        switchSettingsTab(tab);
      });
    });
  }
}

function initializePageSpecificFeatures() {
  const currentPage = window.location.pathname;

  if (currentPage.includes('app.html')) {
    setupEnhancedAppFunctions();
    loadEmailHistory();
  } else if (currentPage.includes('settings.html')) {
    setupSettingsPage();
    loadToneManagementUI();
    loadUserPreferences();
  }
}

// Auth Functions
async function checkAuthState() {
  authToken = localStorage.getItem('authToken');

  if (!authToken) {
    showAuthButtons();
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;

      // Store user data in global state
      toneProfile = currentUser.tone_profile || {};
      userPreferences = currentUser.preferences || {};
      emailHistory = [];

      showUserMenu(currentUser);
      updateEmailTracking();

      // Update settings page if we're on settings.html
      if (window.location.pathname.includes('settings.html')) {
        updateSettingsPage();
      }

      // Check if user needs upgrade
      if (currentUser.plan === 'free' && currentUser.emails_used >= 5) {
        setTimeout(showUpgradePrompt, 2000);
      }
    } else {
      // Token is invalid, clear it and show auth buttons
      localStorage.removeItem('authToken');
      authToken = null;
      currentUser = null;
      showAuthButtons();

      // If we're on a protected page, redirect to index
      if (window.location.pathname.includes('settings.html') ||
          window.location.pathname.includes('app.html')) {
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      }
    }
  } catch (error) {
    console.error('Auth check error:', error);
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    showAuthButtons();
  }
}

function showUserMenu(user) {
  if (elements.userMenu) elements.userMenu.style.display = 'flex';
  if (elements.authButtons) elements.authButtons.style.display = 'none';

  updateUserAvatar(user.name || user.email);
  updateUserInfo(user);
}

function showAuthButtons() {
  if (elements.userMenu) elements.userMenu.style.display = 'none';
  if (elements.authButtons) elements.authButtons.style.display = 'flex';
}

function updateUserAvatar(userName) {
  const avatarElements = document.querySelectorAll('#avatarText');
  avatarElements.forEach(element => {
    if (userName) {
      element.textContent = userName.charAt(0).toUpperCase();
    }
  });
}

function updateUserInfo(user) {
  const planElement = document.getElementById('planType');
  if (planElement) {
    planElement.textContent = user.plan ?
      `${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Plan` :
      'Free Plan';
  }

  updateEmailTracking();
}

function updateEmailTracking() {
  if (!currentUser) return;

  const emailCountElement = document.getElementById('emailCount');
  const emailsUsedElement = document.getElementById('emailsUsed');

  if (emailCountElement) {
    if (currentUser.plan === 'free') {
      const emailsLeft = Math.max(0, 10 - (currentUser.emails_used || 0));
      emailCountElement.textContent = `${emailsLeft} emails left`;
    } else {
      emailCountElement.textContent = 'Unlimited emails';
    }
  }

  if (emailsUsedElement) {
    emailsUsedElement.textContent = `${currentUser.emails_used || 0}/10`;
  }
}

function handleLogout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');

  showAuthButtons();
  showNotification('Signed Out', 'You have been successfully signed out', 'info');

  if (window.location.pathname.includes('app.html') ||
      window.location.pathname.includes('settings.html')) {
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);
  }
}

function setupEnhancedAppFunctions() {
  // Only run if we're on the app page
  if (!document.getElementById('generateBtn')) return;

  const copyBtn = document.getElementById('copyBtn');
  const editBtn = document.getElementById('editBtn');
  const sendBtn = document.getElementById('sendBtn');

  // Copy button
  if (copyBtn) {
    copyBtn.onclick = function() {
      const outputDiv = document.getElementById('output');
      const text = outputDiv.innerText;
      navigator.clipboard.writeText(text)
        .then(() => showNotification('Copied!', 'Email copied to clipboard', 'success'))
        .catch(() => showNotification('Error', 'Failed to copy email', 'error'));
    };
  }

  // Edit button - SIMPLE VERSION
  if (editBtn) {
    editBtn.onclick = function() {
      const outputDiv = document.getElementById('output');

      // Store original content
      const originalContent = outputDiv.innerHTML;

      // Make editable
      outputDiv.contentEditable = true;
      outputDiv.focus();
      outputDiv.style.outline = '2px solid #6366F1';
      outputDiv.style.padding = '8px';

      // Add save/cancel buttons
      const actionButtons = document.getElementById('actionButtons');
      if (actionButtons) {
        // Change Edit to Save
        editBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        editBtn.onclick = function() { saveEmailEdit(outputDiv, originalContent); };

        // Add cancel button if not exists
        if (!document.getElementById('cancelEditBtn')) {
          const cancelBtn = document.createElement('button');
          cancelBtn.id = 'cancelEditBtn';
          cancelBtn.className = 'action-btn';
          cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
          cancelBtn.onclick = function() { cancelEmailEdit(outputDiv, originalContent); };
          actionButtons.prepend(cancelBtn);
        }
      }
    };
  }

  // Save function
  function saveEmailEdit(outputDiv, originalContent) {
    const editedText = outputDiv.innerText;
    outputDiv.contentEditable = false;
    outputDiv.style.outline = 'none';
    outputDiv.style.padding = '0';

    // Remove cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.remove();

    // Reset edit button
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
      editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Email';
      editBtn.onclick = setupEnhancedAppFunctions;
    }

    // Save the edited content
    outputDiv.setAttribute('data-original-email', editedText);
    showNotification('Saved', 'Your changes have been saved', 'success');
  }

  // Cancel function
  function cancelEmailEdit(outputDiv, originalContent) {
    outputDiv.contentEditable = false;
    outputDiv.style.outline = 'none';
    outputDiv.style.padding = '0';
    outputDiv.innerHTML = originalContent;

    // Remove cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.remove();

    // Reset edit button
    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
      editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Email';
      editBtn.onclick = setupEnhancedAppFunctions;
    }
  }

  // Send button
  if (sendBtn) {
    sendBtn.onclick = function() { showSendEmailModal(); };
  }
}

// Updated sendOTP function
async function sendOTP() {
  const email = document.getElementById('signupEmail').value;
  const name = document.getElementById('signupName').value;
  const password = document.getElementById('signupPassword').value;

  if (!name || !email || !password) {
    showNotification('Error', 'Please fill in all fields', 'error');
    return;
  }

  if (password.length < 6) {
    showNotification('Error', 'Password must be at least 6 characters', 'error');
    return;
  }

  const sendOtpBtn = document.querySelector('#signupForm .auth-btn');
  showButtonLoading(sendOtpBtn);

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (response.ok) {
      // Store signup data for next step
      signupData = { name, email, password };

      // Switch to OTP form
      document.getElementById('signupForm').style.display = 'none';
      document.getElementById('otpForm').style.display = 'block';

      showNotification('Success', `Verification code sent to ${email}`, 'success');
      startResendTimer();

    } else {
      throw new Error(data.error || 'Failed to send verification code');
    }

  } catch (error) {
    showNotification('Error', error.message, 'error');
    console.error('OTP Error:', error);
  } finally {
    hideButtonLoading(sendOtpBtn);
  }
}

// Updated OTP verification
async function verifyOTPAndRegister() {
  const otp = document.getElementById('otpCode').value;
  if (!otp || otp.length !== 6) {
    showNotification('Error', 'Please enter a valid 6-digit code', 'error');
    return;
  }

  const verifyBtn = document.querySelector('#otpForm .auth-btn');
  showButtonLoading(verifyBtn);

  try {
    // First verify the OTP
    const verifyResponse = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: signupData.email,
        otp: otp
      })
    });

    const verifyData = await verifyResponse.json();

    if (!verifyResponse.ok) {
      throw new Error(verifyData.error || 'OTP verification failed');
    }

    // Then register the user
    const registerResponse = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...signupData,
        otp: otp
      })
    });

    const registerData = await registerResponse.json();

    if (registerResponse.ok) {
      authToken = registerData.token;
      localStorage.setItem('authToken', authToken);
      currentUser = registerData.user;

      showNotification('Success', 'Account created successfully!', 'success');
      hideAuthModal();
      showUserMenu(currentUser);
      updateEmailTracking();

      // Redirect or show onboarding
      handlePostAuthRedirect();

    } else {
      throw new Error(registerData.error || 'Registration failed');
    }

  } catch (error) {
    showNotification('Error', error.message, 'error');
    console.error('Registration Error:', error);
  } finally {
    hideButtonLoading(verifyBtn);
  }
}

async function verifyOTPAndRegister() {
  const otp = document.getElementById('otpCode').value;
  if (!otp || otp.length !== 6) {
    showNotification('Error', 'Please enter a valid 6-digit code', 'error');
    return;
  }

  const verifyBtn = document.querySelector('#otpForm .auth-btn');
  showButtonLoading(verifyBtn);

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: signupData.name,
        email: signupData.email,
        password: signupData.password,
        otp: otp
      })
    });

    const data = await response.json();

    if (response.ok) {
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      currentUser = data.user;

      showNotification('Success', 'Account created successfully!', 'success');
      hideAuthModal();
      showUserMenu(currentUser);
      updateEmailTracking();

      // Redirect to app
      window.location.href = 'app.html';
    } else {
      throw new Error(data.error || 'Registration failed');
    }
  } catch (error) {
    showNotification('Error', error.message, 'error');
  } finally {
    hideButtonLoading(verifyBtn);
  }
}

function startResendTimer() {
  const resendBtn = document.getElementById('resendOtp');
  if (!resendBtn) return;

  let timeLeft = 60;

  resendBtn.disabled = true;
  resendBtn.textContent = `Resend in ${timeLeft}s`;

  const timer = setInterval(() => {
    timeLeft--;
    resendBtn.textContent = `Resend in ${timeLeft}s`;

    if (timeLeft <= 0) {
      clearInterval(timer);
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend';
    }
  }, 1000);
}

// Email Generation Functions
async function generateEmailWithTone() {
  if (!currentUser || !authToken) {
    showNotification('Authentication Required', 'Please sign in to generate emails', 'error');
    showLoginModal();
    return;
  }

  // Check email limits for free users
  if (currentUser.plan === 'free' && currentUser.emails_used >= 10) {
    showUpgradePrompt();
    return;
  }

  const business = elements.businessDesc?.value;
  const context = elements.context?.value;
  const tone = elements.toneSelect?.value;
  const emailLength = elements.emailLength?.value || 'medium';

  if (!business || !context) {
    showNotification('Error', 'Please fill in all fields', 'error');
    return;
  }

  if (elements.generateBtn && elements.outputDiv) {
    elements.generateBtn.disabled = true;
    elements.generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
    elements.outputDiv.innerHTML = `
      <div class="output-placeholder">
        <div class="placeholder-animation">
          <div class="animation-ring"></div>
          <div class="placeholder-icon">✉️</div>
        </div>
        <p>Generating your personalized email...</p>
        <small>Analyzing your input and writing style</small>
      </div>
    `;

    if (elements.actionButtons) {
      elements.actionButtons.style.display = 'none';
    }
  }

  try {
    const stylePrompt = ToneProfileManager.generateStylePrompt();

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
        emailLength,
        stylePrompt: stylePrompt
      })
    });

    const data = await response.json();

    if (response.ok) {
      if (elements.outputDiv) {
        elements.outputDiv.innerText = data.email;
        elements.outputDiv.setAttribute('data-original-email', data.email);
      }

      if (elements.actionButtons) {
        elements.actionButtons.style.display = 'flex';
      }

      const refs = ToneProfileManager.getReferenceEmails();
      const refCount = refs.all.length;

      showNotification(
        'Success',
        refCount > 0
          ? `Email generated using ${refCount} reference example${refCount !== 1 ? 's' : ''}!`
          : 'Email generated successfully!',
        'success'
      );

      // Update email count
      await checkAuthState();
      loadEmailHistory();
    } else {
      throw new Error(data.error || 'Failed to generate email');
    }
  } catch (error) {
    console.error('Generation error:', error);
    if (elements.outputDiv) {
      elements.outputDiv.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to generate email</p>
          <small>\${error.message}</small>
        </div>
      `;
    }
    showNotification('Error', error.message, 'error');
  } finally {
    if (elements.generateBtn) {
      elements.generateBtn.disabled = false;
      elements.generateBtn.innerHTML = '<span class="btn-icon">✨</span> Generate My Email';
    }
  }
}

// Email Editing Functions - COMPLETELY REWRITTEN
function startEmailEditing() {
  if (!elements.outputDiv) return;

  // Store original content
  originalEmailContent = elements.outputDiv.innerText;
  currentEditMode = 'direct';

  // Make the output directly editable
  elements.outputDiv.contentEditable = true;
  elements.outputDiv.focus();
  elements.outputDiv.style.outline = "2px solid #6366F1";
  elements.outputDiv.style.minHeight = "200px";
  elements.outputDiv.style.padding = "8px";
  elements.outputDiv.style.whiteSpace = "pre-wrap";
  elements.outputDiv.style.wordBreak = "break-word";

  // Add save button
  const saveBtn = document.createElement('button');
  saveBtn.id = 'saveEditBtn';
  saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
  saveBtn.style.position = 'fixed';
  saveBtn.style.bottom = '20px';
  saveBtn.style.right = '20px';
  saveBtn.style.zIndex = '1000';
  saveBtn.style.padding = '10px 20px';
  saveBtn.style.backgroundColor = '#6366F1';
  saveBtn.style.color = 'white';
  saveBtn.style.border = 'none';
  saveBtn.style.borderRadius = '6px';
  saveBtn.style.cursor = 'pointer';
  saveBtn.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)';
  saveBtn.style.transition = 'all 0.2s ease';

  saveBtn.addEventListener('mouseover', () => {
    saveBtn.style.transform = 'translateY(-2px)';
    saveBtn.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.4)';
  });

  saveBtn.addEventListener('mouseout', () => {
    saveBtn.style.transform = 'translateY(0)';
    saveBtn.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)';
  });

  saveBtn.onclick = saveEmailEdits;

  document.body.appendChild(saveBtn);

  // Cancel on Escape key
  document.onkeydown = function(e) {
    if (e.key === 'Escape') {
      cancelEmailEditing();
    }
  };

  // Add visual indicator
  const editIndicator = document.createElement('div');
  editIndicator.id = 'editIndicator';
  editIndicator.innerHTML = `
    <div class="edit-indicator-bar">
      <span>Editing Mode</span>
      <button id="cancelEditBtn" class="cancel-edit-btn">
        <i class="fas fa-times"></i> Cancel
      </button>
    </div>
  `;
  editIndicator.style.position = 'fixed';
  editIndicator.style.top = '0';
  editIndicator.style.left = '0';
  editIndicator.style.right = '0';
  editIndicator.style.zIndex = '999';
  editIndicator.style.backgroundColor = '#6366F1';
  editIndicator.style.color = 'white';
  editIndicator.style.padding = '8px 20px';
  editIndicator.style.display = 'flex';
  editIndicator.style.justifyContent = 'space-between';
  editIndicator.style.alignItems = 'center';

  document.body.appendChild(editIndicator);

  // Cancel button handler
  document.getElementById('cancelEditBtn').onclick = cancelEmailEditing;

  isEditing = true;
}

function saveEmailEdits() {
  if (!elements.outputDiv) return;

  const editedText = elements.outputDiv.innerText.trim();

  if (!editedText) {
    showNotification('Error', 'Email content cannot be empty', 'error');
    return;
  }

  // Save to local storage for tone learning
  ToneProfileManager.saveEditedEmail(originalEmailContent, editedText);

  // Update the displayed email
  elements.outputDiv.contentEditable = false;
  elements.outputDiv.style.outline = "none";
  elements.outputDiv.style.padding = "0";
  elements.outputDiv.setAttribute('data-original-email', editedText);

  // Remove edit UI elements
  const saveBtn = document.getElementById('saveEditBtn');
  const editIndicator = document.getElementById('editIndicator');

  if (saveBtn) document.body.removeChild(saveBtn);
  if (editIndicator) document.body.removeChild(editIndicator);

  // Reset event listeners
  document.onkeydown = null;

  showNotification('Saved', 'Changes saved successfully', 'success');
  isEditing = false;
}

function cancelEmailEditing() {
  if (!elements.outputDiv) return;

  elements.outputDiv.contentEditable = false;
  elements.outputDiv.style.outline = "none";
  elements.outputDiv.style.padding = "0";
  elements.outputDiv.innerText = originalEmailContent;

  // Remove edit UI elements
  const saveBtn = document.getElementById('saveEditBtn');
  const editIndicator = document.getElementById('editIndicator');

  if (saveBtn) document.body.removeChild(saveBtn);
  if (editIndicator) document.body.removeChild(editIndicator);

  // Reset event listeners
  document.onkeydown = null;

  showNotification('Cancelled', 'Edit cancelled - original email restored', 'info');
  isEditing = false;
}

function copyEmailToClipboard() {
  if (!elements.outputDiv) return;

  const text = elements.outputDiv.innerText;

  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied!', 'Email copied to clipboard', 'success');
  }).catch(err => {
    console.error('Copy failed:', err);
    showNotification('Error', 'Failed to copy email', 'error');
  });
}

// Email Sending Functions
function showSendEmailModal() {
  if (!elements.outputDiv) return;

  const emailContent = elements.outputDiv.innerText;
  const subjectMatch = emailContent.match(/Subject:\s*(.*?)(?:\n|$)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : 'Professional Communication';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'sendEmailModal';

  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeSendEmailModal()">
        <i class="fas fa-times"></i>
      </button>
      <h3>Send Email</h3>
      <p class="modal-description">Send your generated email directly from LetiMail.</p>

      <div class="input-group">
        <label for="recipientEmail">Recipient Email</label>
        <input type="email" id="recipientEmail" class="auth-input" placeholder="recipient@example.com" required>
      </div>

      <div class="input-group">
        <label for="businessName">Your Name/Business</label>
        <input type="text" id="businessName" class="auth-input" placeholder="Your Name or Business Name" value="${currentUser?.name || ''}" required>
      </div>

      <div class="input-group">
        <label for="replyToEmail">Reply-To Email</label>
        <input type="email" id="replyToEmail" class="auth-input" placeholder="your-email@example.com" value="${currentUser?.email || ''}" required>
        <span class="input-hint">Replies will be sent directly to this email</span>
      </div>

      <div class="email-preview">
        <h4>Email Preview</h4>
        <div class="preview-content">${emailContent.replace(/\n/g, '<br>')}</div>
      </div>

      <div class="modal-actions">
        <button class="settings-btn secondary" onclick="closeSendEmailModal()">Cancel</button>
        <button class="settings-btn primary" onclick="confirmSendEmail()">
          <i class="fas fa-paper-plane"></i> Send Email
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function closeSendEmailModal() {
  const modal = document.getElementById('sendEmailModal');
  if (modal) {
    document.body.removeChild(modal);
  }
}

async function confirmSendEmail() {
  const to = document.getElementById('recipientEmail').value;
  const businessName = document.getElementById('businessName').value;
  const replyToEmail = document.getElementById('replyToEmail').value;
  const outputDiv = document.getElementById('output');

  if (!outputDiv) return;

  const emailContent = outputDiv.innerText;
  const subjectMatch = emailContent.match(/Subject:\s*(.*?)(?:\n|\$)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : 'Professional Communication';

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+\$/;
  if (!emailRegex.test(to)) {
    showNotification('Error', 'Please enter a valid recipient email', 'error');
    return;
  }

  if (replyToEmail && !emailRegex.test(replyToEmail)) {
    showNotification('Error', 'Please enter a valid reply-to email', 'error');
    return;
  }

  const confirmBtn = document.querySelector('#sendEmailModal .settings-btn.primary');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="btn-spinner"></span> Sending...';
  }

  try {
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
        businessName: businessName || currentUser.name,
        replyToEmail: replyToEmail || currentUser.email
      })
    });

    const data = await response.json();

    if (response.ok) {
      showNotification('Sent!', data.message, 'success');

      // Save to history
      const historyItem = {
        content: emailContent,
        subject: subject,
        sentTo: to,
        sentAt: new Date().toISOString(),
        businessContext: elements.businessDesc.value,
        emailContext: elements.context.value
      };

      emailHistory.unshift(historyItem);
      if (emailHistory.length > 20) {
        emailHistory.pop();
      }
      localStorage.setItem('letimail_email_history', JSON.stringify(emailHistory));

      closeSendEmailModal();

      // Show success message in output
      if (outputDiv) {
        const successMessage = document.createElement('div');
        successMessage.className = 'email-sent-message';
        successMessage.innerHTML = `
          <div class="success-icon">
            <i class="fas fa-paper-plane"></i>
          </div>
          <h4>Email Sent Successfully!</h4>
          <p>Your email has been sent to <strong>\${to}</strong></p>
          <button class="new-email-btn" onclick="generateNewEmail()">Generate Another Email</button>
        `;
        outputDiv.innerHTML = '';
        outputDiv.appendChild(successMessage);
      }
    } else {
      throw new Error(data.error || 'Failed to send email');
    }
  } catch (error) {
    showNotification('Error', error.message, 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Email';
    }
  }
}

function generateNewEmail() {
  if (elements.outputDiv) {
    elements.outputDiv.innerHTML = '';
  }
  if (elements.actionButtons) {
    elements.actionButtons.style.display = 'none';
  }
}

// Email History Functions
async function loadEmailHistory() {
  if (!currentUser || !authToken) return;

  try {
    const response = await fetch(`${BACKEND_URL}/api/email-history?limit=10`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      emailHistory = data.emails;

      // Update UI if on history page
      if (document.getElementById('emailHistoryList')) {
        renderEmailHistory();
      }
    }
  } catch (error) {
    console.error('Failed to load email history:', error);
  }
}

function renderEmailHistory() {
  const historyList = document.getElementById('emailHistoryList');
  if (!historyList) return;

  if (emailHistory.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <h4>No Email History Yet</h4>
        <p>Your generated emails will appear here</p>
      </div>
    `;
    return;
  }

  historyList.innerHTML = '';

  emailHistory.forEach((email, index) => {
    const preview = email.generated_email.replace(/^Subject:.*\n\n/, '').substring(0, 150) + '...';

    const emailCard = document.createElement('div');
    emailCard.className = 'email-history-card';
    emailCard.innerHTML = `
      <div class="email-card-header">
        <div class="email-meta">
          <span class="email-subject">\${email.subject || 'No Subject'}</span>
          <span class="email-date">${new Date(email.created_at).toLocaleString()}</span>
        </div>
        <div class="email-actions">
          <button class="icon-btn" title="View Email" onclick="viewHistoryEmail(${index})">
            <i class="fas fa-eye"></i>
          </button>
          \${email.sent_at ? `
            <button class="icon-btn sent-indicator" title="Sent to \${email.sent_to}">
              <i class="fas fa-paper-plane"></i>
            </button>
          ` : `
            <button class="icon-btn" title="Use as Template" onclick="useAsTemplate(\${index})">
              <i class="fas fa-copy"></i>
            </button>
          `}
        </div>
      </div>
      <div class="email-preview">\${preview}</div>
      <div class="email-context">
        <span class="context-tag">Business:</span> ${email.business_context || 'Not specified'}
        <span class="context-tag">Purpose:</span> ${email.email_context || 'Not specified'}
      </div>
    `;

    historyList.appendChild(emailCard);
  });
}

function viewHistoryEmail(index) {
  const email = emailHistory[index];
  if (!email) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'viewHistoryModal';

  modal.innerHTML = `
    <div class="modal-content history-email-modal">
      <button class="modal-close" onclick="closeModal('viewHistoryModal')">
        <i class="fas fa-times"></i>
      </button>

      <div class="email-header">
        <h3>${email.subject || 'No Subject'}</h3>
        <div class="email-meta">
          <span class="email-date">${new Date(email.created_at).toLocaleString()}</span>
          \${email.sent_at ? `
            <span class="sent-status">
              <i class="fas fa-paper-plane"></i> Sent to \${email.sent_to} on \${new Date(email.sent_at).toLocaleString()}
            </span>
          ` : ''}
        </div>
      </div>

      <div class="email-content">
        <div class="email-section">
          <h4>Business Context</h4>
          <p>\${email.business_context || 'Not specified'}</p>
        </div>

        <div class="email-section">
          <h4>Purpose</h4>
          <p>${email.email_context || 'Not specified'}</p>
        </div>

        <div class="email-section">
          <h4>Email Content</h4>
          <div class="email-body">${email.generated_email.replace(/\n/g, '<br>')}</div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="settings-btn secondary" onclick="closeModal('viewHistoryModal')">Close</button>
        \${!email.sent_at ? `
          <button class="settings-btn primary" onclick="useAsTemplate(\${index}, true)">
            <i class="fas fa-copy"></i> Use as Template
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function useAsTemplate(index, closeModalAfter = false) {
  const email = emailHistory[index];
  if (!email || !elements.businessDesc || !elements.context) return;

  // Fill the form with the template data
  elements.businessDesc.value = email.business_context || '';
  elements.context.value = email.email_context || '';

  // Show success message
  showNotification('Template Loaded', 'Email template loaded successfully', 'success');

  // Generate a new email with the same context
  if (closeModalAfter) {
    closeModal('viewHistoryModal');
    setTimeout(() => {
      if (elements.generateBtn) {
        elements.generateBtn.click();
      }
    }, 500);
  }
}

function generateNewEmail() {
  if (elements.outputDiv) {
    elements.outputDiv.innerHTML = '';
  }
  if (elements.actionButtons) {
    elements.actionButtons.style.display = 'none';
  }
}

// Settings Page Functions
function setupSettingsPage() {
  if (!elements.settingsPanels) return;

  // Initialize the first tab
  switchSettingsTab('profile');

  // Load user preferences
  loadUserPreferences();
  loadToneManagementUI();
}

function switchSettingsTab(tabName) {
  if (!elements.navItems || !elements.settingsPanels) return;

  elements.navItems.forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-tab') === tabName) {
      item.classList.add('active');
    }
  });

  const panels = document.querySelectorAll('.settings-panel');
  panels.forEach(panel => {
    panel.classList.remove('active');
    if (panel.id === `${tabName}-panel`) {
      panel.classList.add('active');
    }
  });

  // Load tone management when switching to tone tab
  if (tabName === 'tone') {
    loadToneManagementUI();
  }
}

async function loadUserPreferences() {
  if (!currentUser || !authToken) return;

  try {
    const response = await fetch(`${BACKEND_URL}/api/preferences`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      userPreferences = data.preferences || {};

      // Populate preferences form
      if (elements.preferencesForm) {
        for (const [key, value] of Object.entries(userPreferences)) {
          const element = elements.preferencesForm.querySelector(`[name="${key}"]`);
          if (element) {
            if (element.type === 'checkbox') {
              element.checked = value;
            } else {
              element.value = value;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to load preferences:', error);
    showNotification('Error', 'Failed to load preferences', 'error');
  }
}

async function handlePreferencesUpdate(e) {
  const button = e.target.querySelector('button[type="submit"]');
  showButtonLoading(button);

  try {
    const formData = new FormData(e.target);
    const preferences = {};

    for (const [key, value] of formData.entries()) {
      // Handle checkboxes
      if (formData.getAll(key).length > 1) {
        preferences[key] = formData.getAll(key);
      }
      // Handle checkbox
      else if (value === 'on') {
        preferences[key] = true;
      }
      // Handle other inputs
      else {
        preferences[key] = value;
      }
    }

    const response = await fetch(`${BACKEND_URL}/api/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ preferences })
    });

    if (response.ok) {
      showNotification('Success', 'Preferences saved successfully', 'success');
      userPreferences = preferences;
    } else {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save preferences');
    }
  } catch (error) {
    showNotification('Error', error.message, 'error');
  } finally {
    hideButtonLoading(button);
  }
}

// Tone Management Functions
function loadToneManagementUI() {
  if (!elements.toneManagement) return;

  const profile = ToneProfileManager.getReferenceEmails();
  const style = profile.all.length > 0 ? ToneProfileManager.analyzeWritingStyle(profile.all) : null;

  // Update style metrics
  document.getElementById('referenceEmailsCount').textContent = profile.all.length;
  document.getElementById('trainingEmailsCount').textContent = profile.training.length;
  document.getElementById('editedEmailsCount').textContent = profile.edited.length;

  if (style) {
    document.getElementById('avgSentenceLength').textContent = `${style.avgSentenceLength} words`;
    document.getElementById('writingStyle').textContent =
      style.usesContractions ? 'Conversational' : 'Formal';
    document.getElementById('formalityLevel').textContent =
      style.formalityScore > 70 ? 'High' :
      style.formalityScore > 40 ? 'Medium' : 'Low';
    document.getElementById('sentimentLevel').textContent =
      style.sentimentScore > 0 ? 'Positive' :
      style.sentimentScore < 0 ? 'Negative' : 'Neutral';

    // Add common phrases
    const commonPhrasesContainer = document.getElementById('commonPhrasesContainer');
    if (commonPhrasesContainer) {
      commonPhrasesContainer.innerHTML = '';
      if (style.commonPhrases.length > 0) {
        style.commonPhrases.forEach(phrase => {
          const phraseTag = document.createElement('span');
          phraseTag.className = 'phrase-tag';
          phraseTag.textContent = `"${phrase}"`;
          commonPhrasesContainer.appendChild(phraseTag);
        });
      } else {
        commonPhrasesContainer.innerHTML = '<span class="no-phrases">No common phrases yet</span>';
      }
    }

    // Add example sentences
    const exampleSentencesContainer = document.getElementById('exampleSentencesContainer');
    if (exampleSentencesContainer) {
      exampleSentencesContainer.innerHTML = '';
      if (style.sentences.length > 0) {
        style.sentences.forEach((sentence, index) => {
          const sentenceEl = document.createElement('div');
          sentenceEl.className = 'example-sentence';
          sentenceEl.innerHTML = `
            <span class="sentence-number">${index + 1}.</span>
            <span class="sentence-text">${sentence}</span>
          `;
          exampleSentencesContainer.appendChild(sentenceEl);
        });
      } else {
        exampleSentencesContainer.innerHTML = '<span class="no-sentences">No example sentences yet</span>';
      }
    }
  }

  // Populate training emails list
  const trainingEmailsList = document.getElementById('trainingEmailsList');
  if (trainingEmailsList) {
    trainingEmailsList.innerHTML = '';

    if (profile.training.length === 0) {
      trainingEmailsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <h4>No Training Emails Yet</h4>
          <p>Add examples of your writing to personalize your tone</p>
          <button class="add-first-email-btn" onclick="showAddToneEmailModal()">
            <i class="fas fa-plus"></i> Add First Email
          </button>
        </div>
      `;
    } else {
      profile.training.forEach(email => {
        const preview = email.content.substring(0, 150) + (email.content.length > 150 ? '...' : '');
        const emailCard = document.createElement('div');
        emailCard.className = 'tone-email-card';
        emailCard.setAttribute('data-id', email.id);
        emailCard.innerHTML = `
          <div class="email-card-header">
            <span class="email-date">${new Date(email.dateAdded).toLocaleDateString()}</span>
            <div class="email-actions">
              <button class="icon-btn edit" onclick="editToneEmail(${email.id})" title="Edit">
                <i class="fas fa-edit"></i>
              </button>
              <button class="icon-btn delete" onclick="deleteToneEmail(${email.id})" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="email-preview">${preview}</div>
          <button class="view-full-btn" onclick="viewFullEmail(\${email.id}, 'training')">
            View Full Email <i class="fas fa-chevron-right"></i>
          </button>
        `;
        trainingEmailsList.appendChild(emailCard);
      });
    }
  }

  // Populate edited emails list
  const editedEmailsList = document.getElementById('editedEmailsList');
  if (editedEmailsList) {
    editedEmailsList.innerHTML = '';

    if (profile.edited.length === 0) {
      editedEmailsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-edit"></i>
          <h4>No Edited Emails Yet</h4>
          <p>As you edit generated emails, they'll appear here</p>
        </div>
      `;
    } else {
      profile.edited.forEach(email => {
        const preview = email.content.substring(0, 150) + (email.content.length > 150 ? '...' : '');
        const editPercentage = Math.round((1 - email.similarity) * 100);

        const emailCard = document.createElement('div');
        emailCard.className = 'tone-email-card edited';
        emailCard.setAttribute('data-id', email.id);
        emailCard.innerHTML = `
          <div class="email-card-header">
            <span class="email-date">\${new Date(email.dateEdited).toLocaleDateString()}</span>
            <div class="email-actions">
              <button class="icon-btn delete" onclick="deleteEditedEmail(${email.id})" title="Remove">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
          <div class="email-preview">${preview}</div>
          <div class="edit-badge">
            <i class="fas fa-pencil-alt"></i> \${editPercentage}% edited
          </div>
        `;
        editedEmailsList.appendChild(emailCard);
      });
    }
  }
}

function showAddToneEmailModal() {
  const profile = ToneProfileManager.getReferenceEmails();

  if (profile.training.length >= 10) {
    showNotification('Limit Reached', 'You can have up to 10 training emails', 'warning');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'addToneModal';

  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal('addToneModal')">
        <i class="fas fa-times"></i>
      </button>
      <h3>Add Training Email</h3>
      <p class="modal-description">
        Paste a complete email you've written before (including subject line).
        The more diverse examples you provide, the better LetiMail can match your style.
      </p>

      <div class="tone-email-help">
        <h4>Tips for Good Examples:</h4>
        <ul>
          <li>Include the full email (subject line and body)</li>
          <li>Use emails that represent your typical writing style</li>
          <li>Provide diverse examples (different tones, lengths, purposes)</li>
          <li>Remove any sensitive or private information</li>
        </ul>
      </div>

      <textarea id="newToneEmail" class="tone-email-textarea" rows="12"
                placeholder="Subject: Example subject line

Hi [Recipient's Name],

This is the body of your email. Include as much as you can to help LetiMail learn your style.

Best regards,
[Your Name]"></textarea>

      <div class="modal-actions">
        <button class="settings-btn secondary" onclick="closeModal('addToneModal')">
          Cancel
        </button>
        <button class="settings-btn primary" onclick="saveToneEmail()">
          <i class="fas fa-check"></i> Add Email
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';

  // Focus the textarea
  setTimeout(() => {
    const textarea = document.getElementById('newToneEmail');
    if (textarea) {
      textarea.focus();
    }
  }, 100);
}

function saveToneEmail() {
  const content = document.getElementById('newToneEmail').value.trim();

  if (!content || content.length < 50) {
    showNotification('Error', 'Please provide a complete email (at least 50 characters)', 'error');
    return;
  }

  // Validate it looks like an email
  if (!content.match(/^Subject:/i)) {
    showNotification('Error', 'Please include a Subject: line at the beginning of your email', 'error');
    return;
  }

  ToneProfileManager.addTrainingEmail(content);
  closeModal('addToneModal');
  loadToneManagementUI();
  showNotification('Success', 'Training email added successfully!', 'success');

  // Show a tip after adding the first email
  const profile = ToneProfileManager.getReferenceEmails();
  if (profile.training.length === 1) {
    setTimeout(() => {
      showNotification(
        'Tip',
        'Add 2-3 more email examples for better personalization!',
        'info',
        8000
      );
    }, 1000);
  }
}

function editToneEmail(id) {
  const data = localStorage.getItem('letimail_tone_training');
  if (!data) return;

  const profile = JSON.parse(data);
  const email = profile.emails.find(e => e.id === id);

  if (!email) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'editToneModal';

  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal('editToneModal')">
        <i class="fas fa-times"></i>
      </button>
      <h3>Edit Training Email</h3>
      <p class="modal-description">
        Edit this email example to refine your tone profile.
      </p>

      <textarea id="editToneEmail" class="tone-email-textarea" rows="12">${email.content}</textarea>

      <div class="modal-actions">
        <button class="settings-btn secondary" onclick="closeModal('editToneModal')">
          Cancel
        </button>
        <button class="settings-btn primary" onclick="updateToneEmail(${id})">
          <i class="fas fa-save"></i> Save Changes
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';

  // Focus the textarea
  setTimeout(() => {
    const textarea = document.getElementById('editToneEmail');
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(0, 0);
    }
  }, 100);
}

function updateToneEmail(id) {
  const content = document.getElementById('editToneEmail').value.trim();

  if (!content) {
    showNotification('Error', 'Email content cannot be empty', 'error');
    return;
  }

  if (!content.match(/^Subject:/i)) {
    showNotification('Error', 'Please include a Subject: line at the beginning', 'error');
    return;
  }

  ToneProfileManager.updateTrainingEmail(id, content);
  closeModal('editToneModal');
  loadToneManagementUI();
  showNotification('Success', 'Training email updated successfully!', 'success');
}

function deleteToneEmail(id) {
  if (confirm('Are you sure you want to delete this training email? This will affect your personalized tone.')) {
    ToneProfileManager.deleteTrainingEmail(id);
    loadToneManagementUI();
    showNotification('Deleted', 'Training email removed from your tone profile', 'info');
  }
}

function deleteEditedEmail(id) {
  if (confirm('Are you sure you want to remove this edited email from your learning profile?')) {
    const data = localStorage.getItem('letimail_edited_emails');
    if (!data) return;

    let emails = JSON.parse(data);
    emails = emails.filter(e => e.id !== id);
    localStorage.setItem('letimail_edited_emails', JSON.stringify(emails));

    loadToneManagementUI();
    showNotification('Removed', 'Edited email removed from learning profile', 'info');
  }
}

function viewFullEmail(id, type) {
  let email;

  if (type === 'training') {
    const data = localStorage.getItem('letimail_tone_training');
    if (!data) return;
    const profile = JSON.parse(data);
    email = profile.emails.find(e => e.id === id);
  }

  if (!email) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'viewEmailModal';

  // Format the email content with proper line breaks
  const formattedContent = email.content
    .replace(/^Subject:.*$/gm, match => `<div class="email-subject">${match}</div>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  modal.innerHTML = `
    <div class="modal-content view-email-modal">
      <button class="modal-close" onclick="closeModal('viewEmailModal')">
        <i class="fas fa-times"></i>
      </button>

      <div class="email-header">
        <h3>Full Email Example</h3>
        <div class="email-meta">
          <span class="email-date">Added: ${new Date(email.dateAdded).toLocaleString()}</span>
        </div>
      </div>

      <div class="full-email-content">
        ${formattedContent}
      </div>

      <div class="modal-actions">
        <button class="settings-btn secondary" onclick="closeModal('viewEmailModal')">
          Close
        </button>
        ${type === 'training' ? `
          <button class="settings-btn primary" onclick="editToneEmail(${email.id}); closeModal('viewEmailModal')">
            <i class="fas fa-edit"></i> Edit This Email
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

// Modal Functions
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    document.body.removeChild(modal);

    // Restore scroll position if needed
    if (modalId === 'viewEmailModal' || modalId === 'editToneModal') {
      window.scrollTo(0, 0);
    }
  }
}

// Upgrade Prompt
function showUpgradePrompt() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'upgradeModal';

  modal.innerHTML = `
    <div class="modal-content upgrade-modal">
      <button class="modal-close" onclick="closeModal('upgradeModal')">
        <i class="fas fa-times"></i>
      </button>

      <div class="upgrade-header">
        <div class="upgrade-icon">🚀</div>
        <h3>Upgrade to Premium</h3>
        <p>You've reached your free email limit. Upgrade to continue using LetiMail!</p>
      </div>

      <div class="upgrade-features">
        <div class="upgrade-feature">
          <div class="feature-icon">✉️</div>
          <div class="feature-details">
            <h4>Unlimited Emails</h4>
            <p>Generate as many emails as you need without restrictions</p>
          </div>
        </div>

        <div class="upgrade-feature">
          <div class="feature-icon">⚡</div>
          <div class="feature-details">
            <h4>Priority Generation</h4>
            <p>Faster email generation with premium priority</p>
          </div>
        </div>

        <div class="upgrade-feature">
          <div class="feature-icon">🎨</div>
          <div class="feature-details">
            <h4>Advanced Tone Matching</h4>
            <p>Enhanced AI that better matches your writing style</p>
          </div>
        </div>

        <div class="upgrade-feature">
          <div class="feature-icon">📊</div>
          <div class="feature-details">
            <h4>Analytics Dashboard</h4>
            <p>Track your email performance and improvements</p>
          </div>
        </div>
      </div>

      <div class="upgrade-actions">
        <button class="upgrade-btn primary" onclick="startPremiumUpgrade()">
          <i class="fas fa-crown"></i>
          Upgrade to Premium - $9.99/month
        </button>
        <button class="upgrade-btn secondary" onclick="closeModal('upgradeModal')">
          Maybe Later
        </button>
      </div>

      <div class="upgrade-guarantee">
        <i class="fas fa-shield-alt"></i>
        <p>30-day money back guarantee</p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function startPremiumUpgrade() {
  showNotification('Coming Soon', 'Premium upgrade functionality will be available soon!', 'info');
  closeModal('upgradeModal');
}

// Delete Account Function
async function handleDeleteAccount() {
  if (!confirm('Are you absolutely sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.')) {
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

      // Redirect to homepage
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 2000);
    } else {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete account');
    }
  } catch (error) {
    showNotification('Error', error.message, 'error');
  }
}

// Coming Soon Functions
function setupComingSoonButtons() {
  const comingSoonSelectors = [
    '#upgradePremiumBtn',
    '.plan-button:not([onclick])',
    '.secondary-cta',
    '.footer a:not([href^="#"])',
    '.social-links a',
    '.feature-coming-soon'
  ];

  comingSoonSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(element => {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        showNotification('Coming Soon', 'This feature is under development and will be available soon!', 'info');
      });
    });
  });
}

// Initialization
function initializeApp() {
  console.log('🔄 Initializing LetiMail application...');

  // Cache DOM elements
  cacheDOMElements();

  // Set up event listeners
  setupEventListeners();

  // Check auth state
  checkAuthState();

  // Initialize page-specific features
  initializePageSpecificFeatures();

  // Set up notifications
  setupNotificationSystem();

  // Set up coming soon buttons
  setupComingSoonButtons();

  // Set up onboarding if needed
  setupOnboarding();

  console.log('✅ LetiMail initialized successfully');
}

function setupNotificationSystem() {
  if (!elements.notification) return;

  // Close button
  const closeBtn = elements.notification.querySelector('.notification-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      elements.notification.classList.remove('show');
    });
  }

  // Auto-hide
  elements.notification.addEventListener('animationend', (e) => {
    if (e.animationName === 'notificationSlideIn' && elements.notification.classList.contains('show')) {
      setTimeout(() => {
        elements.notification.classList.remove('show');
      }, 5000);
    }
  });
}

function setupOnboarding() {
  const onboardingComplete = localStorage.getItem('letimail_onboarding_complete');

  if (!onboardingComplete && currentUser) {
    // Show onboarding after a short delay
    setTimeout(() => {
      if (!document.getElementById('onboardingModal')) {
        createOnboardingModal();
        showOnboardingModal();
      }
    }, 1500);
  }
}

// Onboarding System
function createOnboardingModal() {
  if (document.getElementById('onboardingModal')) return;

  const modal = document.createElement('div');
  modal.id = 'onboardingModal';
  modal.className = 'modal-overlay onboarding-modal';
  modal.style.display = 'none';

  modal.innerHTML = `
    <div class="modal-content onboarding-content">
      <div class="onboarding-progress">
        <div class="progress-bar">
          <div class="progress-fill" id="onboardingProgress"></div>
        </div>
        <span class="progress-text" id="progressText">Step 1 of 4</span>
      </div>

      <!-- Step 1: Welcome -->
      <div class="onboarding-step active" id="step1">
        <div class="onboarding-header">
          <div class="onboarding-icon">👋</div>
          <h2>Welcome to LetiMail!</h2>
          <p class="step-description">Let's get you set up in just a few minutes</p>
        </div>

        <div class="onboarding-body">
          <p>LetiMail helps you write professional emails in seconds using AI that adapts to <strong>your</strong> unique writing style.</p>

          <div class="feature-highlights">
            <div class="feature-highlight">
              <div class="feature-icon">✨</div>
              <h4>AI-Powered</h4>
              <p>Generate high-quality emails instantly</p>
            </div>
            <div class="feature-highlight">
              <div class="feature-icon">🎨</div>
              <h4>Personalized</h4>
              <p>Adapts to your unique writing style</p>
            </div>
            <div class="feature-highlight">
              <div class="feature-icon">🔒</div>
              <h4>Private</h4>
              <p>Your data stays yours - we don't train on it</p>
            </div>
          </div>
        </div>

        <div class="onboarding-actions">
          <button class="onboarding-btn primary" onclick="nextOnboardingStep()">
            Get Started
          </button>
        </div>
      </div>

      <!-- Step 2: Privacy -->
      <div class="onboarding-step" id="step2">
        <div class="onboarding-header">
          <div class="onboarding-icon">🔒</div>
          <h2>Your Privacy Matters</h2>
          <p class="step-description">We take your privacy seriously</p>
        </div>

        <div class="onboarding-body">
          <p>To personalize your experience, LetiMail learns from emails you provide. Here's what you need to know:</p>

          <div class="privacy-points">
            <div class="privacy-point">
              <i class="fas fa-check-circle"></i>
              <div>
                <strong>Your data is private</strong>
                <p>We never share your emails with third parties</p>
              </div>
            </div>
            <div class="privacy-point">
              <i class="fas fa-check-circle"></i>
              <div>
                <strong>You're in control</strong>
                <p>You can view, edit, or delete your data anytime</p>
              </div>
            </div>
            <div class="privacy-point">
              <i class="fas fa-check-circle"></i>
              <div>
                <strong>We don't train on your data</strong>
                <p>Your emails are only used to personalize your experience</p>
              </div>
            </div>
          </div>

          <div class="privacy-assurance">
            <p>By continuing, you agree to our <a href="#" onclick="event.preventDefault(); showNotification('Coming Soon', 'Privacy policy will be available soon', 'info')">Privacy Policy</a> and <a href="#" onclick="event.preventDefault(); showNotification('Coming Soon', 'Terms of service will be available soon', 'info')">Terms of Service</a>.</p>
          </div>
        </div>

        <div class="onboarding-actions">
          <button class="onboarding-btn secondary" onclick="previousOnboardingStep()">
            Back
          </button>
          <button class="onboarding-btn primary" onclick="nextOnboardingStep()">
            I Understand
          </button>
        </div>
      </div>

      <!-- Step 3: How It Works -->
      <div class="onboarding-step" id="step3">
        <div class="onboarding-header">
          <div class="onboarding-icon">⚙️</div>
          <h2>How LetiMail Works</h2>
          <p class="step-description">Simple, powerful email generation</p>
        </div>

        <div class="onboarding-body">
          <div class="how-it-works">
            <div class="work-step">
              <div class="step-number">1</div>
              <div class="step-content">
                <h4>Describe Your Need</h4>
                <p>Tell us about your business and what the email is for</p>
              </div>
            </div>

            <div class="work-step">
              <div class="step-number">2</div>
              <div class="step-content">
                <h4>Select Your Tone</h4>
                <p>Choose from professional tones or let AI match your style</p>
              </div>
            </div>

            <div class="work-step">
              <div class="step-number">3</div>
              <div class="step-content">
                <h4>Generate & Edit</h4>
                <p>Get a draft in seconds, then edit as needed</p>
              </div>
            </div>

            <div class="work-step">
              <div class="step-number">4</div>
              <div class="step-content">
                <h4>Send or Copy</h4>
                <p>Send directly or copy to your email client</p>
              </div>
            </div>
          </div>

          <div class="pro-tip">
            <i class="fas fa-lightbulb"></i>
            <p><strong>Pro Tip:</strong> The more you use LetiMail, the better it gets at matching your personal writing style!</p>
          </div>
        </div>

        <div class="onboarding-actions">
          <button class="onboarding-btn secondary" onclick="previousOnboardingStep()">
            Back
          </button>
          <button class="onboarding-btn primary" onclick="nextOnboardingStep()">
            Got It
          </button>
        </div>
      </div>

      <!-- Step 4: Tone Personalization -->
      <div class="onboarding-step" id="step4">
        <div class="onboarding-header">
          <div class="onboarding-icon">🎨</div>
          <h2>Personalize Your Tone</h2>
          <p class="step-description">Help LetiMail sound like you</p>
        </div>

        <div class="onboarding-body">
          <p>For the best results, provide 2-3 examples of emails you've written before. This helps LetiMail match your unique style.</p>

          <div class="tone-examples">
            <div class="example-card">
              <div class="example-header">
                <i class="fas fa-envelope"></i>
                <h4>Example Email</h4>
              </div>
              <div class="example-content">
                <p>Subject: Following Up on Our Meeting</p>
                <p>Hi [Name],</p>
                <p>I hope you're doing well! I wanted to follow up on our meeting last week about [topic]. As discussed, I'll [action item] by [date].</p>
                <p>Please let me know if you have any questions or need further information.</p>
                <p>Best regards,<br>[Your Name]</p>
              </div>
            </div>
          </div>

          <div class="tone-options">
            <h4>You can:</h4>
            <ul>
              <li>Add examples now (recommended)</li>
              <li>Skip and add them later in Settings</li>
              <li>Let LetiMail use a standard professional tone</li>
            </ul>
          </div>
        </div>

        <div class="onboarding-actions">
          <button class="onboarding-btn secondary" onclick="previousOnboardingStep()">
            Back
          </button>
          <button class="onboarding-btn tertiary" onclick="skipToneSetup()">
            Skip for Now
          </button>
          <button class="onboarding-btn primary" onclick="showAddToneEmailModal(); completeOnboarding()">
            Add Email Examples
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

let onboardingState = {
  currentStep: 0,
  toneEmails: []
};

function showOnboardingModal() {
  const modal = document.getElementById('onboardingModal');
  if (!modal) return;

  onboardingState.currentStep = 0;
  updateOnboardingProgress();
  modal.style.display = 'flex';
}

function updateOnboardingProgress() {
  const progress = ((onboardingState.currentStep + 1) / 4) * 100;
  const progressFill = document.getElementById('onboardingProgress');
  const progressText = document.getElementById('progressText');

  if (progressFill) progressFill.style.width = `${progress}%`;
  if (progressText) progressText.textContent = `Step ${onboardingState.currentStep + 1} of 4`;
}

function nextOnboardingStep() {
  if (onboardingState.currentStep < 3) {
    document.getElementById(`step${onboardingState.currentStep + 1}`).classList.remove('active');
    onboardingState.currentStep++;
    document.getElementById(`step${onboardingState.currentStep + 1}`).classList.add('active');
    updateOnboardingProgress();
  }
}

function previousOnboardingStep() {
  if (onboardingState.currentStep > 0) {
    document.getElementById(`step${onboardingState.currentStep + 1}`).classList.remove('active');
    onboardingState.currentStep--;
    document.getElementById(`step${onboardingState.currentStep + 1}`).classList.add('active');
    updateOnboardingProgress();
  }
}

function skipToneSetup() {
  completeOnboarding(false);
}

function completeOnboarding(withToneData = true) {
  const modal = document.getElementById('onboardingModal');
  if (!modal) return;

  modal.style.display = 'none';
  localStorage.setItem('letimail_onboarding_complete', 'true');

  if (withToneData && onboardingState.toneEmails.length > 0) {
    showNotification(
      'Setup Complete',
      `${onboardingState.toneEmails.length} email example${onboardingState.toneEmails.length !== 1 ? 's' : ''} added to your profile!`,
      'success'
    );
  } else {
    showNotification(
      'Welcome!',
      'Your account is ready. You can add email examples later in Settings to personalize your tone.',
      'success'
    );
  }
}

// Utility Functions
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.style.display = 'none';
  });
}

function fixLoadingIndicator() {
  const outputDiv = document.getElementById('output');
  if (outputDiv) {
    outputDiv.style.minHeight = '400px';
    outputDiv.style.overflow = 'visible';

    if (!outputDiv.querySelector('.output-placeholder')) {
      outputDiv.innerHTML = `
        <div class="output-placeholder">
          <div class="placeholder-animation">
            <div class="animation-ring"></div>
            <div class="placeholder-icon">✉️</div>
          </div>
          <p>Your personalized email will appear here</p>
          <small>Powered by AI that adapts to your writing style</small>
        </div>
      `;
    }
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Create auth modals if they don't exist
  if (!document.getElementById('authModals')) {
    const authModals = document.createElement('div');
    authModals.id = 'authModals';
    document.body.appendChild(authModals);
  }

  // Initialize the app
  initializeApp();

  // Fix loading indicator
  fixLoadingIndicator();
});

// Export functions to window for global access
window.showLoginModal = function() {
  hideAllModals();
  const loginModal = document.getElementById('loginModal');
  if (loginModal) loginModal.style.display = 'flex';
  resetForms();
};

window.showSignupModal = function() {
  hideAllModals();
  const signupModal = document.getElementById('signupModal');
  if (signupModal) signupModal.style.display = 'flex';
  resetForms();
};

window.hideAuthModal = hideAllModals;
window.handleGetStarted = function() {
  if (currentUser) {
    window.location.href = 'app.html';
  } else {
    showSignupModal();
  }
};

window.generateEmailWithTone = generateEmailWithTone;
window.sendOTP = sendOTP;
window.verifyOTPAndRegister = verifyOTPAndRegister;
window.switchSettingsTab = switchSettingsTab;
window.showOnboardingModal = showOnboardingModal;
window.nextOnboardingStep = nextOnboardingStep;
window.previousOnboardingStep = previousOnboardingStep;
window.addToneEmail = function() {
  const textarea = document.getElementById('toneEmailInput');
  const emailContent = textarea.value.trim();

  if (!emailContent) {
    showNotification('Error', 'Please paste an email before adding', 'error');
    return;
  }

  onboardingState.toneEmails.push(emailContent);
  document.getElementById('emailCount').textContent = onboardingState.toneEmails.length;
  document.getElementById('finishBtn').disabled = false;
  textarea.value = '';

  if (onboardingState.toneEmails.length >= 5) {
    document.getElementById('addEmailBtn').disabled = true;
    document.getElementById('toneEmailInput').disabled = true;
  }

  showNotification('Added', `Email ${onboardingState.toneEmails.length} added`, 'success');
};

window.removeToneEmail = function(index) {
  onboardingState.toneEmails.splice(index, 1);
  document.getElementById('emailCount').textContent = onboardingState.toneEmails.length;

  if (onboardingState.toneEmails.length === 0) {
    document.getElementById('finishBtn').disabled = true;
  }
};

window.skipToneSetup = skipToneSetup;
window.finishOnboarding = completeOnboarding;
window.showAddToneEmailModal = showAddToneEmailModal;
window.saveToneEmail = saveToneEmail;
window.editToneEmail = editToneEmail;
window.updateToneEmail = updateToneEmail;
window.deleteToneEmail = deleteToneEmail;
window.deleteEditedEmail = deleteEditedEmail;
window.viewFullEmail = viewFullEmail;
window.closeModal = closeModal;
window.closeSendEmailModal = closeSendEmailModal;
window.confirmSendEmail = confirmSendEmail;
window.handleDeleteAccount = handleDeleteAccount;
window.startPremiumUpgrade = startPremiumUpgrade;
window.loadToneManagementUI = loadToneManagementUI;
window.copyEmailToClipboard = copyEmailToClipboard;
window.startEmailEditing = startEmailEditing;
window.saveEmailEdits = saveEmailEdits;
window.cancelEmailEditing = cancelEmailEditing;

// Final initialization check
console.log('✅ LetiMail script loaded and ready');
