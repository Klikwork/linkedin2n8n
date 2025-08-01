# 🚀 LinkedIn2n8n - Chrome Extension

A powerful Chrome extension that extracts LinkedIn profile data and sends it to your own n8n webhook. Perfect for sales, recruitment, and business development workflows.

---

## ✨ Features

### 🎯 Smart Profile Extraction
- **Works on both LinkedIn & Sales Navigator**
- Extracts: name, job title, company, experience, education, summary
- Automatically detects complex multi-role experience structures

---

## 🛠️ Installation (Development mode)

1. **Download the Extension**
   - Download the repo as ZIP and extract it locally.

2. **Open Chrome Extensions**
   - Go to `chrome://extensions/`
   - Enable “Developer mode” (toggle in top right)

3. **Load the Unpacked Extension**
   - Click “Load unpacked”
   - Select the extracted extension folder
   - The LinkedIn2n8n icon will appear in your toolbar

---

## ⚙️ Configuration

1. **Click the Extension icon → Settings (or right-click → Options)**
2. **Paste your n8n Webhook URL**
   - Example: `https://your-n8n-instance.com/webhook/linkedin2n8n`
3. (Optional) Click "Save" and “Send Test” to check connectivity
4. Done!

No need to modify files or environment variables.

---

## 🚀 How to Use

1. Go to any LinkedIn profile (`linkedin.com/in/...` or `linkedin.com/sales/...`)
2. Click the extension icon
3. Add optional notes
4. Click “Send”

The profile data will be posted to your n8n webhook in JSON format.

---

## 🔒 Privacy

- Your webhook URL is stored locally in Chrome, never sent to third parties
- No data is saved by the extension itself
- Everything runs 100% in your browser

---

## 🙋‍♂️ Contributing

Want to contribute or improve it?  
Email: **[marcel@klikwork.com](mailto:marcel@klikwork.com)**

---

## 📄 License

MIT License – see [LICENSE](LICENSE)

---

**Made with ❤️ for better n8n workflows**
