console.log('LinkedIn to n8n: Background service worker loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendToN8n") {
    processN8nWebhookRequest(request.profileData, sendResponse);
    return true;
  }
});

async function processN8nWebhookRequest(profileData, sendResponse) {
  try {
    console.log('Processing profile data:', profileData);

    const { webhookUrl } = await chrome.storage.local.get('webhookUrl');

    if (!webhookUrl) {
      sendResponse({
        success: false,
        message: 'No webhook URL set. Please go to settings and enter your webhook URL.'
      });
      return;
    }

    if (profileData.list === "Test") {
      sendResponse({
        success: true,
        message: 'Test mode: skipping webhook call'
      });
      return;
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });

    if (webhookResponse.ok) {
      sendResponse({ success: true, message: 'Profile data sent successfully' });
    } else {
      sendResponse({ success: false, message: `Webhook failed (HTTP ${webhookResponse.status})` });
    }
  } catch (error) {
    sendResponse({
      success: false,
      message: 'Network error: ' + error.message
    });
  }
}
