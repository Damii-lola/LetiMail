// Global Auth State
let currentUser = null;
let authToken = null;
let signupData = {}; // Store signup data between OTP steps
const BACKEND_URL = 'https://letimail-production.up.railway.app';

// Onboarding state management
let onboardingState = {
  currentStep: 0,
  toneEmails: []
};

// ========================================
// TONE PROFILE MANAGER
// ========================================
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

  // Calculate text similarity (simple implementation)
  calculateSimilarity: function(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  },

  // Analyze writing style from reference emails
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
    const formalWords = (allText.match(/\b(furthermore|moreover|therefore|consequently|nevertheless)\b/gi) || []).length;

    return {
      avgSentenceLength,
      avgWordLength,
      totalEmails: emails.length,
      commonPhrases,
      usesContractions: contractions > 5,
      formalityScore: formalWords / (words.length / 100), // formal words per 100 words
      sentences: sentences.slice(0, 10) // Sample sentences
    };
  },

  // Extract common phrases (2-3 word combinations)
  extractCommonPhrases: function(text) {
    const words = text.toLowerCase().split(/\s+/);
    const phrases = {};

    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      phrases[phrase] = (phrases[phrase] || 0) + 1;
    }

    return Object.entries(phrases)
      .filter(([_, count]) => count > 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase]) => phrase);
  },

  // Generate style prompt for AI
  generateStylePrompt: function() {
    const refs = this.getReferenceEmails();

    if (refs.all.length === 0) {
      return '';
    }

    const style = this.analyzeWritingStyle(refs.all);

    let prompt = `\n\nIMPORTANT - WRITING STYLE ADAPTATION:
The user has provided ${style.totalEmails} reference emails. Adapt to their unique style:
WRITING CHARACTERISTICS:
- Average sentence length: ${Math.round(style.avgSentenceLength)} words
- ${style.usesContractions ? 'Uses contractions frequently (I\'m, don\'t, can\'t)' : 'Prefers full forms (I am, do not, cannot)'}
- Formality level: ${style.formalityScore > 2 ? 'Formal' : style.formalityScore > 1 ? 'Professional' : 'Casual'}
`;
    if (style.commonPhrases.length > 0) {
      prompt += `- Common phrases to incorporate: "${style.commonPhrases.slice(0, 5).join('", "')}"
`;
    }
    // Add sample sentences
    if (style.sentences.length > 0) {
      prompt += `\nEXAMPLE SENTENCES FROM USER:
`;
      style.sentences.slice(0, 3).forEach((sentence, i) => {
        prompt += `${i + 1}. "${sentence.trim()}"\n`;
      });
    }
    prompt += `\nMATCH THIS STYLE CLOSELY: Use similar sentence structures, vocabulary level, and tone. Make it sound like the user wrote it themselves.`;

    return prompt;
  }
};

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    console.log('🔄 Initializing LetiMail...');

    // Test backend connection first
    const backendConnected = await testBackendConnection();
    if (!backendConnected) {
        showNotification('Warning', 'Backend connection issues detected. Some features may not work.', 'warning');
    }

    await checkAuthState();
    setupEventListeners();
    setupNotification();
    createAuthModals();
    initializePageSpecificFeatures();
    setupComingSoonButtons();
    fixLoadingIndicator();

    updateEmailTracking();
    console.log('✅ LetiMail initialized successfully');
}

