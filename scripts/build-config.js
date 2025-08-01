// Background service worker for LinkedIn2n8n
// Listens for profile data and forwards it to the saved n8n webhook

console.log('LinkedIn2n8n: background worker loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received:', request.action);

  if (request.action === "sendToN8n") {
    handleN8nWebhook(request.profileData, sendResponse);
    return true; // Keep message channel open for async response
  }
});

/**
 * Retrieves webhook from local storage and sends data
 * @param {Object} profileData - Data extracted from LinkedIn
 * @param {Function} sendResponse - Callback to content script
 */
function handleN8nWebhook(profileData, sendResponse) {
  chrome.storage.local.get(['webhookUrl'], async (result) => {
    const webhookUrl = result.webhookUrl;

    if (!webhookUrl || webhookUrl === "YOUR_N8N_WEBHOOK_URL") {
      console.error('No valid webhook URL found');
      sendResponse({
        success: false,
        message: 'Webhook URL is not configured. Set it via the extension settings.'
      });
      return;
    }

    // Optional: skip sending in test mode
    if (profileData.list === "Test") {
      console.log('Test mode: data processed but not sent');
      sendResponse({
        success: true,
        message: 'Test mode: Data processed without sending to n8n'
      });
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        body: JSON.stringify(profileData),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        sendResponse({
          success: true,
          message: 'Profile data successfully sent to n8n'
        });
      } else {
        console.error('Webhook failed:', response.status);
        sendResponse({
          success: false,
          message: `Webhook failed (HTTP ${response.status})`
        });
      }
    } catch (err) {
      console.error('Fetch error:', err);
      sendResponse({
        success: false,
        message: 'Network error sending to webhook: ' + err.message
      });
    }
  });
}
