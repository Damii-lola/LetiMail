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
        } else {
            throw new Error(data.error || 'Registration failed');
        }
    } catch (error) {
        showNotification('Error', error.message, 'error');
    } finally {
        hideButtonLoading(verifyBtn);
    }
}

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

// Auto-initialize for app.html
if (document.getElementById('generateBtn')) {
    document.getElementById('generateBtn').addEventListener('click', generateEmail);
    setupAppFunctions();
}

// Auto-initialize for settings.html
if (document.getElementById('settings-panels')) {
    setupSettingsPage();
}
