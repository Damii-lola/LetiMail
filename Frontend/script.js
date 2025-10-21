// Global Auth State
let currentUser = null;
let authToken = null;
let signupData = {}; // Store signup data between OTP steps

const BACKEND_URL = 'https://letimail-production.up.railway.app';

// Quick check to remind you to update the URL
if (BACKEND_URL.includes('your-railway-app')) {
  console.error('⚠️⚠️⚠️ STOP! You need to update BACKEND_URL in script.js with your actual Railway URL! ⚠️⚠️⚠️');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    await checkAuthState();
    setupEventListeners();
    setupNotification();
    createAuthModals();
    setupSettingsPage(); // Initialize settings page if we're on it
}

// Auth State Management
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
            updateSettingsPage(); // Update settings page with user data
        } else {
            localStorage.removeItem('authToken');
            authToken = null;
            showAuthButtons();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('authToken');
        authToken = null;
        showAuthButtons();
    }
}

// UI Management
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
    
    if (emailCountElement) {
        emailCountElement.textContent = `${user.emails_left || 25} emails left`;
    }
}

// Auth Modals Creation
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

// OTP Verification Functions
async function sendOTP() {
    const email = document.getElementById('signupEmail').value;
    const name = document.getElementById('signupName').value;
    const password = document.getElementById('signupPassword').value;

    // Basic validation
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

    // Store signup data for later use
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
            // Switch to OTP verification form
            document.getElementById('signupForm').style.display = 'none';
            document.getElementById('otpForm').style.display = 'block';
            
            showNotification('Success', `Verification code sent to ${email}`, 'success');
            
            // Start resend timer
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

// Add this to your script.js file

// Onboarding state management
let onboardingState = {
  currentStep: 0,
  toneEmails: []
};

// Create onboarding modal HTML
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

// Show onboarding modal
function showOnboardingModal() {
  let modal = document.getElementById('onboardingModal');
  if (!modal) {
    createOnboardingModal();
    modal = document.getElementById('onboardingModal');
  }
  
  // Reset state
  onboardingState = {
    currentStep: 0,
    toneEmails: []
  };
  
  // Reset UI
  updateOnboardingProgress();
  document.querySelectorAll('.onboarding-step').forEach(step => {
    step.classList.remove('active');
  });
  document.getElementById('step1').classList.add('active');
  
  modal.style.display = 'flex';
}

// Update progress bar
function updateOnboardingProgress() {
  const progress = ((onboardingState.currentStep + 1) / 3) * 100;
  const progressFill = document.getElementById('onboardingProgress');
  const progressText = document.getElementById('progressText');
  
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (progressText) progressText.textContent = `Step ${onboardingState.currentStep + 1} of 3`;
}

// Navigate to next step
function nextOnboardingStep() {
  if (onboardingState.currentStep < 2) {
    // Hide current step
    document.getElementById(`step${onboardingState.currentStep + 1}`).classList.remove('active');
    
    // Move to next step
    onboardingState.currentStep++;
    
    // Show next step
    document.getElementById(`step${onboardingState.currentStep + 1}`).classList.add('active');
    
    // Update progress
    updateOnboardingProgress();
  }
}

// Navigate to previous step
function previousOnboardingStep() {
  if (onboardingState.currentStep > 0) {
    // Hide current step
    document.getElementById(`step${onboardingState.currentStep + 1}`).classList.remove('active');
    
    // Move to previous step
    onboardingState.currentStep--;
    
    // Show previous step
    document.getElementById(`step${onboardingState.currentStep + 1}`).classList.add('active');
    
    // Update progress
    updateOnboardingProgress();
  }
}

// Add tone email
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
  
  // Add email to array
  onboardingState.toneEmails.push(emailContent);
  
  // Update UI
  updateAddedEmailsList();
  
  // Clear textarea
  textarea.value = '';
  
  // Update counter and button state
  document.getElementById('emailCount').textContent = onboardingState.toneEmails.length;
  document.getElementById('finishBtn').disabled = false;
  
  if (onboardingState.toneEmails.length >= 5) {
    document.getElementById('addEmailBtn').disabled = true;
    document.getElementById('toneEmailInput').disabled = true;
  }
  
  showNotification('Added', `Email ${onboardingState.toneEmails.length} added successfully`, 'success');
}

// Update the list of added emails
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

