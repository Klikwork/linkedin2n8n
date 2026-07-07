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

## 🩺 Troubleshooting

- **"Could not read any profile data"** — as of v1.2.0 the extension auto-scrolls, retries, and falls back to sending the raw profile text (`profileText` field) when structured parsing fails. When that happens it also prints a `LinkedIn2n8n diagnostics` message in the DevTools console (F12 → Console on the profile page) — copy that into a bug report so the parser can be updated for your LinkedIn layout.
- **Nothing happens / connection errors** — reload the extension at `chrome://extensions/` after updating it (click the ↻ refresh icon on the extension card), then reload the LinkedIn tab.
- **Webhook errors (HTTP 404)** — in n8n, a *test* webhook URL only works for one call while the workflow editor is listening. Use the **production** webhook URL and make sure the workflow is **activated**.
- LinkedIn changes its page markup regularly. As of v1.1.0 the extension supports both the classic and the 2025+ profile layouts; if extraction breaks again, save the profile page HTML into `tests/data/<case>/input.html` and run `npm test` to debug.

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
