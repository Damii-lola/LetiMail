// Enhanced Authentication System
class AuthSystem {
    constructor() {
        this.currentOtpEmail = null;
        this.otpResendTimer = null;
        this.init();
    }

    init() {
        this.checkAuthState();
        this.setupEventListeners();
        this.setupNotification();
    }

    // Check if user is logged in
    checkAuthState() {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        if (token && user.id) {
            this.showUserMenu(user);
        } else {
            this.showAuthButtons();
        }
    }

    // Show user menu when logged in
    showUserMenu(user) {
        const userMenu = document.getElementById('userMenu');
        const authButtons = document.getElementById('authButtons');
        
        if (userMenu) userMenu.style.display = 'flex';
        if (authButtons) authButtons.style.display = 'none';
        
        // Set avatar with first letter of name on ALL pages
        this.updateUserAvatar(user.name);
        
        // Update user info on all pages
        this.updateUserInfo(user);
    }

    // Show auth buttons when not logged in
    showAuthButtons() {
        const userMenu = document.getElementById('userMenu');
        const authButtons = document.getElementById('authButtons');
        
        if (userMenu) userMenu.style.display = 'none';
        if (authButtons) authButtons.style.display = 'flex';
    }

    // Update user avatar on ALL pages
    updateUserAvatar(userName) {
        const avatarElements = document.querySelectorAll('#avatarText');
        avatarElements.forEach(element => {
            if (userName) {
                element.textContent = userName.charAt(0).toUpperCase();
            }
        });
    }

    // Update user info across all pages
    updateUserInfo(user) {
        // Update plan info if elements exist
        const planElement = document.getElementById('planType');
        const emailCountElement = document.getElementById('emailCount');
        
        if (planElement) {
            planElement.textContent = user.plan ? `${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Plan` : 'Free Plan';
        }
        
        if (emailCountElement) {
            emailCountElement.textContent = `${user.emailsLeft || 25} emails left`;
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Auth modal triggers
        document.getElementById('loginBtn')?.addEventListener('click', () => this.showLoginModal());
        document.getElementById('signupBtn')?.addEventListener('click', () => this.showSignupModal());
        
        // Modal navigation
        document.getElementById('showSignup')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showSignupModal();
        });
        