// Test backend connection
async function testBackendConnection() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/health`);
        if (response.ok) {
            console.log('✅ Backend connection successful');
            return true;
        } else {
            console.error('❌ Backend connection failed');
            return false;
        }
    } catch (error) {
        console.error('❌ Backend connection error:', error);
        return false;
    }
}

function initializePageSpecificFeatures() {
    const currentPage = window.location.pathname;

    if (currentPage.includes('settings.html')) {
        setupSettingsPage();
        loadToneManagementUI(); // Load tone management immediately
    } else if (currentPage.includes('app.html')) {
        setupEnhancedAppFunctions();
        // Add event listener for generate button
        const generateBtn = document.getElementById('generateBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', generateEmailWithTone);
        }
    }
}

// ========================================
// AUTH STATE MANAGEMENT
// ========================================
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
            showUserMenu(currentUser);

            // Update settings page if we're on settings.html
            if (window.location.pathname.includes('settings.html')) {
                updateSettingsPage();
            }

            updateEmailTracking();

            // Check if user needs upgrade
            if (currentUser.plan === 'free' && currentUser.emails_used >= 5) {
                setTimeout(() => {
                    showUpgradePrompt();
                }, 2000);
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

// ========================================
// UI MANAGEMENT
// ========================================
function showUserMenu(user) {
    const userMenu = document.getElementById('userMenu');
    const authButtons = document.getElementById('authButtons');

    if (userMenu) userMenu.style.display = 'flex';
    if (authButtons) authButtons.style.display = 'none';

    updateUserAvatar(user.name || user.email);
    updateUserInfo(user);
}

function showAuthButtons() {
    const userMenu = document.getElementById('userMenu');
    const authButtons = document.getElementById('authButtons');

    if (userMenu) userMenu.style.display = 'none';
    if (authButtons) authButtons.style.display = 'flex';
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
    const emailCountElement = document.getElementById('emailCount');

    if (planElement) {
        planElement.textContent = user.plan ? `${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Plan` : 'Free Plan';
    }

    updateEmailTracking();
}

// ========================================
// EMAIL TRACKING & UPGRADE SYSTEM
// ========================================
function updateEmailTracking() {
    if (!currentUser) return;
    const emailCountElement = document.getElementById('emailCount');
    const emailsUsedElement = document.getElementById('emailsUsed');

    if (emailCountElement) {
        if (currentUser.plan === 'free') {
            const emailsLeft = Math.max(0, 5 - (currentUser.emails_used || 0));
            emailCountElement.textContent = `${emailsLeft} emails left`;
        } else {
            emailCountElement.textContent = 'Unlimited emails';
        }
    }

    if (emailsUsedElement) {
        emailsUsedElement.textContent = `${currentUser.emails_used || 0}/5`;
    }
}

function showUpgradePrompt() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'upgradeModal';

    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal('upgradeModal')">
                <i class="fas fa-times"></i>
            </button>
            <div class="upgrade-header">
                <div class="upgrade-icon">🚀</div>
                <h3>Upgrade to Premium</h3>
                <p>You've used all your free emails. Upgrade to continue using LetiMail!</p>
            </div>

            <div class="upgrade-features">
                <div class="upgrade-feature">
                    <i class="fas fa-infinity"></i>
                    <div>
                        <strong>Unlimited Email Generation</strong>
                        <span>No more limits on how many emails you can create</span>
                    </div>
                </div>
                <div class="upgrade-feature">
                    <i class="fas fa-bolt"></i>
                    <div>
                        <strong>Priority Generation</strong>
                        <span>Faster email generation with premium priority</span>
                    </div>
                </div>
                <div class="upgrade-feature">
                    <i class="fas fa-star"></i>
                    <div>
                        <strong>Advanced Tone Matching</strong>
                        <span>Enhanced AI that better matches your writing style</span>
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
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function startPremiumUpgrade() {
    showNotification('Coming Soon', 'Premium upgrade functionality will be available soon!', 'info');
    closeModal('upgradeModal');
}

// ========================================
// DELETE ACCOUNT FUNCTIONALITY
// ========================================
async function handleDeleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.')) {
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
        showNotification('Error', error.message, 'error');
    }
}

// ========================================
// COMING SOON BUTTONS
// ========================================
function setupComingSoonButtons() {
    // Add coming soon functionality to all buttons without specific functions
    const comingSoonButtons = [
        '#upgradePremiumBtn',
        '.plan-button:not([onclick])',
        '.secondary-cta',
        '.footer a:not([href^="#"])',
        '.social-links a'
    ];
    comingSoonButtons.forEach(selector => {
        document.querySelectorAll(selector).forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                showNotification('Coming Soon', 'This feature is under development and will be available soon!', 'info');
            });
        });
    });
    // Add delete account button listener
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', handleDeleteAccount);
    }
}

// ========================================
// AUTH MODALS CREATION
// ========================================
function createAuthModals() {
    const authModals = document.getElementById('authModals');
    if (!authModals) return;
    authModals.innerHTML = `
        <!-- Signup Modal -->
        <div id="signupModal" class="modal-overlay" style="display: none;">
            <div class="modal-content auth-modal">
                <button class="modal-close" onclick="hideAuthModal()">
                    <i class="fas fa-times"></i>
                </button>
                <div class="auth-header">
                    <h3>Create Your Account</h3>
                    <p>Join thousands of professionals using LetiMail</p>
                </div>

                <!-- Step 1: Basic Info -->
                <form id="signupForm" class="auth-form" style="display: block;">
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
                    <button type="button" class="auth-btn primary" onclick="sendOTP()">
                        <span class="btn-text">Send Verification Code</span>
                        <div class="btn-spinner"></div>
                    </button>
                </form>
                <!-- Step 2: OTP Verification -->
                <form id="otpForm" class="auth-form" style="display: none;">
                    <div class="input-group">
                        <label for="otpCode">Verification Code</label>
                        <div class="otp-input-container">
                            <input type="text" id="otpCode" required class="auth-input otp-input" placeholder="Enter 6-digit code" maxlength="6" pattern="[0-9]{6}">
                            <button type="button" class="otp-resend" id="resendOtp" onclick="sendOTP()">Resend</button>
                        </div>
                        <span class="otp-hint">Check your email for the verification code</span>
                    </div>
                    <button type="button" class="auth-btn primary" onclick="verifyOTPAndRegister()">
                        <span class="btn-text">Verify & Create Account</span>
                        <div class="btn-spinner"></div>
                    </button>
                </form>
                <div class="auth-footer">
                    <p>Already have an account? <a href="#" id="showLoginFromSignup">Sign in</a></p>
                </div>
            </div>
        </div>
        <!-- Login Modal -->
        <div id="loginModal" class="modal-overlay" style="display: none;">
            <div class="modal-content auth-modal">
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
                    <p>Don't have an account? <a href="#" id="showSignupFromLogin">Sign up</a></p>
                </div>
            </div>
        </div>
    `;
}

// ========================================
// OTP VERIFICATION
// ========================================
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
    signupData = { name, email, password };
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (response.ok) {
            document.getElementById('signupForm').style.display = 'none';
            document.getElementById('otpForm').style.display = 'block';

            showNotification('Success', `Verification code sent to ${email}`, 'success');
            startResendTimer();
        } else {
            throw new Error(data.error || 'Failed to send verification code');
        }
    } catch (error) {
        showNotification('Error', error.message, 'error');
    } finally {
        hideButtonLoading(sendOtpBtn);
    }
}

async function verifyOTPAndRegister() {
    const otp = document.getElementById('otpCode').value;
    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
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
                ...signupData,
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

            signupData = {};

            // Use improved redirect handling
            handlePostAuthRedirect();

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

// ========================================
// IMPROVED ONBOARDING REDIRECT
// ========================================
function handlePostAuthRedirect() {
    const onboardingComplete = localStorage.getItem('letimail_onboarding_complete');

    if (!onboardingComplete) {
        // Show onboarding modal instead of redirecting immediately
        setTimeout(() => {
            showOnboardingModal();
        }, 1000);
    } else {
        // If onboarding is complete, show success and let user choose where to go
        showNotification('Welcome!', 'Successfully signed in. You can start generating emails or manage your settings.', 'success');
    }
}

// ========================================
// ONBOARDING SYSTEM
// ========================================
function createOnboardingModal() {
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
        <span class="progress-text" id="progressText">Step 1 of 3</span>
      </div>

      <!-- Step 1: Data Usage & Privacy -->
      <div class="onboarding-step active" id="step1">
        <div class="onboarding-header">
          <div class="onboarding-icon">🔒</div>
          <h2>Welcome to LetiMail! Let's Get Started.</h2>
          <h3>Your Privacy is Our Priority</h3>
        </div>

        <div class="onboarding-body">
          <p>To help LetiMail generate emails that sound authentically like you, we use the emails you provide to learn your unique writing style, including your tone, phrasing, and formality.</p>

          <div class="info-box">
            <h4>We want to be perfectly clear about how we handle your data:</h4>
            <ul class="info-list">
              <li>
                <span class="check-icon">✓</span>
                <div>
                  <strong>Your emails are secure and private.</strong> They are used solely to create your personal tone profile.
                </div>
              </li>
              <li>
                <span class="check-icon">✓</span>
                <div>
                  <strong>We do not train our general AI models</strong> on your personal data.
                </div>
              </li>
              <li>
                <span class="check-icon">✓</span>
                <div>
                  <strong>You are in control.</strong> You can view, manage, or permanently delete your data at any time in your account settings.
                </div>
              </li>
            </ul>
          </div>

          <p class="agreement-text">By clicking 'I Understand,' you agree to this use of your data to personalize your experience.</p>
        </div>

        <div class="onboarding-actions">
          <button class="onboarding-btn primary" onclick="nextOnboardingStep()">
            I Understand & Next
          </button>
        </div>
      </div>

      <!-- Step 2: AI Generation Disclaimer -->
      <div class="onboarding-step" id="step2">
        <div class="onboarding-header">
          <div class="onboarding-icon">🤖</div>
          <h2>AI as Your Assistant</h2>
        </div>

        <div class="onboarding-body">
          <p>LetiMail is a powerful AI tool, but it's not perfect.</p>

          <div class="warning-box">
            <div class="warning-item">
              <strong>⚠️ Please Review Before Sending:</strong>
              <p>Always proofread and edit generated emails. You are responsible for the final content of all messages you send.</p>
            </div>

            <div class="warning-item">
              <strong>🔍 Check for Accuracy:</strong>
              <p>AI can make mistakes. Ensure all names, dates, facts, and links are correct.</p>
            </div>

            <div class="warning-item">
              <strong>🎯 Use Your Judgment:</strong>
              <p>The AI provides suggestions. It is your responsibility to ensure the content is appropriate, professional, and free of sensitive information.</p>
            </div>
          </div>

          <p class="disclaimer-footer">LetiMail is designed to assist you, not to replace your critical oversight.</p>
        </div>

        <div class="onboarding-actions">
          <button class="onboarding-btn secondary" onclick="previousOnboardingStep()">
            Back
          </button>
          <button class="onboarding-btn primary" onclick="nextOnboardingStep()">
            I Agree & Continue
          </button>
        </div>
      </div>

      <!-- Step 3: Tone System Setup -->
      <div class="onboarding-step" id="step3">
        <div class="onboarding-header">
          <div class="onboarding-icon">✍️</div>
          <h2>Train Your Personal Writing Style</h2>
          <p class="step-description">Help LetiMail learn your unique voice by providing examples of emails you've written before.</p>
        </div>

        <div class="onboarding-body">
          <div class="tone-input-section">
            <label for="toneEmailInput">
              <strong>Paste a previous email you've sent</strong>
              <span class="label-hint">Include the full email content (you can provide up to 5 examples)</span>
            </label>
            <textarea
              id="toneEmailInput"
              class="tone-email-textarea"
              placeholder="Paste your email here... (Include subject line and body)"
              rows="8"
            ></textarea>

            <button class="add-email-btn" onclick="addToneEmail()" id="addEmailBtn">
              <span class="btn-icon">➕</span>
              Add Email (<span id="emailCount">0</span>/5)
            </button>
          </div>

          <div class="added-emails" id="addedEmailsList">
            <!-- Added emails will appear here -->
          </div>

          <div class="info-note">
            <span class="info-icon">💡</span>
            <p><strong>Tip:</strong> The more diverse examples you provide, the better LetiMail can adapt to your style. You can add more examples later in Settings.</p>
          </div>
        </div>

        <div class="onboarding-actions">
          <button class="onboarding-btn secondary" onclick="previousOnboardingStep()">
            Back
          </button>
          <button class="onboarding-btn tertiary" onclick="skipToneSetup()">
            Skip for Now
          </button>
          <button class="onboarding-btn primary" onclick="finishOnboarding()" id="finishBtn" disabled>
            Finish Setup
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function showOnboardingModal() {
  let modal = document.getElementById('onboardingModal');
  if (!modal) {
    createOnboardingModal();
    modal = document.getElementById('onboardingModal');
  }

  onboardingState = {
    currentStep: 0,
    toneEmails: []
  };

  updateOnboardingProgress();
  document.querySelectorAll('.onboarding-step').forEach(step => {
    step.classList.remove('active');
  });
  document.getElementById('step1').classList.add('active');

  modal.style.display = 'flex';
}

function updateOnboardingProgress() {
  const progress = ((onboardingState.currentStep + 1) / 3) * 100;
  const progressFill = document.getElementById('onboardingProgress');
  const progressText = document.getElementById('progressText');

  if (progressFill) progressFill.style.width = `${progress}%`;
  if (progressText) progressText.textContent = `Step ${onboardingState.currentStep + 1} of 3`;
}

function nextOnboardingStep() {
  if (onboardingState.currentStep < 2) {
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

function addToneEmail() {
  const textarea = document.getElementById('toneEmailInput');
  const emailContent = textarea.value.trim();

  if (!emailContent) {
    showNotification('Error', 'Please paste an email before adding', 'error');
    return;
  }

  if (onboardingState.toneEmails.length >= 5) {
    showNotification('Limit Reached', 'You can add up to 5 email examples', 'warning');
    return;
  }

  onboardingState.toneEmails.push(emailContent);
  updateAddedEmailsList();
  textarea.value = '';

  document.getElementById('emailCount').textContent = onboardingState.toneEmails.length;
  document.getElementById('finishBtn').disabled = false;

  if (onboardingState.toneEmails.length >= 5) {
    document.getElementById('addEmailBtn').disabled = true;
    document.getElementById('toneEmailInput').disabled = true;
  }

  showNotification('Added', `Email ${onboardingState.toneEmails.length} added successfully`, 'success');
}

function updateAddedEmailsList() {
  const list = document.getElementById('addedEmailsList');
  if (!list) return;

  if (onboardingState.toneEmails.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = '<h4 class="added-emails-title">Added Emails:</h4>';

  onboardingState.toneEmails.forEach((email, index) => {
    const preview = email.substring(0, 100) + (email.length > 100 ? '...' : '');

    const emailCard = document.createElement('div');
    emailCard.className = 'added-email-card';
    emailCard.innerHTML = `
      <div class="email-card-header">
        <span class="email-number">Email ${index + 1}</span>
        <button class="remove-email-btn" onclick="removeToneEmail(${index})">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="email-preview">${preview}</div>
    `;

    list.appendChild(emailCard);
  });
}

function removeToneEmail(index) {
  onboardingState.toneEmails.splice(index, 1);
  updateAddedEmailsList();

  document.getElementById('emailCount').textContent = onboardingState.toneEmails.length;
  document.getElementById('addEmailBtn').disabled = false;
  document.getElementById('toneEmailInput').disabled = false;

  if (onboardingState.toneEmails.length === 0) {
    document.getElementById('finishBtn').disabled = true;
  }
}

function skipToneSetup() {
  if (confirm('Are you sure you want to skip? You can add email examples later in Settings to improve your personalized tone.')) {
    completeOnboarding(false);
  }
}

async function finishOnboarding() {
  if (onboardingState.toneEmails.length === 0) {
    showNotification('No Emails Added', 'Please add at least one email example or click "Skip for Now"', 'warning');
    return;
  }

  completeOnboarding(true);
}

async function completeOnboarding(withToneData) {
  const finishBtn = document.getElementById('finishBtn');
  if (finishBtn) {
    finishBtn.disabled = true;
    finishBtn.innerHTML = '<span class="btn-spinner"></span> Saving...';
  }

  try {
    if (withToneData && onboardingState.toneEmails.length > 0) {
      // Save to ToneProfileManager
      onboardingState.toneEmails.forEach(email => {
        ToneProfileManager.addTrainingEmail(email);
      });

      showNotification('Success', `${onboardingState.toneEmails.length} email examples saved! Your personalized tone is ready.`, 'success');
    } else {
      showNotification('Setup Complete', 'You can add email examples later in Settings to personalize your tone.', 'info');
    }

    localStorage.setItem('letimail_onboarding_complete', 'true');

    setTimeout(() => {
      const modal = document.getElementById('onboardingModal');
      if (modal) modal.style.display = 'none';

      // Don't force redirect, let user stay where they are
      showNotification('Ready!', 'Your LetiMail account is now fully set up.', 'success');
    }, 1500);

  } catch (error) {
    console.error('Onboarding completion error:', error);
    showNotification('Error', 'Failed to complete setup. Please try again.', 'error');

    if (finishBtn) {
      finishBtn.disabled = false;
      finishBtn.innerHTML = 'Finish Setup';
    }
  }
}

// ========================================
// EVENT LISTENERS SETUP
// ========================================
function setupEventListeners() {
    document.getElementById('loginBtn')?.addEventListener('click', showLoginModal);
    document.getElementById('signupBtn')?.addEventListener('click', showSignupModal);

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
        if (e.target.id === 'passwordForm') {
            e.preventDefault();
            handlePasswordChange(e);
        }
    });
    document.addEventListener('click', function(e) {
        if (e.target.id === 'showLoginFromSignup' || e.target.id === 'showSignupFromLogin') {
            e.preventDefault();
            if (e.target.id === 'showLoginFromSignup') showLoginModal();
            if (e.target.id === 'showSignupFromLogin') showSignupModal();
        }
        if (e.target.classList.contains('modal-overlay')) {
            hideAuthModal();
        }
    });
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
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
}

// ========================================
// MODAL FUNCTIONS
// ========================================
function showSignupModal() {
    hideAllModals();
    const signupModal = document.getElementById('signupModal');
    if (signupModal) {
        signupModal.style.display = 'flex';
    }
    resetForms();
}

function showLoginModal() {
    hideAllModals();
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
    }
    resetForms();
}

function hideAuthModal() {
    hideAllModals();
    resetForms();
}

function hideAllModals() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        if (modal) modal.style.display = 'none';
    });
}

function resetForms() {
    const forms = document.querySelectorAll('.auth-form');
    forms.forEach(form => {
        if (form) {
            form.reset();
            const button = form.querySelector('.auth-btn');
            if (button) {
                hideButtonLoading(button);
            }
        }
    });

    const signupForm = document.getElementById('signupForm');
    const otpForm = document.getElementById('otpForm');
    if (signupForm) signupForm.style.display = 'block';
    if (otpForm) otpForm.style.display = 'none';

    signupData = {};
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

// ========================================
// NOTIFICATION SYSTEM
// ========================================
function setupNotification() {
    const notification = document.getElementById('notification');
    if (!notification) return;

    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideNotification);
    }
    notification.addEventListener('animationend', (e) => {
        if (e.animationName === 'notificationSlideIn' && notification.classList.contains('show')) {
            setTimeout(hideNotification, 5000);
        }
    });
}

function showNotification(title, message, type = 'info') {
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
    notification.className = `notification show ${type}`;

    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    if (iconEl) {
        iconEl.className = `notification-icon ${icons[type] || icons.info}`;
    }

    setTimeout(hideNotification, 5000);
}

function hideNotification() {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.classList.remove('show');
    }
}

// ========================================
// AUTH HANDLERS
// ========================================
async function handleLogin(e) {
    const button = e.target.querySelector('button[type="submit"]');
    showButtonLoading(button);

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            currentUser = data.user;

            showNotification('Welcome Back!', 'Successfully signed in', 'success');
            hideAuthModal();
            showUserMenu(currentUser);
            updateEmailTracking();

            // Use improved redirect handling
            handlePostAuthRedirect();
        } else {
            throw new Error(data.error || 'Login failed');
        }

    } catch (error) {
        showNotification('Login Failed', error.message, 'error');
    } finally {
        hideButtonLoading(button);
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');

    showAuthButtons();
    showNotification('Signed Out', 'You have been successfully signed out', 'info');

    if (window.location.pathname.includes('app.html') || window.location.pathname.includes('settings.html')) {
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }
}

function handleGetStarted() {
    if (currentUser) {
        window.location.href = 'app.html';
    } else {
        showSignupModal();
    }
}

// ========================================
// EMAIL GENERATION WITH TONE MATCHING
// ========================================
async function generateEmailWithTone() {
  if (!currentUser || !authToken) {
    showNotification('Authentication Required', 'Please sign in to generate emails', 'error');
    showLoginModal();
    return;
  }
  // Check email limits for free users
  if (currentUser.plan === 'free' && currentUser.emails_used >= 5) {
    showUpgradePrompt();
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
  const generateBtn = document.getElementById('generateBtn');
  const outputDiv = document.getElementById('output');
  const actionButtons = document.getElementById('actionButtons');
  if (!generateBtn || !outputDiv) return;
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
  outputDiv.innerHTML = '<div class="output-placeholder"><div class="placeholder-animation"><div class="animation-ring"></div><div class="placeholder-icon">✉️</div></div><p>Analyzing your writing style...</p><small>Generating personalized email</small></div>';

  if (actionButtons) actionButtons.style.display = 'none';
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
      outputDiv.innerText = data.email;
      outputDiv.setAttribute('data-original-email', data.email);

      if (actionButtons) actionButtons.style.display = 'flex';

      const refs = ToneProfileManager.getReferenceEmails();
      const refCount = refs.all.length;

      showNotification(
        'Success',
        refCount > 0
          ? `Email generated using ${refCount} reference example${refCount > 1 ? 's' : ''}!`
          : 'Email generated successfully!',
        'success'
      );

      // Update email count
      await checkAuthState();
    } else {
      throw new Error(data.email || 'Failed to generate email');
    }
  } catch (error) {
    console.error('Generation error:', error);
    outputDiv.innerText = '❌ ' + error.message;
    showNotification('Error', error.message, 'error');
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<span class="btn-icon">✨</span> Generate My Email';
  }
}

// ========================================
// APP FUNCTIONS (COPY, EDIT, SEND)
// ========================================
function setupEnhancedAppFunctions() {
  const copyBtn = document.getElementById('copyBtn');
  const editBtn = document.getElementById('editBtn');
  const sendBtn = document.getElementById('sendBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      const outputDiv = document.getElementById('output');
      const text = outputDiv.innerText;

      navigator.clipboard.writeText(text).then(() => {
        showNotification('Copied!', 'Email copied to clipboard', 'success');
      }).catch(err => {
        showNotification('Error', 'Failed to copy email', 'error');
      });
    });
  }
  if (editBtn) {
    editBtn.addEventListener('click', function() {
      const outputDiv = document.getElementById('output');
      const currentText = outputDiv.innerText;
      const originalEmail = outputDiv.getAttribute('data-original-email') || currentText;

      // Clear and set up editing interface
      outputDiv.innerHTML = '';
      outputDiv.classList.add('edit-mode');

      const editContainer = document.createElement('div');
      editContainer.className = 'edit-container';
      editContainer.innerHTML = `
        <div class="edit-mode-header">
          <h4>Edit Your Email</h4>
          <p class="edit-description">Make your changes below. AI will only refine the parts you edit to match the email's formatting.</p>
        </div>
        <textarea class="email-editor" id="emailEditor">${currentText}</textarea>
        <div class="edit-options">
          <label class="checkbox-label">
            <input type="checkbox" id="aiImprovement" checked>
            <span class="checkmark"></span>
            Use AI to refine my edits (only modifies changed parts)
          </label>
        </div>
        <div class="edit-actions">
          <button class="submit-edit-btn" id="submitEdit">
            <i class="fas fa-magic"></i> Save & Refine Edits
          </button>
          <button class="cancel-edit-btn" id="cancelEdit">
            <i class="fas fa-times"></i> Cancel
          </button>
        </div>
        <p class="edit-hint">💡 AI will only modify the specific parts you change to ensure they match the email's formatting and tone.</p>
      `;

      outputDiv.appendChild(editContainer);

      // Focus the textarea
      const editor = document.getElementById('emailEditor');
      editor.focus();

      // Add event listeners
      document.getElementById('submitEdit').addEventListener('click', async function() {
        const submitBtn = this;
        const editedText = editor.value;
        const useAI = document.getElementById('aiImprovement').checked;

        if (!editedText.trim()) {
          showNotification('Error', 'Email content cannot be empty', 'error');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="btn-spinner"></span> Refining edits...';

        let finalText = editedText;

        if (useAI) {
          try {
            finalText = await improveEditedEmail(originalEmail, editedText);
            showNotification('Refined!', 'AI has refined your edits to match the email formatting', 'success');
          } catch (error) {
            console.error('AI refinement failed:', error);
            showNotification('Notice', 'Using your original edits (AI refinement unavailable)', 'info');
          }
        }

        const saved = ToneProfileManager.saveEditedEmail(originalEmail, finalText);

        // Restore normal output display
        outputDiv.classList.remove('edit-mode');
        outputDiv.innerText = finalText;
        outputDiv.setAttribute('data-original-email', finalText);

        if (saved) {
          showNotification(
            'Saved & Learning!',
            'Your edits have been saved to improve future emails',
            'success'
          );
        } else {
          showNotification('Saved', 'Changes saved successfully', 'success');
        }

        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-magic"></i> Save & Refine Edits';
      });

      document.getElementById('cancelEdit').addEventListener('click', function() {
        outputDiv.classList.remove('edit-mode');
        outputDiv.innerText = currentText;
        outputDiv.setAttribute('data-original-email', originalEmail);
      });
    });
  }
  if (sendBtn) {
    sendBtn.addEventListener('click', function() {
      showSendEmailModal();
    });
  }
}

async function improveEditedEmail(originalEmail, editedEmail) {
    if (!currentUser || !authToken) {
        showNotification('Authentication Required', 'Please sign in to improve emails', 'error');
        return editedEmail;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/api/improve-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                originalEmail: originalEmail,
                editedEmail: editedEmail
            })
        });
        if (response.ok) {
            const data = await response.json();
            return data.improvedEmail;
        } else {
            throw new Error('Failed to improve email');
        }
    } catch (error) {
        console.error('Email improvement error:', error);
        // Return the original edited email if improvement fails
        return editedEmail;
    }
}

function showSendEmailModal() {
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
        <button class="settings-btn primary" onclick="confirmSendEmail()">
          <i class="fas fa-paper-plane"></i> Send Email
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function closeSendModal() {
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
  const emailContent = outputDiv.innerText;

  const subjectMatch = emailContent.match(/Subject:\s*(.*?)(?:\n|$)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : 'Email from LetiMail';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    showNotification('Error', 'Please enter a valid recipient email', 'error');
    return;
  }
  if (!emailRegex.test(replyToEmail)) {
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
        businessName,
        replyToEmail
      })
    });
    const data = await response.json();
    if (response.ok) {
      showNotification('Sent!', 'Email sent successfully! Replies will go to: ' + replyToEmail, 'success');
      closeSendModal();
    } else {
      throw new Error(data.error || 'Failed to send email');
    }
  } catch (error) {
    showNotification('Error', error.message, 'error');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Email';
    }
  }
}

// ========================================
// SETTINGS PAGE
// ========================================
function setupSettingsPage() {
    if (!document.getElementById('settings-panels')) return;
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            switchSettingsTab(tab);
        });
    });
    updateSettingsPage();
}

function updateSettingsPage() {
    if (!currentUser || !document.getElementById('settings-panels')) return;
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');

    if (profileName) profileName.value = currentUser.name || '';
    if (profileEmail) profileEmail.value = currentUser.email || '';
    const currentPlanName = document.getElementById('currentPlanName');

    if (currentPlanName) {
        currentPlanName.textContent = currentUser.plan ? `${currentUser.plan.charAt(0).toUpperCase() + currentUser.plan.slice(1)} Plan` : 'Free Plan';
    }

    updateEmailTracking();
}

function switchSettingsTab(tabName) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
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

    // Load tone management immediately when switching to tone tab
    if (tabName === 'tone') {
        console.log('🔄 Switching to tone tab, loading UI...');
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            loadToneManagementUI();
        }, 50);
    }
}

async function handleProfileUpdate(e) {
    const button = e.target.querySelector('button[type="submit"]');
    showButtonLoading(button);

    const name = document.getElementById('profileName').value;

    try {
        if (currentUser) {
            currentUser.name = name;
            showNotification('Success', 'Profile updated successfully', 'success');
            updateUserInfo(currentUser);
            updateSettingsPage();
        }
    } catch (error) {
        showNotification('Error', 'Failed to update profile', 'error');
    } finally {
        hideButtonLoading(button);
    }
}

async function handlePreferencesUpdate(e) {
    const button = e.target.querySelector('button[type="submit"]');
    showButtonLoading(button);

    try {
        const defaultTone = document.getElementById('defaultTone').value;
        const emailLength = document.getElementById('emailLength').value;
        const autoSave = document.getElementById('autoSave').checked;
        const spellCheck = document.getElementById('spellCheck').checked;

        const preferences = {
            defaultTone,
            emailLength,
            autoSave,
            spellCheck
        };

        localStorage.setItem('letimail_preferences', JSON.stringify(preferences));
        showNotification('Success', 'Preferences saved successfully', 'success');
    } catch (error) {
        showNotification('Error', 'Failed to save preferences', 'error');
    } finally {
        hideButtonLoading(button);
    }
}

async function handlePasswordChange(e) {
    const button = e.target.querySelector('button[type="submit"]');
    showButtonLoading(button);

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showNotification('Error', 'New passwords do not match', 'error');
        hideButtonLoading(button);
        return;
    }

    if (newPassword.length < 6) {
        showNotification('Error', 'Password must be at least 6 characters', 'error');
        hideButtonLoading(button);
        return;
    }

    try {
        showNotification('Success', 'Password updated successfully', 'success');
        e.target.reset();
    } catch (error) {
        showNotification('Error', 'Failed to update password', 'error');
    } finally {
        hideButtonLoading(button);
    }
}

// ========================================
// TONE MANAGEMENT IN SETTINGS
// ========================================
function loadToneManagementUI() {
  console.log('🔄 Loading tone management UI data...');

  const profile = ToneProfileManager.getReferenceEmails();
  console.log('📧 Profile data:', profile);

  const style = profile.all.length > 0 ? ToneProfileManager.analyzeWritingStyle(profile.all) : null;
  console.log('🎨 Style analysis:', style);

  // Update style metrics
  document.getElementById('referenceEmailsCount').textContent = profile.all.length;
  document.getElementById('trainingEmailsCount').textContent = profile.training.length;
  document.getElementById('editedEmailsCount').textContent = profile.edited.length;

  if (style) {
    document.getElementById('avgSentenceLength').textContent = `${Math.round(style.avgSentenceLength)} words`;
    document.getElementById('writingStyle').textContent = style.usesContractions ? 'Conversational' : 'Formal';
    document.getElementById('formalityLevel').textContent = style.formalityScore > 2 ? 'High' : style.formalityScore > 1 ? 'Medium' : 'Low';

    // Add common phrases
    const commonPhrasesContainer = document.getElementById('commonPhrasesContainer');
    commonPhrasesContainer.innerHTML = '';

    if (style.commonPhrases && style.commonPhrases.length > 0) {
      style.commonPhrases.slice(0, 5).forEach(phrase => {
        const phraseTag = document.createElement('span');
        phraseTag.className = 'phrase-tag';
        phraseTag.textContent = `"${phrase}"`;
        commonPhrasesContainer.appendChild(phraseTag);
      });
    } else {
      commonPhrasesContainer.innerHTML = '<span style="color: var(--text-muted);">No common phrases yet</span>';
    }
  }

  // Populate training emails
  const trainingEmailsList = document.getElementById('trainingEmailsList');
  trainingEmailsList.innerHTML = '';

  if (profile.training.length === 0) {
    trainingEmailsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>No training emails yet</p>
        <small>Add examples of your writing to personalize your tone</small>
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
        <button class="view-full-btn" onclick="viewFullEmail(${email.id}, 'training')">
          View Full Email <i class="fas fa-chevron-right"></i>
        </button>
      `;
      trainingEmailsList.appendChild(emailCard);
    });
  }

  // Populate edited emails
  const editedEmailsList = document.getElementById('editedEmailsList');
  editedEmailsList.innerHTML = '';

  if (profile.edited.length === 0) {
    editedEmailsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-edit"></i>
        <p>No edited emails yet</p>
        <small>As you edit generated emails, they'll appear here</small>
      </div>
    `;
  } else {
    profile.edited.forEach(email => {
      const preview = email.content.substring(0, 150) + (email.content.length > 150 ? '...' : '');
      const emailCard = document.createElement('div');
      emailCard.className = 'tone-email-card edited';
      emailCard.setAttribute('data-id', email.id);
      emailCard.innerHTML = `
        <div class="email-card-header">
          <span class="email-date">${new Date(email.dateEdited).toLocaleDateString()}</span>
          <div class="email-actions">
            <button class="icon-btn delete" onclick="deleteEditedEmail(${email.id})" title="Remove">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="email-preview">${preview}</div>
        <div class="edit-badge">
          <i class="fas fa-pencil-alt"></i> ${Math.round((1 - email.similarity) * 100)}% edited
        </div>
      `;
      editedEmailsList.appendChild(emailCard);
    });
  }

  // Add event listener for the "Add Email" button
  document.getElementById('addToneEmailBtn').addEventListener('click', showAddToneEmailModal);
}

// Show modal to add a new training email
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
      <p class="modal-description">Paste a complete email you've written before (including subject line).</p>

      <textarea id="newToneEmail" class="tone-email-textarea" rows="12" placeholder="Subject: Example subject
Hi [Name],
Your email content here...
Best regards,
[Your Name]"></textarea>

      <div class="modal-actions">
        <button class="settings-btn secondary" onclick="closeModal('addToneModal')">Cancel</button>
        <button class="settings-btn primary" onclick="saveToneEmail()">
          <i class="fas fa-check"></i> Add Email
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

// Save a new training email
function saveToneEmail() {
  const content = document.getElementById('newToneEmail').value.trim();

  if (!content || content.length < 50) {
    showNotification('Error', 'Please provide a complete email (at least 50 characters)', 'error');
    return;
  }

  ToneProfileManager.addTrainingEmail(content);
  closeModal('addToneModal');
  loadToneManagementUI();
  showNotification('Success', 'Training email added successfully!', 'success');
}

// Edit a training email
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

      <textarea id="editToneEmail" class="tone-email-textarea" rows="12">${email.content}</textarea>

      <div class="modal-actions">
        <button class="settings-btn secondary" onclick="closeModal('editToneModal')">Cancel</button>
        <button class="settings-btn primary" onclick="updateToneEmail(${id})">
          <i class="fas fa-save"></i> Save Changes
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

// Update a training email
function updateToneEmail(id) {
  const content = document.getElementById('editToneEmail').value.trim();

  if (!content) {
    showNotification('Error', 'Email content cannot be empty', 'error');
    return;
  }

  ToneProfileManager.updateTrainingEmail(id, content);
  closeModal('editToneModal');
  loadToneManagementUI();
  showNotification('Success', 'Training email updated!', 'success');
}

// Delete a training email
function deleteToneEmail(id) {
  if (confirm('Are you sure you want to delete this training email?')) {
    ToneProfileManager.deleteTrainingEmail(id);
    loadToneManagementUI();
    showNotification('Deleted', 'Training email removed', 'info');
  }
}

// Delete an edited email
function deleteEditedEmail(id) {
  const data = localStorage.getItem('letimail_edited_emails');
  if (!data) return;

  let emails = JSON.parse(data);
  emails = emails.filter(e => e.id !== id);
  localStorage.setItem('letimail_edited_emails', JSON.stringify(emails));

  loadToneManagementUI();
  showNotification('Removed', 'Edited email removed from learning', 'info');
}

// View full email
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

  modal.innerHTML = `
    <div class="modal-content view-email-modal">
      <button class="modal-close" onclick="closeModal('viewEmailModal')">
        <i class="fas fa-times"></i>
      </button>
      <h3>Full Email</h3>
      <div class="full-email-content">${email.content.replace(/\n/g, '<br>')}</div>
      <div class="modal-actions">
        <button class="settings-btn primary" onclick="closeModal('viewEmailModal')">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

// Close modal
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    document.body.removeChild(modal);
  }
}

