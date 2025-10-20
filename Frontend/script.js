// Global Auth State
let currentUser = null;
let authToken = null;
let signupData = {};

const BACKEND_URL = 'https://letimail-production.up.railway.app';

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    checkAuthState();
    setupEventListeners();
    setupNotification();
    createAuthModals();
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
        } else {
            localStorage.removeItem('authToken');
            authToken = null;
            showAuthButtons();
        }
    } catch (error) {
        console.error('Auth check error:', error);
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
                        <span class="otp-hint">Check your email for the 6-digit verification code</span>
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
        console.log('Sending OTP to:', email);
        const response = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();
        console.log('OTP response:', data);

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
        console.error('OTP send error:', error);
        showNotification('Error', error.message, 'error');
    } finally {
        hideButtonLoading(sendOtpBtn);
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
        console.log('Registering with OTP:', { ...signupData, otp: '***' });
        
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
        console.log('Registration response:', data);

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
        console.error('Registration error:', error);
        showNotification('Registration Failed', error.message, 'error');
    } finally {
        hideButtonLoading(verifyBtn);
    }
}

// Resend OTP timer
function startResendTimer() {
    const resendBtn = document.getElementById('resendOtp');
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

// Event Listeners Setup
function setupEventListeners() {
    // Auth modal triggers
    document.getElementById('loginBtn')?.addEventListener('click', showLoginModal);
    document.getElementById('signupBtn')?.addEventListener('click', showSignupModal);
    
    // Form submissions
    document.addEventListener('submit', function(e) {
        if (e.target.id === 'loginForm') {
            e.preventDefault();
            handleLogin(e);
        }
    });

    // Modal navigation
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
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
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
    document.getElementById('signupModal').style.display = 'flex';
    resetForms();
}

function showLoginModal() {
    hideAllModals();
    document.getElementById('loginModal').style.display = 'flex';
    resetForms();
}

function hideAuthModal() {
    hideAllModals();
    resetForms();
}

function hideAllModals() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => modal.style.display = 'none');
}

function resetForms() {
    const forms = document.querySelectorAll('.auth-form');
    forms.forEach(form => {
        form.reset();
        const button = form.querySelector('.auth-btn');
        if (button) {
            hideButtonLoading(button);
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
    const btnText = button.querySelector('.btn-text');
    const spinner = button.querySelector('.btn-spinner');
    
    if (btnText) btnText.style.display = 'none';
    if (spinner) spinner.style.display = 'block';
    button.disabled = true;
}

function hideButtonLoading(button) {
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
    closeBtn.addEventListener('click', hideNotification);
}

function showNotification(title, message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    const titleEl = notification.querySelector('.notification-title');
    const messageEl = notification.querySelector('.notification-message');
    const iconEl = notification.querySelector('.notification-icon');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    notification.className = `notification show ${type}`;
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    iconEl.className = `notification-icon ${icons[type] || icons.info}`;
    
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

// Email Generation Functions
async function generateEmail() {
    if (!currentUser || !authToken) {
        showNotification('Authentication Required', 'Please sign in to generate emails', 'error');
        showLoginModal();
        return;
    }

    const business = document.getElementById('businessDesc')?.value;
    const context = document.getElementById('context')?.value;
    const tone = document.getElementById('tone')?.value;

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
    outputDiv.innerHTML = '<div class="output-placeholder"><div class="placeholder-icon">⏳</div><p>Generating your email...</p></div>';
    
    if (actionButtons) actionButtons.style.display = 'none';

    try {
        const response = await fetch(`${BACKEND_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ business, context, tone })
        });

        const data = await response.json();
        
        if (response.ok) {
            outputDiv.innerText = data.email;
            if (actionButtons) actionButtons.style.display = 'flex';
            showNotification('Success', 'Email generated successfully!', 'success');
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

// Global functions for modal access
window.showLoginModal = showLoginModal;
window.showSignupModal = showSignupModal;
window.hideAuthModal = hideAuthModal;
window.handleGetStarted = handleGetStarted;
window.generateEmail = generateEmail;
window.sendOTP = sendOTP;
window.verifyOTPAndRegister = verifyOTPAndRegister;

// Auto-initialize for app.html
if (document.getElementById('generateBtn')) {
    document.getElementById('generateBtn').addEventListener('click', generateEmail);
}
