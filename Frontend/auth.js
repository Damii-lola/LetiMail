// Authentication and Notification System
class AuthSystem {
    constructor() {
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
        document.getElementById('userMenu').style.display = 'flex';
        document.getElementById('authButtons').style.display = 'none';
        
        // Set avatar with first letter of name
        const avatarText = document.getElementById('avatarText');
        avatarText.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
        
        // Update user info on all pages
        this.updateUserInfo(user);
    }

    // Show auth buttons when not logged in
    showAuthButtons() {
        document.getElementById('userMenu').style.display = 'none';
        document.getElementById('authButtons').style.display = 'flex';
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

        document.getElementById('loginWithOtp')?.addEventListener('click', () => {
            this.showOtpLoginModal();
        });

        document.getElementById('showPasswordLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginModal();
        });

        // Form submissions
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('signupForm')?.addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('otpLoginForm')?.addEventListener('submit', (e) => this.handleOtpLogin(e));
        
        // OTP send button
        document.getElementById('sendOtpBtn')?.addEventListener('click', () => this.sendOtp());
        
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
    }

    // Modal functions
    showLoginModal() {
        document.getElementById('authModals').style.display = 'block';
        document.getElementById('loginModal').style.display = 'flex';
        document.getElementById('signupModal').style.display = 'none';
        document.getElementById('otpLoginModal').style.display = 'none';
    }

    showSignupModal() {
        document.getElementById('authModals').style.display = 'block';
        document.getElementById('signupModal').style.display = 'flex';
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('otpLoginModal').style.display = 'none';
    }

    showOtpLoginModal() {
        document.getElementById('authModals').style.display = 'block';
        document.getElementById('otpLoginModal').style.display = 'flex';
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('signupModal').style.display = 'none';
    }

    hideAuthModal() {
        document.getElementById('authModals').style.display = 'none';
        this.resetForms();
    }

    resetForms() {
        const forms = document.querySelectorAll('.auth-form');
        forms.forEach(form => form.reset());
        
        const buttons = document.querySelectorAll('.auth-btn .btn-spinner');
        buttons.forEach(btn => btn.style.display = 'none');
        
        const btnTexts = document.querySelectorAll('.auth-btn .btn-text');
        btnTexts.forEach(text => text.style.display = 'block');
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

    // Notification system
    setupNotification() {
        const notification = document.getElementById('notification');
        const closeBtn = notification.querySelector('.notification-close');
        
        closeBtn.addEventListener('click', () => {
            this.hideNotification();
        });

        // Auto-hide after 5 seconds
        notification.addEventListener('animationend', () => {
            if (notification.classList.contains('show')) {
                setTimeout(() => {
                    this.hideNotification();
                }, 5000);
            }
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const messageEl = notification.querySelector('.notification-message');
        const iconEl = notification.querySelector('.notification-icon');
        
        messageEl.textContent = message;
        notification.className = `notification show ${type}`;
        
        // Set icon based on type
        switch(type) {
            case 'success':
                iconEl.innerHTML = '✓';
                break;
            case 'error':
                iconEl.innerHTML = '✕';
                break;
            case 'warning':
                iconEl.innerHTML = '⚠';
                break;
            default:
                iconEl.innerHTML = 'ℹ';
        }
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
            
            this.showNotification('Login successful!', 'success');
            this.hideAuthModal();
            this.showUserMenu(data.user);
            
            // Redirect to app if on landing page
            if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                setTimeout(() => {
                    window.location.href = 'app.html';
                }, 1000);
            }
            
        } catch (error) {
            this.showNotification(error.message, 'error');
        } finally {
            this.hideButtonLoading(button);
        }
    }

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
            
            this.showNotification(data.message, 'success');
            this.hideAuthModal();
            
        } catch (error) {
            this.showNotification(error.message, 'error');
        } finally {
            this.hideButtonLoading(button);
        }
    }

    async sendOtp() {
        const email = document.getElementById('otpEmail').value;
        const button = document.getElementById('sendOtpBtn');
        
        if (!email) {
            this.showNotification('Please enter your email', 'error');
            return;
        }
        
        button.disabled = true;
        button.textContent = 'Sending...';
        
        try {
            await this.makeApiCall('https://letimail-production.up.railway.app/auth/send-otp', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            
            this.showNotification('OTP sent to your email!', 'success');
            button.textContent = 'Resend OTP';
            
            // Enable button after 30 seconds
            setTimeout(() => {
                button.disabled = false;
            }, 30000);
            
        } catch (error) {
            this.showNotification(error.message, 'error');
            button.disabled = false;
            button.textContent = 'Send OTP';
        }
    }

    async handleOtpLogin(e) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        this.showButtonLoading(button);
        
        const email = document.getElementById('otpEmail').value;
        const otp = document.getElementById('otpCode').value;
        
        try {
            const data = await this.makeApiCall('https://letimail-production.up.railway.app/auth/verify-otp', {
                method: 'POST',
                body: JSON.stringify({ email, otp })
            });
            
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            this.showNotification('Login successful!', 'success');
            this.hideAuthModal();
            this.showUserMenu(data.user);
            
            // Redirect to app if on landing page
            if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                setTimeout(() => {
                    window.location.href = 'app.html';
                }, 1000);
            }
            
        } catch (error) {
            this.showNotification(error.message, 'error');
        } finally {
            this.hideButtonLoading(button);
        }
    }

    handleLogout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.showAuthButtons();
        this.showNotification('Logged out successfully', 'info');
        
        // Redirect to home if on app or settings page
        if (window.location.pathname.includes('app.html') || window.location.pathname.includes('settings.html')) {
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
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