// ========================================
// FIX LOADING INDICATOR IN APP.HTML
// ========================================
function fixLoadingIndicator() {
  const outputDiv = document.getElementById('output');
  if (outputDiv) {
    // Remove any existing problematic styles
    outputDiv.style.overflow = 'visible';
    outputDiv.style.minHeight = '400px';

    // Ensure proper placeholder display
    if (!outputDiv.querySelector('.output-placeholder')) {
      outputDiv.innerHTML = `
        <div class="output-placeholder">
          <div class="placeholder-animation">
            <div class="animation-ring"></div>
            <div class="placeholder-icon">✉️</div>
          </div>
          <p>Your personalized email will appear here</p>
          <small>Powered by adaptable AI that learns your unique style</small>
        </div>
      `;
    }
  }
}

// ========================================
// GLOBAL FUNCTION EXPORTS
// ========================================
window.showLoginModal = showLoginModal;
window.showSignupModal = showSignupModal;
window.hideAuthModal = hideAuthModal;
window.handleGetStarted = handleGetStarted;
window.generateEmailWithTone = generateEmailWithTone;
window.sendOTP = sendOTP;
window.verifyOTPAndRegister = verifyOTPAndRegister;
window.switchSettingsTab = switchSettingsTab;
window.showOnboardingModal = showOnboardingModal;
window.nextOnboardingStep = nextOnboardingStep;
window.previousOnboardingStep = previousOnboardingStep;
window.addToneEmail = addToneEmail;
window.removeToneEmail = removeToneEmail;
window.skipToneSetup = skipToneSetup;
window.finishOnboarding = finishOnboarding;
window.showAddToneEmailModal = showAddToneEmailModal;
window.saveToneEmail = saveToneEmail;
window.editToneEmail = editToneEmail;
window.updateToneEmail = updateToneEmail;
window.deleteToneEmail = deleteToneEmail;
window.deleteEditedEmail = deleteEditedEmail;
window.viewFullEmail = viewFullEmail;
window.closeModal = closeModal;
window.closeSendModal = closeSendModal;
window.confirmSendEmail = confirmSendEmail;
window.handleDeleteAccount = handleDeleteAccount;
window.startPremiumUpgrade = startPremiumUpgrade;
window.loadToneManagementUI = loadToneManagementUI;

// ========================================
// AUTO-INITIALIZATION
// ========================================
// Auto-initialize for app.html
if (document.getElementById('generateBtn')) {
    document.getElementById('generateBtn').addEventListener('click', generateEmailWithTone);
    setupEnhancedAppFunctions();
}
// Auto-initialize for settings.html
if (document.getElementById('settings-panels')) {
    setupSettingsPage();
}

console.log('✅ LetiMail Enhanced System Loaded Successfully!');
