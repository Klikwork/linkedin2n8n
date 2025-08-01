/**
 * Options page functionality for LinkedIn2n8n Chrome extension
 * Handles webhook URL management, testing, and settings storage
 */
class OptionsManager {
  constructor() {
    this.initializeElements();
    this.loadSavedSettings();
    this.attachEventListeners();
  }

  /**
   * Initialize DOM element references
   */
  initializeElements() {
    this.webhookUrlInput = document.getElementById('webhookUrl');
    this.saveButton = document.getElementById('saveBtn');
    this.testButton = document.getElementById('testBtn');
    this.clearButton = document.getElementById('clearBtn');
    this.saveStatus = document.getElementById('saveStatus');
  }

  /**
   * Load saved settings from Chrome storage
   */
  async loadSavedSettings() {
    try {
      const result = await chrome.storage.local.get(['webhookUrl']);
      if (result.webhookUrl) {
        this.webhookUrlInput.value = result.webhookUrl;
      }
    } catch (error) {
      console.error('Error loading saved settings:', error);
    }
  }

  /**
   * Attach event listeners to interactive elements
   */
  attachEventListeners() {
    this.saveButton.addEventListener('click', () => this.saveSettings());
    this.testButton.addEventListener('click', () => this.testWebhook());
    this.clearButton.addEventListener('click', () => this.clearSettings());
    
    // Save on Enter key press in URL input
    this.webhookUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveSettings();
      }
    });
  }

  /**
   * Display status message with styling
   * @param {string} message - Message to display
   * @param {boolean} isSuccess - Whether this is a success or error message
   * @param {number} duration - How long to show the message (ms)
   */
  showStatus(message, isSuccess = true, duration = 3000) {
    this.saveStatus.textContent = message;
    this.saveStatus.className = isSuccess ? 'success' : 'error';
    this.saveStatus.style.opacity = '1';
    
    // Auto-hide after specified duration
    setTimeout(() => {
      this.saveStatus.style.opacity = '0';
    }, duration);
  }

  /**
   * Set loading state for a button
   * @param {HTMLElement} button - Button element
   * @param {boolean} isLoading - Whether to show loading state
   */
  setButtonLoading(button, isLoading) {
    if (isLoading) {
      button.classList.add('loading');
      button.disabled = true;
    } else {
      button.classList.remove('loading');
      button.disabled = false;
    }
  }

  /**
   * Validate webhook URL format
   * @param {string} url - URL to validate
   * @returns {Object} Validation result
   */
  validateWebhookUrl(url) {
    if (!url || url.trim() === '') {
      return { isValid: false, message: 'Please enter a webhook URL' };
    }

    try {
      const urlObj = new URL(url.trim());
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { isValid: false, message: 'URL must start with http:// or https://' };
      }
      return { isValid: true };
    } catch (error) {
      return { isValid: false, message: 'Please enter a valid URL' };
    }
  }

  /**
   * Save webhook URL to Chrome storage
   */
  async saveSettings() {
    const webhookUrl = this.webhookUrlInput.value.trim();
    
    // Validate URL
    const validation = this.validateWebhookUrl(webhookUrl);
    if (!validation.isValid) {
      this.showStatus(validation.message, false);
      return;
    }

    this.setButtonLoading(this.saveButton, true);

    try {
      await chrome.storage.local.set({ webhookUrl });
      this.showStatus('✅ Settings saved successfully!', true);
      console.log('Webhook URL saved:', webhookUrl);
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showStatus('❌ Failed to save settings: ' + error.message, false);
    } finally {
      this.setButtonLoading(this.saveButton, false);
    }
  }

  /**
   * Test webhook connectivity by sending test data
   */
  async testWebhook() {
    const webhookUrl = this.webhookUrlInput.value.trim();
    
    // Validate URL first
    const validation = this.validateWebhookUrl(webhookUrl);
    if (!validation.isValid) {
      this.showStatus(validation.message, false);
      return;
    }

    this.setButtonLoading(this.testButton, true);

    // Test data payload
    const testData = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'Test connection from LinkedIn2n8n extension',
      personName: 'Test User',
      company: 'Test Company',
      job: 'Test Position',
      notes: 'This is a test message to verify webhook connectivity',
      linkedinUrl: 'https://linkedin.com/in/test'
    };

    try {
      console.log('Testing webhook:', webhookUrl);
      console.log('Test data:', testData);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });

      if (response.ok) {
        this.showStatus(`✅ Test successful! (${response.status} ${response.statusText})`, true, 5000);
        console.log('Test successful:', response.status, response.statusText);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Test webhook error:', error);
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        this.showStatus('❌ Network error: Check your URL and internet connection', false, 5000);
      } else {
        this.showStatus(`❌ Test failed: ${error.message}`, false, 5000);
      }
    } finally {
      this.setButtonLoading(this.testButton, false);
    }
  }

  /**
   * Clear all saved settings
   */
  async clearSettings() {
    if (!confirm('Are you sure you want to clear all settings? This action cannot be undone.')) {
      return;
    }

    this.setButtonLoading(this.clearButton, true);

    try {
      await chrome.storage.local.clear();
      this.webhookUrlInput.value = '';
      this.showStatus('🗑️ All settings cleared', true);
      console.log('Settings cleared');
    } catch (error) {
      console.error('Error clearing settings:', error);
      this.showStatus('❌ Failed to clear settings: ' + error.message, false);
    } finally {
      this.setButtonLoading(this.clearButton, false);
    }
  }
}

// Initialize the options manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});

// Global error handling
window.addEventListener('error', (event) => {
  console.error('Options page error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
