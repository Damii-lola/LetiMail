// Settings Page Functionality
class SettingsManager {
    constructor() {
        this.init();
    }

    init() {
        this.loadUserData();
        this.setupEventListeners();
        this.setupTabNavigation();
    }

    loadUserData() {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Update profile form
        document.getElementById('profileName').value = user.name || '';
        document.getElementById('profileEmail').value = user.email || '';
        
        // Update subscription info
        document.getElementById('currentPlanName').textContent = user.plan ? `${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Plan` : 'Free Plan';
        document.getElementById('emailsUsed').textContent = `${user.emailsUsed || 0}/25`;
        document.getElementById('dailyEmailsUsed').textContent = `${user.dailyEmailsUsed || 0}/5`;
    }

    setupEventListeners() {
        // Profile form
        document.getElementById('profileForm').addEventListener('submit', (e) => this.handleProfileUpdate(e));
        
        // Password form
        document.getElementById('passwordForm').addEventListener('submit', (e) => this.handlePasswordChange(e));
        
        // Preferences form
        document.getElementById('preferencesForm').addEventListener('submit', (e) => this.handlePreferencesUpdate(e));
        
        // Notifications form
        document.getElementById('notificationsForm').addEventListener('submit', (e) => this.handleNotificationsUpdate(e));
        
        // Security buttons
        document.getElementById('enable2fa').addEventListener('click', () => this.enable2FA());
        document.getElementById('logoutAll').addEventListener('click', () => this.logoutAllDevices());
    }

    setupTabNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const panels = document.querySelectorAll('.settings-panel');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.getAttribute('data-tab');
                
                // Update active nav item
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                // Show corresponding panel
                panels.forEach(panel => panel.classList.remove('active'));
                document.getElementById(`${tab}-panel`).classList.add('active');
            });
        });
    }

    async handleProfileUpdate(e) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        this.showButtonLoading(button);

        const formData = {
            name: document.getElementById('profileName').value,
            company: document.getElementById('profileCompany').value,
            role: document.getElementById('profileRole').value
        };

        try {
            const data = await this.makeApiCall('https://letimail-production.up.railway.app/auth/update-profile', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });

            // Update local storage
            const user = JSON.parse(localStorage.getItem('user'));
            user.name = formData.name;
            localStorage.setItem('user', JSON.stringify(user));

            // Update avatar
            document.getElementById('avatarText').textContent = formData.name.charAt(0).toUpperCase();

            if (window.authSystem) {
                window.authSystem.showNotification('Profile updated successfully!', 'success');
            }

        } catch (error) {
            if (window.authSystem) {
                window.authSystem.showNotification(error.message, 'error');
            }
        } finally {
            this.hideButtonLoading(button);
        }
    }

    async handlePasswordChange(e) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        this.showButtonLoading(button);

        const formData = {
            currentPassword: document.getElementById('currentPassword').value,
            newPassword: document.getElementById('newPassword').value,
            confirmPassword: document.getElementById('confirmPassword').value
        };

        if (formData.newPassword !== formData.confirmPassword) {
            if (window.authSystem) {
                window.authSystem.showNotification('New passwords do not match', 'error');
            }
            this.hideButtonLoading(button);
            return;
        }

        try {
            await this.makeApiCall('https://letimail-production.up.railway.app/auth/change-password', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });

            if (window.authSystem) {
                window.authSystem.showNotification('Password updated successfully!', 'success');
            }
            e.target.reset();

        } catch (error) {
            if (window.authSystem) {
                window.authSystem.showNotification(error.message, 'error');
            }
        } finally {
            this.hideButtonLoading(button);
        }
    }

    async handlePreferencesUpdate(e) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        this.showButtonLoading(button);

        const preferences = {
            defaultTone: document.getElementById('defaultTone').value,
            emailLength: document.getElementById('emailLength').value,
            autoSave: document.getElementById('autoSave').checked,
            spellCheck: document.getElementById('spellCheck').checked
        };

        try {
            await this.makeApiCall('https://letimail-production.up.railway.app/auth/update-preferences', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ preferences })
            });

            if (window.authSystem) {
                window.authSystem.showNotification('Preferences saved successfully!', 'success');
            }

        } catch (error) {
            if (window.authSystem) {
                window.authSystem.showNotification(error.message, 'error');
            }
        } finally {
            this.hideButtonLoading(button);
        }
    }

    async handleNotificationsUpdate(e) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        this.showButtonLoading(button);

        const notifications = {
            email: {
                updates: document.getElementById('emailUpdates').checked,
                tips: document.getElementById('emailTips').checked,
                promo: document.getElementById('emailPromo').checked
            },
            inApp: {
                usage: document.getElementById('inAppUsage').checked,
                success: document.getElementById('inAppSuccess').checked,
                errors: document.getElementById('inAppErrors').checked
            }
        };

        try {
            await this.makeApiCall('https://letimail-production.up.railway.app/auth/update-notifications', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ notifications })
            });

            if (window.authSystem) {
                window.authSystem.showNotification('Notification settings saved!', 'success');
            }

        } catch (error) {
            if (window.authSystem) {
                window.authSystem.showNotification(error.message, 'error');
            }
        } finally {
            this.hideButtonLoading(button);
        }
    }

    enable2FA() {
        if (window.authSystem) {
            window.authSystem.showNotification('2FA feature coming soon!', 'info');
        }
    }

    logoutAllDevices() {
        if (window.authSystem) {
            window.authSystem.showNotification('This will log you out from all devices', 'warning');
            // Implement logout all functionality
        }
    }

    // Helper methods
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
}

// Initialize settings manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
});