// Remove tone email
function removeToneEmail(index) {
  onboardingState.toneEmails.splice(index, 1);
  updateAddedEmailsList();
  
  // Update counter and button states
  document.getElementById('emailCount').textContent = onboardingState.toneEmails.length;
  document.getElementById('addEmailBtn').disabled = false;
  document.getElementById('toneEmailInput').disabled = false;
  
  if (onboardingState.toneEmails.length === 0) {
    document.getElementById('finishBtn').disabled = true;
  }
}

// Skip tone setup
function skipToneSetup() {
  if (confirm('Are you sure you want to skip? You can add email examples later in Settings to improve your personalized tone.')) {
    completeOnboarding(false);
  }
}

// Finish onboarding
async function finishOnboarding() {
  if (onboardingState.toneEmails.length === 0) {
    showNotification('No Emails Added', 'Please add at least one email example or click "Skip for Now"', 'warning');
    return;
  }
  
  completeOnboarding(true);
}

// Complete onboarding process
async function completeOnboarding(withToneData) {
  const finishBtn = document.getElementById('finishBtn');
  if (finishBtn) {
    finishBtn.disabled = true;
    finishBtn.innerHTML = '<span class="btn-spinner"></span> Saving...';
  }
  
  try {
    if (withToneData && onboardingState.toneEmails.length > 0) {
      // In a real implementation, send tone emails to backend
      // await saveToneProfile(onboardingState.toneEmails);
      
      // For now, save to localStorage
      localStorage.setItem('letimail_tone_training', JSON.stringify({
        emails: onboardingState.toneEmails,
        trained: true,
        date: new Date().toISOString()
      }));
      
      showNotification('Success', `${onboardingState.toneEmails.length} email examples saved! Your personalized tone is ready.`, 'success');
    } else {
      showNotification('Setup Complete', 'You can add email examples later in Settings to personalize your tone.', 'info');
    }
    
    // Mark onboarding as complete
    localStorage.setItem('letimail_onboarding_complete', 'true');
    
    // Close modal
    setTimeout(() => {
      const modal = document.getElementById('onboardingModal');
      if (modal) modal.style.display = 'none';
      
      // Redirect to app
      window.location.href = 'app.html';
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

// Modify the verifyOTPAndRegister function to show onboarding after successful registration
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
      
      // Clear signup data
      signupData = {};
      
      // SHOW ONBOARDING MODAL
      setTimeout(() => {
        showOnboardingModal();
      }, 500);
      
    } else {
      throw new Error(data.error || 'Registration failed');
    }
  } catch (error) {
    showNotification('Error', error.message, 'error');
  } finally {
    hideButtonLoading(verifyBtn);
  }
}

// Add global functions
window.showOnboardingModal = showOnboardingModal;
window.nextOnboardingStep = nextOnboardingStep;
window.previousOnboardingStep = previousOnboardingStep;
window.addToneEmail = addToneEmail;
window.removeToneEmail = removeToneEmail;
window.skipToneSetup = skipToneSetup;
window.finishOnboarding = finishOnboarding;

// Resend OTP timer
function startResendTimer() {
    const resendBtn = document.getElementById('resendOtp');
    if (!resendBtn) return;
    
    let timeLeft = 60; // 60 seconds
    
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

// Event Listeners Setup
function setupEventListeners() {
    // Auth modal triggers
    document.getElementById('loginBtn')?.addEventListener('click', showLoginModal);
    document.getElementById('signupBtn')?.addEventListener('click', showSignupModal);
    
    // Form submissions (delegated)
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

    // Modal navigation (delegated)
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

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    // User avatar dropdown
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

// Modal Functions
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
    
    // Reset to first step
    const signupForm = document.getElementById('signupForm');
    const otpForm = document.getElementById('otpForm');
    if (signupForm) signupForm.style.display = 'block';
    if (otpForm) otpForm.style.display = 'none';
    
    // Clear signup data
    signupData = {};
}

// Button Loading States
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

// Notification System
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

// Auth Handlers
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

// Handle "Start Writing" button
function handleGetStarted() {
    if (currentUser) {
        window.location.href = 'app.html';
    } else {
        showSignupModal();
    }
}

// Email Generation Functions (for app.html)
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

    const generateBtn = document.getElementById('generateBtn');
    const outputDiv = document.getElementById('output');
    const actionButtons = document.getElementById('actionButtons');

    if (!generateBtn || !outputDiv) return;

    // Show loading state
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
    outputDiv.innerHTML = '<div class="output-placeholder"><div class="placeholder-icon">⏳</div><p>Generating your email...</p><small>Powered by adaptive AI that learns your style</small></div>';
    
    if (actionButtons) actionButtons.style.display = 'none';

    try {
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
        
        if (response.ok) {
            outputDiv.innerText = data.email;
            if (actionButtons) actionButtons.style.display = 'flex';
            showNotification('Success', 'Email generated successfully!', 'success');
            
            // Refresh user data to update email count
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

// Copy, Edit, Send functions for app.html
function setupAppFunctions() {
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
            
            outputDiv.innerHTML = `
                <textarea class="email-editor" id="emailEditor">${currentText}</textarea>
                <div class="edit-actions">
                    <button class="submit-edit-btn" id="submitEdit">Save Changes</button>
                    <button class="cancel-edit-btn" id="cancelEdit">Cancel</button>
                </div>
            `;

            document.getElementById('submitEdit').addEventListener('click', async function() {
                const editedText = document.getElementById('emailEditor').value;
                outputDiv.innerText = editedText;
                showNotification('Saved', 'Changes saved successfully', 'success');
            });

            document.getElementById('cancelEdit').addEventListener('click', function() {
                outputDiv.innerText = currentText;
            });
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', function() {
            showSendEmailModal();
        });
    }
}

function showSendEmailModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Send Email</h3>
            <div class="input-group">
                <label for="recipientEmail">Recipient Email</label>
                <input type="email" id="recipientEmail" class="email-input" placeholder="recipient@example.com" required>
            </div>
            <div class="input-group">
                <label for="businessName">Business Name</label>
                <input type="text" id="businessName" class="name-input" placeholder="Your Business Name" value="${currentUser?.name || ''}" required>
            </div>
            <div class="input-group">
                <label for="replyToEmail">Reply-To Email</label>
                <input type="email" id="replyToEmail" class="email-input" placeholder="your-email@example.com" required>
                <span class="input-hint">Replies will be sent directly to this email</span>
            </div>
            <div class="modal-actions">
                <button class="confirm-send-btn" id="confirmSend">Send Email</button>
                <button class="cancel-send-btn" id="cancelSend">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // Pre-fill the reply-to email with user's email if available
    if (currentUser?.email) {
        document.getElementById('replyToEmail').value = currentUser.email;
    }

    document.getElementById('confirmSend').addEventListener('click', async function() {
        const to = document.getElementById('recipientEmail').value;
        const businessName = document.getElementById('businessName').value;
        const replyToEmail = document.getElementById('replyToEmail').value;
        const outputDiv = document.getElementById('output');
        const emailContent = outputDiv.innerText;
        
        // Extract subject
        const subjectMatch = emailContent.match(/Subject:\s*(.*?)(?:\n|$)/i);
        const subject = subjectMatch ? subjectMatch[1].trim() : 'Email from LetiMail';

        // Validate emails
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            showNotification('Error', 'Please enter a valid recipient email', 'error');
            return;
        }
        if (!emailRegex.test(replyToEmail)) {
            showNotification('Error', 'Please enter a valid reply-to email', 'error');
            return;
        }

        const confirmBtn = document.getElementById('confirmSend');
        showButtonLoading(confirmBtn);

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
                document.body.removeChild(modal);
            } else {
                throw new Error(data.error || 'Failed to send email');
            }
        } catch (error) {
            showNotification('Error', error.message, 'error');
        } finally {
            hideButtonLoading(confirmBtn);
        }
    });

    document.getElementById('cancelSend').addEventListener('click', function() {
        document.body.removeChild(modal);
    });

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Settings Page Functions
function setupSettingsPage() {
    // Only run if we're on the settings page
    if (!document.getElementById('settings-panels')) return;

    // Setup navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            switchSettingsTab(tab);
        });
    });

    // Load user data into settings
    updateSettingsPage();
}

