# Privacy Policy for LinkedIn to n8n Chrome Extension

**Last Updated:** October 13, 2025

## Overview

LinkedIn to n8n ("the Extension") is a Chrome browser extension developed by Klikwork that allows users to extract LinkedIn profile data and send it directly to their own n8n webhook instance. We are committed to protecting your privacy and being transparent about how the Extension works.

## Developer Information

**Developer:** Klikwork  
**Contact:** marcel@klikwork.com  
**Extension Name:** LinkedIn to n8n

## Data Collection and Usage

### What Data We Collect

The Extension collects the following information from LinkedIn profiles **only when you explicitly click the "Send" button**:

- **Profile Information:**
  - Full name
  - Job title and headline
  - Current company
  - Work experience (company names, positions, dates)
  - Education history
  - Profile summary/about section
  - Optional notes you add in the extension popup

### How We Use Your Data

**Important:** We do not collect, store, or process any of your data on our servers.

When you use the Extension:

1. **Data is extracted** from the LinkedIn profile page you are viewing
2. **Data is sent directly** from your browser to your own n8n webhook URL
3. **No intermediate storage** occurs - data goes straight from your browser to your n8n instance
4. **We never see your data** - all processing happens client-side in your browser

### Your n8n Webhook URL

- Your n8n webhook URL is stored **locally in your browser** using Chrome's storage API
- This URL **never leaves your device** except when your browser uses it to send profile data
- We do not have access to your webhook URL
- You can delete this URL at any time through the extension settings

## Data We Do NOT Collect

The Extension does NOT collect, store, or transmit:

- Your browsing history
- Your LinkedIn login credentials
- Your personal messages or communications
- Your location data
- Your financial information
- Any data from websites other than LinkedIn profile pages
- Analytics or tracking data about your usage of the Extension

## Data Storage

- **Profile Data:** Not stored anywhere by the Extension - sent directly to your n8n instance
- **Webhook URL:** Stored locally in your browser only (chrome.storage.local)
- **Optional Notes:** Temporarily held in browser memory until sent, then cleared

## Data Sharing and Third Parties

We do **NOT**:
- Sell your data to third parties
- Share your data with third parties
- Use your data for advertising
- Track your activity across websites
- Store your data on our servers

The only "third party" that receives data is **your own n8n instance** that you configure.

## Data Security

- All data transmission occurs directly between your browser and your n8n instance
- The Extension uses HTTPS for all webhook communications
- Your webhook URL is stored securely using Chrome's built-in storage API
- No data passes through our servers or infrastructure

## Your Rights and Control

You have complete control over your data:

- **Access:** All data is visible to you before sending
- **Deletion:** Clear your webhook URL anytime through extension settings
- **Opt-out:** Simply don't click "Send" if you don't want to share profile data
- **Uninstall:** Removing the extension deletes all locally stored data

## Children's Privacy

The Extension is not intended for use by children under 13 years of age. We do not knowingly collect data from children.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify users of any material changes by:
- Updating the "Last Updated" date at the top of this policy
- Providing notice through the Chrome Web Store listing

## Compliance

This Extension complies with:
- Chrome Web Store Developer Program Policies
- GDPR (General Data Protection Regulation)
- CCPA (California Consumer Privacy Act)

## Permissions Explanation

The Extension requires the following Chrome permissions:

- **activeTab:** To read LinkedIn profile content when you click the extension button
- **scripting:** To inject code that extracts profile data from LinkedIn pages
- **storage:** To save your n8n webhook URL locally in your browser
- **host_permissions (linkedin.com):** To access LinkedIn profile pages and Sales Navigator

These permissions are used **only** for the stated purpose of extracting and sending profile data to your n8n instance.

## Contact Us

If you have questions about this Privacy Policy or the Extension's data practices, please contact:

**Email:** marcel@klikwork.com  
**GitHub:** https://github.com/Klikwork/linkedin2n8n

## Open Source

This Extension is open source. You can review the complete source code at:
https://github.com/Klikwork/linkedin2n8n

## Consent

By installing and using the LinkedIn to n8n Extension, you consent to this Privacy Policy.
