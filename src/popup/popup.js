/**
/**
 * Main class for managing the LinkedIn to n8n extension popup
 * Handles user interactions and n8n webhook integration
 */
class LinkedInToN8nPopup {
    constructor() {
        this.isProcessingRequest = false;
        this.initializeEventListeners();
    }

    /**
     * Sets up all event listeners for popup interactions
     */
    initializeEventListeners() {
        // Send button event listener
        document.getElementById('n8n').addEventListener('click', () => this.sendProfileDataToN8n());
        
        // Settings icon event listener - open in new tab
        const settingsIcon = document.querySelector('.settings-icon');
        if (settingsIcon) {
            settingsIcon.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.tabs.create({
                    url: chrome.runtime.getURL('src/options/options.html')
                });
            });
        }
    }

    /**
     * Displays result message to user with success or error styling
     * @param {string} message - Message to display
     * @param {boolean} isSuccess - Whether this is a success or error message
     */
    showResultMessage(message, isSuccess = true) {
        const resultElement = document.getElementById('result');
        const resultTextElement = document.getElementById('resultText');
        const iconElement = resultElement.querySelector('i');
        
        resultElement.className = `result ${isSuccess ? 'success' : 'error'}`;
        iconElement.className = isSuccess ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        resultTextElement.textContent = message;
        resultElement.style.display = 'flex';
        
        // Auto-hide result message after 5 seconds
        setTimeout(() => {
            resultElement.style.display = 'none';
        }, 5000);
    }

    /**
     * Sets the loading state for the send button
     * @param {boolean} isLoading - Whether to show loading state
     */
    setLoadingState(isLoading) {
        this.isProcessingRequest = isLoading;
        const sendButton = document.getElementById('n8n');
        const normalTextElement = sendButton.querySelector('.normal-text');
        const loadingTextElement = sendButton.querySelector('.loading');
        
        if (isLoading) {
            normalTextElement.style.display = 'none';
            loadingTextElement.style.display = 'flex';
            sendButton.disabled = true;
        } else {
            normalTextElement.style.display = 'flex';
            loadingTextElement.style.display = 'none';
            sendButton.disabled = false;
        }
    }

    /**
     * Collects form data from popup inputs
     * @returns {Object} Form data object with notes
     */
    collectFormData() {
        const notesText = document.getElementById('notes').value || '';
        
        return {
            notes: notesText
        };
    }

    /**
     * Validates that current page is a LinkedIn profile page
     * @param {string} currentUrl - The current tab URL
     * @returns {Object} Validation result with isValid flag and message
     */
    validateLinkedInProfilePage(currentUrl) {
        // Check if we're on LinkedIn domain
        if (!currentUrl.includes('linkedin.com')) {
            return {
                isValid: false,
                message: 'Please navigate to a LinkedIn profile page'
            };
        }

        // Check for specific LinkedIn profile URL patterns
        const isLinkedInProfile = currentUrl.includes('/in/') || 
                                currentUrl.includes('/sales/lead/') || 
                                currentUrl.includes('/sales/people/');
        
        if (!isLinkedInProfile) {
            return {
                isValid: false,
                message: 'Please navigate to a LinkedIn profile page (not feed, search, or company page)'
            };
        }

        return { isValid: true };
    }

    /**
     * Sends message to content script and handles response
     * @param {Object} activeTab - The active browser tab
     * @param {string} action - Action to send to content script
     * @param {Object} formData - Form data to include in message
     * @returns {Promise} Promise resolving to content script response
     */
    async sendMessageToContentScript(activeTab, action, formData) {
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(activeTab.id, {
                action: action,
                formData: formData
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Sends profile data to n8n webhook via background script
     * Main function for processing and sending profile data
     */
    async sendProfileDataToN8n() {
        if (this.isProcessingRequest) return;
        
        try {
            this.setLoadingState(true);
            const formData = this.collectFormData();

            // Get current active tab
            const tabs = await new Promise((resolve) => {
                chrome.tabs.query({active: true, currentWindow: true}, resolve);
            });
            
            if (!tabs[0]) {
                this.showResultMessage('No active tab found', false);
                return;
            }

            const currentUrl = tabs[0].url;
            console.log('Current URL for n8n send:', currentUrl);

            // Validate LinkedIn profile page
            const validation = this.validateLinkedInProfilePage(currentUrl);
            if (!validation.isValid) {
                this.showResultMessage(validation.message, false);
                return;
            }

            console.log('Sending n8n request to content script...');

            // Send profile data to n8n via content script
            const response = await this.sendMessageToContentScript(tabs[0], "sendToN8n", formData);

            if (response && response.success) {
                this.showResultMessage(response.message || 'Successfully sent to n8n!', true);
                
                // Clear notes after successful send
                document.getElementById('notes').value = '';
            } else {
                this.showResultMessage(response?.message || 'Failed to send data to n8n', false);
            }
        } catch (error) {
            console.error('n8n send error:', error);
            if (error.message.includes('Could not establish connection')) {
                this.showResultMessage('Content script not loaded. Please refresh the LinkedIn page and try again.', false);
            } else {
                this.showResultMessage('Error sending data: ' + error.message, false);
            }
        } finally {
            this.setLoadingState(false);
        }
    }
}

// Initialize the popup application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LinkedInToN8nPopup();
});

// Global error handling for the extension
window.addEventListener('error', (event) => {
    console.error('Extension popup error:', event.error);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection in popup:', event.reason);
});