function updateSettingsPage() {
    if (!currentUser || !document.getElementById('settings-panels')) return;

    // Update profile form
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    
    if (profileName) profileName.value = currentUser.name || '';
    if (profileEmail) profileEmail.value = currentUser.email || '';

    // Update subscription info
    const currentPlanName = document.getElementById('currentPlanName');
    const emailsUsed = document.getElementById('emailsUsed');
    
    if (currentPlanName) {
        currentPlanName.textContent = currentUser.plan ? `${currentUser.plan.charAt(0).toUpperCase() + currentUser.plan.slice(1)} Plan` : 'Free Plan';
    }
    if (emailsUsed) {
        emailsUsed.textContent = `${currentUser.emails_used || 0}/${currentUser.emails_left + (currentUser.emails_used || 0) || 25}`;
    }
}

function switchSettingsTab(tabName) {
    // Update active nav item
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tabName) {
            item.classList.add('active');
        }
    });

    // Show corresponding panel
    const panels = document.querySelectorAll('.settings-panel');
    panels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `${tabName}-panel`) {
            panel.classList.add('active');
        }
    });
}

async function handleProfileUpdate(e) {
    const button = e.target.querySelector('button[type="submit"]');
    showButtonLoading(button);
    
    const name = document.getElementById('profileName').value;
    
    try {
        // In a real app, you'd make an API call to update the profile
        // For now, we'll just update the local state
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
        // Save preferences to localStorage
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
        // In a real app, you'd make an API call to change the password
        showNotification('Success', 'Password updated successfully', 'success');
        e.target.reset();
    } catch (error) {
        showNotification('Error', 'Failed to update password', 'error');
    } finally {
        hideButtonLoading(button);
    }
}

