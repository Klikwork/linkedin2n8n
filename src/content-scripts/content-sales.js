// Content script for extracting profile data from LinkedIn Sales Navigator pages
console.log('LinkedIn2n8n: Sales Navigator content script loaded on:', window.location.href);

function extractSalesNavigatorProfileData(request) {
  const profileData = {
    list: request.formData.list,
    rating: request.formData.stars,
    notes: request.formData.notes,
    personName: '',
    job: '',
    company: '',
    email: '',
    personBlurb: '',
    linkedinUrl: window.location.href,
    experience: [],
    education: []
  };

  try {
    console.log("Extracting Sales Navigator profile data");

    profileData.personName = document.querySelector('[data-anonymize="person-name"]')?.textContent.trim() || '';
    profileData.job = document.querySelector('[data-anonymize="job-title"]')?.textContent.trim() || '';
    profileData.company = document.querySelector('[data-anonymize="company-name"]')?.textContent.trim() || '';
    profileData.email = document.querySelector('[data-anonymize="email"]')?.textContent.trim() || '';
    profileData.personBlurb = document.querySelector('[data-anonymize="person-blurb"]')?.textContent.trim() || '';

    profileData.experience = extractSalesNavigatorExperienceData();
    profileData.education = extractSalesNavigatorEducationData();

    console.log('✅ Profile data:', profileData);
    return profileData;
  } catch (error) {
    console.error('❌ Error extracting profile:', error);
    throw error;
  }
}

function extractSalesNavigatorExperienceData() {
  const experienceData = [];

  try {
    const experienceEntries = document.querySelectorAll('._experience-entry_1irc72');

    experienceEntries.forEach(entry => {
      const company = entry.querySelector('[data-anonymize="company-name"]')?.innerText.trim() || '';
      const jobTitles = entry.querySelectorAll('[data-anonymize="job-title"]');
      const durations = entry.querySelectorAll('.duration');

      const positions = [];
      jobTitles.forEach((titleEl, i) => {
        const title = titleEl?.innerText.trim() || '';
        const duration = durations[i]?.innerText.trim() || '';
        if (title || duration) positions.push({ title, duration });
      });

      if (company || positions.length) {
        experienceData.push({ company, positions });
      }
    });

    return experienceData;
  } catch (error) {
    console.error('Error extracting experience:', error);
    return [];
  }
}

function extractSalesNavigatorEducationData() {
  const educationData = [];

  try {
    const schoolEls = document.querySelectorAll('h3[data-anonymize="education-name"]');

    schoolEls.forEach(schoolEl => {
      const entry = schoolEl.closest('li');
      if (!entry) return;

      let degree = '';
      let field = '';
      entry.querySelectorAll('p h4').forEach(h4 => {
        const text = h4.textContent;
        const sibling = h4.nextElementSibling;
        if (text.includes('Degree name') && sibling) degree = sibling.textContent.trim();
        if (text.includes('Field of study') && sibling) field = sibling.textContent.trim();
      });

      const dates = entry.querySelector('p._bodyText_1e5nen._default_1i6ulk._sizeXSmall_1e5nen._lowEmphasis_1i6ulk > span + span')?.textContent.trim() || '';
      const university = schoolEl?.textContent.trim() || '';

      if (university || degree || field || dates) {
        educationData.push({ university, subject: degree, fieldOfStudy: field, dates });
      }
    });

    return educationData;
  } catch (error) {
    console.error('Error extracting education:', error);
    return [];
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Sales script received:', request.action);

  if (request.action === "getProfileData") {
    try {
      const data = extractSalesNavigatorProfileData(request);
      sendResponse({ success: true, data });
    } catch (err) {
      sendResponse({ success: false, message: err.message });
    }
    return true;
  }

  if (request.action === "sendToN8n") {
    let profileData;

    try {
      profileData = extractSalesNavigatorProfileData(request);
      console.log('Sending profile to background:', profileData);
    } catch (error) {
      sendResponse({ success: false, message: 'Failed to extract profile data: ' + error.message });
      return true;
    }

    chrome.runtime.sendMessage({ action: "sendToN8n", profileData }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Background error:', chrome.runtime.lastError.message);
        sendResponse({ success: false, message: chrome.runtime.lastError.message });
      } else {
        sendResponse(response);
      }
    });

    return true;
  }
});
