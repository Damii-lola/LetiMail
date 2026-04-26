<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LetiMail — AI Email Assistant That Sounds Like You</title>
  <link rel="stylesheet" href="Frontend/style.css" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head>
<body>
  <!-- Notification System -->
  <div id="notification" class="notification">
    <div class="notification-content">
      <div class="notification-icon"></div>
      <div class="notification-text">
        <div class="notification-title"></div>
        <div class="notification-message"></div>
      </div>
      <button class="notification-close">
        <i class="fas fa-times"></i>
      </button>
    </div>
  </div>

  <!-- Navigation -->
  <header class="navbar">
    <div class="nav-container">
      <div class="logo">
        <div class="logo-mark">L</div>
        <div class="logo-text">
          <h1>LetiMail</h1>
          <span class="logo-tagline">Your Voice, AI Powered</span>
        </div>
      </div>
      <div class="nav-actions">
        <div id="userMenu" class="user-menu" style="display: none;">
          <button class="user-avatar" id="userAvatar">
            <span id="avatarText">U</span>
          </button>
          <div class="dropdown-menu">
            <a href="#app-section" class="dropdown-item">
              <i class="fas fa-envelope"></i>Email Generator
            </a>
            <a href="#settings-section" class="dropdown-item">
              <i class="fas fa-cog"></i>Settings
            </a>
            <div class="dropdown-divider"></div>
            <button id="logoutBtn" class="dropdown-item logout">
              <i class="fas fa-sign-out-alt"></i>Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="hero">
    <div class="hero-container">
      <div class="hero-content">
        <div class="hero-badge">
          <span class="badge-icon">✨</span>
          AI-Powered Email Assistant
        </div>
        <h1 class="hero-title">
          Write emails that sound<br>
          <span class="gradient-text">exactly like you</span>
        </h1>
        <p class="hero-description">
          Stop struggling with email composition and focus on what truly matters - building relationships and growing your business.
        </p>
        <div class="hero-cta">
          <button class="primary-cta" onclick="handleGetStarted()">Start 5-Day Free Trial</button>
        </div>
        <div class="hero-stats">
          <div class="stat">
            <div class="stat-number">10x</div>
            <div class="stat-label">Faster Writing</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <div class="stat-number">100%</div>
            <div class="stat-label">Your Voice</div>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <div class="stat-number">Adaptable</div>
            <div class="stat-label">AI Technology</div>
          </div>
        </div>
      </div>
      <div class="hero-visual">
        <div class="floating-card card-1">
          <div class="card-header">
            <div class="card-dot"></div>
            <div class="card-dot"></div>
            <div class="card-dot"></div>
          </div>
          <div class="card-content">
            <div class="typing-indicator">Generating your email...</div>
          </div>
        </div>
        <div class="floating-card card-2">
          <div class="email-preview">
            <div class="preview-line long"></div>
            <div class="preview-line medium"></div>
            <div class="preview-line short"></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Problem Section -->
  <section class="problem-section section">
    <div class="container">
      <div class="section-header">
        <span class="section-label">The Challenge</span>
        <h2>The Email Struggle is Real</h2>
        <p>Business professionals waste countless hours crafting the perfect email</p>
      </div>
      <div class="problem-grid">
        <div class="problem-card">
          <div class="problem-icon-wrapper">
            <div class="problem-icon">⏰</div>
          </div>
          <h3>Time-Consuming</h3>
          <p>Professionals spend countless hours crafting emails that balance professionalism with authenticity.</p>
        </div>
        <div class="problem-card">
          <div class="problem-icon-wrapper">
            <div class="problem-icon">🤖</div>
          </div>
          <h3>Generic Content</h3>
          <p>Current AI tools produce robotic, "one-size-fits-all" content that lacks your personal nuance.</p>
        </div>
        <div class="problem-card">
          <div class="problem-icon-wrapper">
            <div class="problem-icon">✍️</div>
          </div>
          <h3>Editing Overload</h3>
          <p>You end up spending more time editing AI content than writing from scratch.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Solution Section -->
  <section class="solution-section section" id="features">
    <div class="container">
      <div class="section-header">
        <span class="section-label">The LetiMail Difference</span>
        <h2>AI that learns your unique style</h2>
        <p>Experience the magic of personalized communication</p>
      </div>
      <div class="solution-grid">
        <div class="solution-card">
          <div class="solution-number">01</div>
          <div class="solution-icon">🎯</div>
          <h3>Intelligent Email Generation</h3>
          <p>Simply describe what you want to communicate in plain English, and LetiMail instantly creates professional, context-aware emails ready to send.</p>
        </div>
        <div class="solution-card">
          <div class="solution-number">02</div>
          <div class="solution-icon">💬</div>
          <h3>Personalized Tone Matching</h3>
          <p>LetiMail learns and replicates your personal writing style. Provide writing examples during setup, and our AI analyzes your patterns to ensure every email sounds authentically like you.</p>
        </div>
        <div class="solution-card">
          <div class="solution-number">03</div>
          <div class="solution-icon">📤</div>
          <h3>Seamless Sending Platform</h3>
          <p>Generate, refine, and send messages directly from our platform. All replies route straight to your primary inbox - no switching between apps.</p>
        </div>
        <div class="solution-card">
          <div class="solution-number">04</div>
          <div class="solution-icon">💡</div>
          <h3>Smart Reply Assistance</h3>
          <p>Forward emails to LetiMail and get multiple thoughtful reply options. Our AI analyzes context and generates responses that fit perfectly.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Who Benefits Section -->
  <section class="benefits-section section">
    <div class="container">
      <div class="section-header">
        <span class="section-label">Perfect For</span>
        <h2>Who Benefits from LetiMail</h2>
      </div>
      <div class="benefits-grid">
        <div class="benefit-item">
          <div class="benefit-icon">📊</div>
          <h4>Sales Professionals</h4>
          <p>Craft personalized outreach at scale</p>
        </div>
        <div class="benefit-item">
          <div class="benefit-icon">💼</div>
          <h4>Busy Executives</h4>
          <p>Manage high-volume communication efficiently</p>
        </div>
        <div class="benefit-item">
          <div class="benefit-icon">🚀</div>
          <h4>Freelancers & Consultants</h4>
          <p>Maintain consistent client communication</p>
        </div>
        <div class="benefit-item">
          <div class="benefit-icon">🏢</div>
          <h4>Small Business Owners</h4>
          <p>Wear multiple hats with efficient solutions</p>
        </div>
        <div class="benefit-item">
          <div class="benefit-icon">🎯</div>
          <h4>Marketing Teams</h4>
          <p>Ensure brand voice consistency</p>
        </div>
        <div class="benefit-item">
          <div class="benefit-icon">⭐</div>
          <h4>Career Professionals</h4>
          <p>Make every communication count</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Pricing Section -->
  <section class="pricing-section section">
    <div class="container">
      <div class="section-header">
        <span class="section-label">Pricing Plans</span>
        <h2>Try LetiMail Risk-Free</h2>
        <p>Start with our 5-day free trial - no credit card required</p>
      </div>
      <div class="pricing-grid">
        <!-- Free Trial -->
        <div class="pricing-card featured">
          <div class="plan-badge featured-badge">Start Here</div>
          <h3 class="plan-name">5-Day Free Trial</h3>
          <div class="plan-price">
            <span class="price">$0</span>
            <span class="period">for 5 days</span>
          </div>
          <p class="plan-description">Experience the full power of LetiMail</p>
          <ul class="plan-features">
            <li><span class="check">✓</span> 3 emails per day during trial</li>
            <li><span class="check">✓</span> Full tone learning features</li>
            <li><span class="check">✓</span> Email generation and sending</li>
            <li><span class="check">✓</span> Smart reply assistance</li>
            <li><span class="check">✓</span> No credit card required</li>
            <li><span class="check">✓</span> Cancel anytime</li>
          </ul>
          <button class="plan-button plan-button-primary" onclick="showSignupModal()">Start Free Trial</button>
        </div>

        <!-- Premium Plan -->
        <div class="pricing-card">
          <div class="plan-badge">Most Popular</div>
          <h3 class="plan-name">Premium</h3>
          <div class="plan-price">
            <span class="price">$9.99</span>
            <span class="period">/month</span>
          </div>
          <p class="plan-description">For professionals who need unlimited access</p>
          <ul class="plan-features">
            <li><span class="check">✓</span> Unlimited email generation</li>
            <li><span class="check">✓</span> Unlimited sending</li>
            <li><span class="check">✓</span> Full tone learning & personalization</li>
            <li><span class="check">✓</span> Priority reply generation</li>
            <li><span class="check">✓</span> All advanced features</li>
            <li><span class="check">✓</span> Cancel anytime</li>
          </ul>
          <button class="plan-button plan-button-outline" onclick="showSignupModal()">Upgrade to Premium</button>
        </div>

        <!-- Business Plan -->
        <div class="pricing-card">
          <div class="plan-badge">For Teams</div>
          <h3 class="plan-name">Business</h3>
          <div class="plan-price">
            <span class="price">$29</span>
            <span class="period">/month</span>
          </div>
          <p class="plan-description">For teams that need collaboration</p>
          <ul class="plan-features">
            <li><span class="check">✓</span> Everything in Premium</li>
            <li><span class="check">✓</span> Up to 5 team members</li>
            <li><span class="check">✓</span> Shared templates</li>
            <li><span class="check">✓</span> Team analytics</li>
            <li><span class="check">✓</span> Custom integrations</li>
            <li><span class="check">✓</span> Dedicated support</li>
          </ul>
          <button class="plan-button plan-button-outline" onclick="showSignupModal()">Contact Sales</button>
        </div>
      </div>
    </div>
  </section>

  <!-- Workflow Section -->
  <section class="workflow-section section">
    <div class="container">
      <div class="section-header">
        <span class="section-label">How It Works</span>
        <h2>Simple Yet Powerful Workflow</h2>
      </div>
      <div class="workflow-steps">
        <div class="workflow-step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h3>Start 5-Day Trial</h3>
            <p>No credit card needed - experience LetiMail's full power</p>
          </div>
        </div>
        <div class="workflow-step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h3>Describe Your Goal</h3>
            <p>Tell LetiMail what you need to communicate in plain English</p>
          </div>
        </div>
        <div class="workflow-step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h3>Personalize</h3>
            <p>Let our AI adapt to your unique writing style</p>
          </div>
        </div>
        <div class="workflow-step">
          <div class="step-number">4</div>
          <div class="step-content">
            <h3>Review & Send</h3>
            <p>Deliver professional communication instantly</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- App Section -->
  <section class="app-main" id="app-section">
    <div class="app-container">
      <div class="app-header">
        <h1>Create Your Perfect Email</h1>
        <p>Transform your brief context into a complete, professional email in seconds</p>
      </div>

      <div class="app-workspace">
        <!-- Input Panel -->
        <div class="input-panel">
          <div class="panel-header">
            <h2>Your Input</h2>
          </div>

          <div class="input-group">
            <label for="businessDesc">
              <span class="label-icon">🏢</span>
              Describe Your Business
            </label>
            <textarea
              id="businessDesc"
              placeholder="e.g., I run a digital marketing agency specializing in SaaS companies..."
              rows="4"
            ></textarea>
            <span class="input-hint">Help AI understand your business context</span>
          </div>

          <div class="input-group">
            <label for="context">
              <span class="label-icon">💬</span>
              Email Context & Purpose
            </label>
            <textarea
              id="context"
              placeholder="e.g., Following up with a prospect who showed interest in our premium package..."
              rows="4"
            ></textarea>
            <span class="input-hint">What's the purpose of this email?</span>
          </div>

          <div class="input-group">
            <label for="tone">
              <span class="label-icon">🎨</span>
              Select Tone
            </label>
            <select id="tone">
              <option value="friendly">🤝 Friendly & Approachable</option>
              <option value="formal">💼 Professional & Formal</option>
              <option value="persuasive">🎯 Persuasive & Compelling</option>
              <option value="casual">😊 Casual & Conversational</option>
            </select>
          </div>

          <div class="input-group">
            <label for="emailLength">
              <span class="label-icon">📏</span>
              Email Length
            </label>
            <select id="emailLength">
              <option value="short">Short & Concise (5-8 sentences)</option>
              <option value="medium" selected>Medium Length (8-11 sentences)</option>
              <option value="long">Detailed & Comprehensive (11+ sentences)</option>
            </select>
          </div>

          <button id="generateBtn" class="generate-btn">
            <span class="btn-icon">✨</span>
            <span class="btn-text">Generate My Email</span>
            <div class="btn-spinner"></div>
          </button>
        </div>

        <!-- Output Panel -->
        <div class="output-panel">
          <div class="panel-header">
            <h2>Generated Email</h2>
            <span class="quality-badge">Adaptable AI</span>
          </div>

          <div id="output" class="output-text">
            <div class="output-placeholder">
              <div class="placeholder-animation">
                <div class="animation-ring"></div>
                <div class="placeholder-icon">✉️</div>
              </div>
              <p>Your personalized email will appear here</p>
              <small>Powered by AI that learns your unique style</small>
            </div>
          </div>

          <div id="actionButtons" class="action-buttons" style="display: none;">
            <button id="copyBtn" class="action-btn copy-btn">
              <span class="btn-icon">📋</span>
              Copy Email
            </button>
            <button id="editBtn" class="action-btn edit-btn">
              <span class="btn-icon">✏️</span>
              Edit Email
            </button>
            <button id="sendBtn" class="action-btn send-btn">
              <span class="btn-icon">📤</span>
              Send Email
            </button>
          </div>
        </div>
      </div>

      <!-- Tips Section -->
      <div class="tips-section">
        <h3>💡 Pro Tips for Better Results</h3>
        <div class="tips-grid">
          <div class="tip-card">
            <span class="tip-icon">🎯</span>
            <h4>Be Specific</h4>
            <p>The more context you provide, the better your email will be</p>
          </div>
          <div class="tip-card">
            <span class="tip-icon">🗣️</span>
            <h4>Your Voice</h4>
            <p>Describe how you naturally communicate in business</p>
          </div>
          <div class="tip-card">
            <span class="tip-icon">✏️</span>
            <h4>Refine & Edit</h4>
            <p>Edit generated emails to train the AI on your style</p>
          </div>
        </div>
      </div>

      <!-- Features Highlight -->
      <div class="app-features">
        <div class="feature-highlight">
          <div class="feature-icon">🎨</div>
          <div class="feature-content">
            <h4>Personalized Tone Matching</h4>
            <p>Every email reflects your unique writing style and business voice</p>
          </div>
        </div>
        <div class="feature-highlight">
          <div class="feature-icon">⚡</div>
          <div class="feature-content">
            <h4>Lightning Fast Generation</h4>
            <p>Get professional emails in seconds, not minutes or hours</p>
          </div>
        </div>
        <div class="feature-highlight">
          <div class="feature-icon">📤</div>
          <div class="feature-content">
            <h4>Direct Sending</h4>
            <p>Send emails directly from LetiMail with replies to your inbox</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Settings Section -->
  <section class="settings-main" id="settings-section">
    <div class="settings-container">
      <div class="settings-header">
        <h1>Account Settings</h1>
        <p>Manage your LetiMail account and preferences</p>
      </div>
      <div class="settings-content">
        <!-- Sidebar Navigation -->
        <div class="settings-sidebar">
          <nav class="settings-nav">
            <button class="nav-item active" data-tab="profile">
              <i class="fas fa-user"></i>
              Profile
            </button>
            <button class="nav-item" data-tab="subscription">
              <i class="fas fa-crown"></i>
              Subscription
            </button>
            <button class="nav-item" data-tab="preferences">
              <i class="fas fa-sliders-h"></i>
              Preferences
            </button>
            <button class="nav-item" data-tab="security">
              <i class="fas fa-shield-alt"></i>
              Security
            </button>
          </nav>
        </div>

        <!-- Settings Panels -->
        <div class="settings-panels" id="settings-panels">
          <!-- Profile Tab -->
          <div class="settings-panel active" id="profile-panel">
            <h2>Profile Information</h2>
            <form id="profileForm" class="settings-form">
              <div class="form-group">
                <label for="profileName">Full Name</label>
                <input type="text" id="profileName" class="settings-input" placeholder="Enter your full name">
              </div>
              <div class="form-group">
                <label for="profileEmail">Email Address</label>
                <input type="email" id="profileEmail" class="settings-input" placeholder="Enter your email" readonly>
                <span class="input-hint">Email cannot be changed after registration</span>
              </div>
              <div class="form-group">
                <label for="profileCompany">Company</label>
                <input type="text" id="profileCompany" class="settings-input" placeholder="Enter your company name">
              </div>
              <div class="form-group">
                <label for="profileRole">Role</label>
                <input type="text" id="profileRole" class="settings-input" placeholder="Enter your role">
              </div>
              <button type="submit" class="settings-btn primary">
                <span class="btn-text">Save Changes</span>
                <div class="btn-spinner"></div>
              </button>
            </form>
          </div>

          <!-- Subscription Tab -->
          <div class="settings-panel" id="subscription-panel">
            <h2>Subscription Plan</h2>
            <div class="subscription-info">
              <div class="plan-card current-plan">
                <div class="plan-header">
                  <h3 id="currentPlanName">5-Day Free Trial</h3>
                  <span class="plan-badge">Current</span>
                </div>
                <div class="plan-features">
                  <div class="feature">
                    <i class="fas fa-check"></i>
                    <span>3 emails per day</span>
                  </div>
                  <div class="feature">
                    <i class="fas fa-check"></i>
                    <span>Full tone learning features</span>
                  </div>
                  <div class="feature">
                    <i class="fas fa-check"></i>
                    <span>Smart reply assistance</span>
                  </div>
                </div>
                <div class="plan-usage">
                  <div class="usage-item">
                    <span class="usage-label">Emails used today:</span>
                    <span class="usage-value" id="emailsUsed">0/3</span>
                  </div>
                  <div class="usage-item">
                    <span class="usage-label">Trial days remaining:</span>
                    <span class="usage-value" id="trialDays">5 days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Preferences Tab -->
          <div class="settings-panel" id="preferences-panel">
            <h2>Email Preferences</h2>
            <form id="preferencesForm" class="settings-form">
              <div class="form-group">
                <label for="defaultTone">Default Email Tone</label>
                <select id="defaultTone" class="settings-select">
                  <option value="friendly">Friendly & Approachable</option>
                  <option value="formal">Professional & Formal</option>
                  <option value="persuasive">Persuasive & Compelling</option>
                  <option value="casual">Casual & Conversational</option>
                </select>
                <span class="input-hint">This tone will be pre-selected when generating emails</span>
              </div>
              <div class="form-group">
                <label for="emailLength">Default Email Length</label>
                <select id="emailLength" class="settings-select">
                  <option value="short">Short & Concise (5-8 sentences)</option>
                  <option value="medium" selected>Medium Length (8-11 sentences)</option>
                  <option value="long">Detailed & Comprehensive (11+ sentences)</option>
                </select>
                <span class="input-hint">Choose your preferred default length</span>
              </div>

              <div class="preferences-section">
                <h4>Additional Settings</h4>
                <div class="form-group checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" id="autoSave" checked>
                    <span class="checkmark"></span>
                    Auto-save draft emails
                  </label>
                </div>
                <div class="form-group checkbox-group">
                  <label class="checkbox-label">
                    <input type="checkbox" id="spellCheck" checked>
                    <span class="checkmark"></span>
                    Enable spell check
                  </label>
                </div>
              </div>

              <button type="submit" class="settings-btn primary">
                <span class="btn-text">Save Preferences</span>
                <div class="btn-spinner"></div>
              </button>
            </form>
          </div>

          <!-- Security Tab -->
          <div class="settings-panel" id="security-panel">
            <h2>Security Settings</h2>
            <div class="security-sections">
              <div class="security-section">
                <h4>Change Password</h4>
                <form id="passwordForm" class="settings-form">
                  <div class="form-group">
                    <label for="currentPassword">Current Password</label>
                    <input type="password" id="currentPassword" class="settings-input" placeholder="Enter current password">
                  </div>
                  <div class="form-group">
                    <label for="newPassword">New Password</label>
                    <input type="password" id="newPassword" class="settings-input" placeholder="Enter new password (min. 6 characters)" minlength="6">
                    <span class="input-hint">Password must be at least 6 characters long</span>
                  </div>
                  <div class="form-group">
                    <label for="confirmPassword">Confirm New Password</label>
                    <input type="password" id="confirmPassword" class="settings-input" placeholder="Confirm new password">
                  </div>
                  <button type="submit" class="settings-btn primary">
                    <span class="btn-text">Update Password</span>
                    <div class="btn-spinner"></div>
                  </button>
                </form>
              </div>
              <div class="security-section">
                <h4>Login Activity</h4>
                <div class="login-sessions">
                  <div class="session-item">
                    <div class="session-info">
                      <strong>Current Session</strong>
                      <span>Active now</span>
                    </div>
                    <span class="session-status current">Active</span>
                  </div>
                </div>
              </div>
              <div class="security-section">
                <h4>Account Management</h4>
                <button id="deleteAccountBtn" class="settings-btn secondary delete-account-btn">
                  <i class="fas fa-exclamation-triangle"></i>
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section class="cta-section section">
    <div class="container">
      <div class="cta-content">
        <h2>Ready to Transform Your Email Workflow?</h2>
        <p>Spend less time writing emails and more time building your business with LetiMail</p>
        <button class="cta-button" onclick="handleGetStarted()">
          Start Your Free Trial
          <span class="cta-arrow">→</span>
        </button>
        <div class="cta-features">
          <div class="cta-feature">
            <span class="feature-check">✓</span>
            No credit card required
          </div>
          <div class="cta-feature">
            <span class="feature-check">✓</span>
            5-day free trial
          </div>
          <div class="cta-feature">
            <span class="feature-check">✓</span>
            Cancel anytime
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="container">
      <div class="footer-content">
        <div class="footer-brand">
          <div class="footer-logo">
            <div class="logo-mark">L</div>
            <div>
              <h3>LetiMail</h3>
              <p>Your Voice, AI Powered</p>
            </div>
          </div>
          <p class="footer-description">
            Experience the future of business communication - where technology enhances your authentic voice rather than replacing it.
          </p>
        </div>
        <div class="footer-links">
          <div class="footer-column">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#app-section">Get Started</a>
          </div>
          <div class="footer-column">
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Blog</a>
            <a href="#">Contact</a>
          </div>
          <div class="footer-column">
            <h4>Legal</h4>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Security</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2025 LetiMail. All rights reserved.</p>
        <div class="footer-social">
          <a href="#"><i class="fab fa-twitter"></i></a>
          <a href="#"><i class="fab fa-linkedin"></i></a>
          <a href="#"><i class="fab fa-github"></i></a>
        </div>
      </div>
    </div>
  </footer>

  <script src="Frontend/script.js"></script>
</body>
</html>