// Global functions for modal access
window.showLoginModal = showLoginModal;
window.showSignupModal = showSignupModal;
window.hideAuthModal = hideAuthModal;
window.handleGetStarted = handleGetStarted;
window.generateEmail = generateEmail;
window.sendOTP = sendOTP;
window.verifyOTPAndRegister = verifyOTPAndRegister;
window.switchSettingsTab = switchSettingsTab;

// ENHANCED TONE SYSTEM WITH AI LEARNING
// Add this to your script.js file

// Enhanced onboarding state management
let onboardingState = {
  currentStep: 0,
  toneEmails: []
};

// Tone profile management
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

// ENHANCED EMAIL GENERATION WITH TONE MATCHING
async function generateEmailWithTone() {
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

  const generateBtn = document.getElementById('generateBtn');
  const outputDiv = document.getElementById('output');
  const actionButtons = document.getElementById('actionButtons');

  if (!generateBtn || !outputDiv) return;

  // Show loading state
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
  outputDiv.innerHTML = '<div class="output-placeholder"><div class="placeholder-animation"><div class="animation-ring"></div><div class="placeholder-icon">✉️</div></div><p>Analyzing your writing style...</p><small>Generating personalized email</small></div>';
  
  if (actionButtons) actionButtons.style.display = 'none';

  try {
    // Get style prompt
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
        stylePrompt: stylePrompt // Send style analysis to backend
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      outputDiv.innerText = data.email;
      outputDiv.setAttribute('data-original-email', data.email); // Store original for edit tracking
      
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

// ENHANCED EDIT FUNCTION WITH LEARNING
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
      
      outputDiv.innerHTML = `
        <textarea class="email-editor" id="emailEditor">${currentText}</textarea>
        <div class="edit-actions">
          <button class="submit-edit-btn" id="submitEdit">
            <i class="fas fa-check"></i> Save & Learn from Edits
          </button>
          <button class="cancel-edit-btn" id="cancelEdit">
            <i class="fas fa-times"></i> Cancel
          </button>
        </div>
        <p class="edit-hint">💡 Your edits help LetiMail learn your writing style</p>
      `;

      document.getElementById('submitEdit').addEventListener('click', async function() {
        const editedText = document.getElementById('emailEditor').value;
        
        // Save edited email for learning
        const saved = ToneProfileManager.saveEditedEmail(originalEmail, editedText);
        
        outputDiv.innerText = editedText;
        outputDiv.setAttribute('data-original-email', editedText);
        
        if (saved) {
          showNotification(
            'Saved & Learning!', 
            'Your edits have been saved to improve future emails', 
            'success'
          );
        } else {
          showNotification('Saved', 'Changes saved successfully', 'success');
        }
      });

      document.getElementById('cancelEdit').addEventListener('click', function() {
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

// SETTINGS PAGE - TONE MANAGEMENT
function setupToneManagement() {
  // Only run if we're on the settings page
  if (!document.getElementById('tone-panel')) return;

  loadToneManagementUI();
}

function loadToneManagementUI() {
  const tonePanel = document.getElementById('tone-panel');
  if (!tonePanel) return;

  const profile = ToneProfileManager.getReferenceEmails();
  const style = profile.all.length > 0 ? ToneProfileManager.analyzeWritingStyle(profile.all) : null;

  tonePanel.innerHTML = `
    <h2>Writing Style & Tone Profile</h2>
    <p class="panel-description">Manage your reference emails to help LetiMail match your unique writing style.</p>

    ${style ? `
      <div class="style-analysis-card">
        <h4><i class="fas fa-chart-line"></i> Your Writing Style Analysis</h4>
        <div class="style-metrics">
          <div class="metric">
            <span class="metric-label">Reference Emails</span>
            <span class="metric-value">${style.totalEmails}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Avg. Sentence Length</span>
            <span class="metric-value">${Math.round(style.avgSentenceLength)} words</span>
          </div>
          <div class="metric">
            <span class="metric-label">Writing Style</span>
            <span class="metric-value">${style.usesContractions ? 'Conversational' : 'Formal'}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Formality</span>
            <span class="metric-value">${style.formalityScore > 2 ? 'High' : style.formalityScore > 1 ? 'Medium' : 'Low'}</span>
          </div>
        </div>
        ${style.commonPhrases.length > 0 ? `
          <div class="common-phrases">
            <strong>Your signature phrases:</strong>
            <div class="phrase-tags">
              ${style.commonPhrases.slice(0, 5).map(phrase => `<span class="phrase-tag">${phrase}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div class="tone-section">
      <div class="section-header-inline">
        <h3>Training Emails (${profile.training.length}/10)</h3>
        <button class="add-tone-email-btn" onclick="showAddToneEmailModal()">
          <i class="fas fa-plus"></i> Add Email
        </button>
      </div>
      <p class="section-description">These emails are used to train the AI on your writing style.</p>
      
      <div class="tone-emails-list" id="trainingEmailsList">
        ${profile.training.length === 0 ? `
          <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>No training emails yet</p>
            <small>Add examples of your writing to personalize your tone</small>
          </div>
        ` : profile.training.map(email => `
          <div class="tone-email-card" data-id="${email.id}">
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
            <div class="email-preview">${email.content.substring(0, 150)}...</div>
            <button class="view-full-btn" onclick="viewFullEmail(${email.id}, 'training')">
              View Full Email <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="tone-section">
      <div class="section-header-inline">
        <h3>Learned from Edits (${profile.edited.length}/20)</h3>
        <span class="info-badge" title="These are emails you edited significantly">
          <i class="fas fa-info-circle"></i>
        </span>
      </div>
      <p class="section-description">AI learns from your edits to better match your style.</p>
      
      <div class="tone-emails-list" id="editedEmailsList">
        ${profile.edited.length === 0 ? `
          <div class="empty-state">
            <i class="fas fa-edit"></i>
            <p>No edited emails yet</p>
            <small>As you edit generated emails, they'll appear here</small>
          </div>
        ` : profile.edited.map(email => `
          <div class="tone-email-card edited">
            <div class="email-card-header">
              <span class="email-date">${new Date(email.dateEdited).toLocaleDateString()}</span>
              <div class="email-actions">
                <button class="icon-btn delete" onclick="deleteEditedEmail(${email.id})" title="Remove">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
            <div class="email-preview">${email.content.substring(0, 150)}...</div>
            <div class="edit-badge">
              <i class="fas fa-pencil-alt"></i> ${Math.round((1 - email.similarity) * 100)}% edited
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Add tone email modal
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

function deleteToneEmail(id) {
  if (confirm('Are you sure you want to delete this training email?')) {
    ToneProfileManager.deleteTrainingEmail(id);
    loadToneManagementUI();
    showNotification('Deleted', 'Training email removed', 'info');
  }
}

function deleteEditedEmail(id) {
  const data = localStorage.getItem('letimail_edited_emails');
  if (!data) return;
  
  let emails = JSON.parse(data);
  emails = emails.filter(e => e.id !== id);
  localStorage.setItem('letimail_edited_emails', JSON.stringify(emails));
  
  loadToneManagementUI();
  showNotification('Removed', 'Edited email removed from learning', 'info');
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

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    document.body.removeChild(modal);
  }
}

// Global function exports
window.generateEmailWithTone = generateEmailWithTone;
window.setupEnhancedAppFunctions = setupEnhancedAppFunctions;
window.setupToneManagement = setupToneManagement;
window.showAddToneEmailModal = showAddToneEmailModal;
window.saveToneEmail = saveToneEmail;
window.editToneEmail = editToneEmail;
window.updateToneEmail = updateToneEmail;
window.deleteToneEmail = deleteToneEmail;
window.deleteEditedEmail = deleteEditedEmail;
window.viewFullEmail = viewFullEmail;
window.closeModal = closeModal;

// Replace old generateEmail with new version
if (document.getElementById('generateBtn')) {
  document.getElementById('generateBtn').removeEventListener('click', generateEmail);
  document.getElementById('generateBtn').addEventListener('click', generateEmailWithTone);
  setupEnhancedAppFunctions();
}

// Initialize tone management on settings page
if (document.getElementById('settings-panels')) {
  setupToneManagement();
}