        document.getElementById('showLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginModal();
        });

        document.getElementById('changeEmail')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showSignupModal();
        });

        // Form submissions
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('signupForm')?.addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('otpForm')?.addEventListener('submit', (e) => this.handleOtpVerification(e));
        
        // OTP resend button
        document.getElementById('resendOtp')?.addEventListener('click', () => this.resendOtp());
        
        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());

        // Close modal when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.hideAuthModal();
            }
        });

        // User avatar dropdown
        const userAvatar = document.getElementById('userAvatar');
        if (userAvatar) {
            userAvatar.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = userAvatar.nextElementSibling;
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                const dropdowns = document.querySelectorAll('.dropdown-menu');
                dropdowns.forEach(dropdown => {
                    dropdown.style.display = 'none';
                });
            });
        }

        // OTP input formatting
        const otpInput = document.getElementById('otpCode');
        if (otpInput) {
            otpInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
            });
        }
    }

    // Modal functions
    showSignupModal() {
        document.getElementById('authModals').style.display = 'block';
        document.getElementById('signupModal').style.display = 'flex';
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('otpModal').style.display = 'none';
        this.resetForms();
    }

    showOtpModal(email) {
        this.currentOtpEmail = email;
        document.getElementById('authModals').style.display = 'block';
        document.getElementById('otpModal').style.display = 'flex';
        document.getElementById('signupModal').style.display = 'none';
        document.getElementById('loginModal').style.display = 'none';
        
        // Start resend timer
        this.startOtpResendTimer();
    }

    showLoginModal() {
        document.getElementById('authModals').style.display = 'block';
        document.getElementById('loginModal').style.display = 'flex';
        document.getElementById('signupModal').style.display = 'none';
        document.getElementById('otpModal').style.display = 'none';
        this.resetForms();
    }

    hideAuthModal() {
        document.getElementById('authModals').style.display = 'none';
        this.resetForms();
        this.clearOtpTimer();
    }

    resetForms() {
        const forms = document.querySelectorAll('.auth-form');
        forms.forEach(form => {
            form.reset();
            const button = form.querySelector('.auth-btn');
            if (button) {
                this.hideButtonLoading(button);
            }
        });
    }

    // OTP Timer functions
    startOtpResendTimer() {
        this.clearOtpTimer();
        let timeLeft = 60;
        const resendBtn = document.getElementById('resendOtp');
        
        if (resendBtn) {
            resendBtn.disabled = true;
            
            this.otpResendTimer = setInterval(() => {
                timeLeft--;
                resendBtn.textContent = `Resend (${timeLeft}s)`;
                
                if (timeLeft <= 0) {
                    this.clearOtpTimer();
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend OTP';
                }
            }, 1000);
        }
    }

    clearOtpTimer() {
        if (this.otpResendTimer) {
            clearInterval(this.otpResendTimer);
            this.otpResendTimer = null;
        }
    }

    // Show loading state on buttons
    showButtonLoading(button) {
        const btnText = button.querySelector('.btn-text');
        const spinner = button.querySelector('.btn-spinner');
        
        if (btnText) btnText.style.display = 'none';
        if (spinner) spinner.style.display = 'block';
        button.disabled = true;
    }

    hideButtonLoading(button) {
        const btnText = button.querySelector('.btn-text');
        const spinner = button.querySelector('.btn-spinner');
        
        if (btnText) btnText.style.display = 'block';
        if (spinner) spinner.style.display = 'none';
        button.disabled = false;
    }

    // Enhanced Notification system
    setupNotification() {
        const notification = document.getElementById('notification');
        const closeBtn = notification.querySelector('.notification-close');
        
        closeBtn.addEventListener('click', () => {
            this.hideNotification();
        });

        // Auto-hide after 5 seconds
        notification.addEventListener('animationend', (e) => {
            if (e.animationName === 'notificationSlideIn' && notification.classList.contains('show')) {
                setTimeout(() => {
                    this.hideNotification();
                }, 5000);
            }
        });
    }

    showNotification(title, message, type = 'info') {
        const notification = document.getElementById('notification');
        const titleEl = notification.querySelector('.notification-title');
        const messageEl = notification.querySelector('.notification-message');
        const iconEl = notification.querySelector('.notification-icon');
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        notification.className = `notification show ${type}`;
        
        // Set icon based on type
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        iconEl.className = `notification-icon ${icons[type] || icons.info}`;
        
        // Auto hide after 5 seconds
        setTimeout(() => {
            this.hideNotification();
        }, 5000);
    }

    hideNotification() {
        const notification = document.getElementById('notification');
        notification.classList.remove('show');
    }

    // API call helper
    async makeApiCall(url, options) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Something went wrong');
            }
            
            return data;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    // Auth handlers
    async handleSignup(e) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        this.showButtonLoading(button);
        
        const name = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        
        try {
            const data = await this.makeApiCall('https://letimail-production.up.railway.app/auth/signup', {
                method: 'POST',
                body: JSON.stringify({ name, email, password })
            });
            
            this.showNotification('Verification Sent', 'We sent a 6-digit OTP to your email', 'success');
            this.showOtpModal(email);
            
        } catch (error) {
            this.showNotification('Signup Failed', error.message, 'error');
        } finally {
            this.hideButtonLoading(button);
        }
    }

    async handleOtpVerification(e) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        this.showButtonLoading(button);
        
        const otp = document.getElementById('otpCode').value;
        
        if (!this.currentOtpEmail) {
            this.showNotification('Error', 'No email found for verification', 'error');
            this.hideButtonLoading(button);
            return;
        }

        if (otp.length !== 6) {
            this.showNotification('Invalid OTP', 'Please enter a 6-digit code', 'error');
            this.hideButtonLoading(button);
            return;
        }
        
        try {
            const data = await this.makeApiCall('https://letimail-production.up.railway.app/auth/verify-otp-signup', {
                method: 'POST',
                body: JSON.stringify({ email: this.currentOtpEmail, otp })
            });
            
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            this.showNotification('Welcome!', 'Your account has been verified successfully', 'success');
            this.hideAuthModal();
            this.showUserMenu(data.user);
            
            // Redirect to app if on landing page
            if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                setTimeout(() => {
                    window.location.href = 'app.html';
                }, 1500);
            }
            
        } catch (error) {
            this.showNotification('Verification Failed', error.message, 'error');
        } finally {
            this.hideButtonLoading(button);
        }
    }

    async resendOtp() {
        if (!this.currentOtpEmail) return;

        const resendBtn = document.getElementById('resendOtp');
        resendBtn.disabled = true;
        resendBtn.textContent = 'Sending...';

        try {
            await this.makeApiCall('https://letimail-production.up.railway.app/auth/resend-otp', {
                method: 'POST',
                body: JSON.stringify({ email: this.currentOtpEmail })
            });

            this.showNotification('OTP Resent', 'New verification code sent to your email', 'success');
            this.startOtpResendTimer();

        } catch (error) {
            this.showNotification('Resend Failed', error.message, 'error');
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend OTP';
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        this.showButtonLoading(button);
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const data = await this.makeApiCall('https://letimail-production.up.railway.app/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            this.showNotification('Welcome Back!', 'Successfully signed in to your account', 'success');
            this.hideAuthModal();
            this.showUserMenu(data.user);
            
            // Redirect to app if on landing page
            if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                setTimeout(() => {
                    window.location.href = 'app.html';
                }, 1500);
            }
            
        } catch (error) {
            this.showNotification('Login Failed', error.message, 'error');
        } finally {
            this.hideButtonLoading(button);
        }
    }

    handleLogout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.showAuthButtons();
        this.showNotification('Signed Out', 'You have been successfully signed out', 'info');
        
        // Redirect to home if on app or settings page
        if (window.location.pathname.includes('app.html') || window.location.pathname.includes('settings.html')) {
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        }
    }
}

// Handle "Start Writing" button
function handleGetStarted() {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = 'app.html';
    } else {
        if (window.authSystem) {
            window.authSystem.showSignupModal();
        }
    }
}

// Initialize auth system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authSystem = new AuthSystem();
});

// Global functions for modal access
function showLoginModal() {
    if (window.authSystem) {
        window.authSystem.showLoginModal();
    }
}

function showSignupModal() {
    if (window.authSystem) {
        window.authSystem.showSignupModal();
    }
}

function hideAuthModal() {
    if (window.authSystem) {
        window.authSystem.hideAuthModal();
    }
}
