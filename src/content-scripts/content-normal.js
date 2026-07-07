// Content script for extracting profile data from normal LinkedIn profile pages
// This script handles data extraction from standard LinkedIn profiles (linkedin.com/in/*)
//
// LinkedIn regularly changes its profile markup. Instead of relying on utility
// classes (.t-bold, .t-14, ...) and exact sibling positions, this script:
//   1. Locates section cards via their locale-independent anchor ids
//      (#about, #experience, #education) and walks up to the enclosing card.
//   2. Finds entries via data-view-name="profile-component-entity" (2025+ layout)
//      with a fallback to the legacy ul > li list structure.
//   3. Reads text from span[aria-hidden="true"] elements (LinkedIn renders every
//      visible string twice: once aria-hidden, once .visually-hidden) and maps
//      the resulting lines to fields, instead of depending on class names.
console.log('LinkedIn to n8n: Normal LinkedIn content script loaded on:', window.location.href);

var PROFILE_ENTITY_SELECTOR = 'div[data-view-name="profile-component-entity"]';

/**
 * Finds the section card that contains the given anchor id (e.g. "experience").
 * Anchor ids are stable across LinkedIn redesigns and UI languages.
 * @param {string} anchorId - Section anchor id: "about", "experience", "education"
 * @returns {Element|null} The section card element, or null if not on the page
 */
function findSectionCard(anchorId) {
  const anchor = document.getElementById(anchorId);
  if (!anchor) return null;
  // Modern and legacy layouts both place the anchor inside the section card
  const card = anchor.closest('section');
  if (card) return card;
  // Legacy fallback: anchor div followed by heading and content siblings
  return anchor.nextElementSibling?.nextElementSibling || null;
}

/**
 * Filters a list of nodes down to the ones not contained in another node of the list
 * @param {Element[]} nodes - Candidate nodes
 * @returns {Element[]} Top-level nodes only
 */
function topLevelNodesOnly(nodes) {
  return nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
}

/**
 * Returns the entry nodes (one per experience/education item) of a section card
 * @param {Element} sectionCard - The section card element
 * @returns {Element[]} Entry nodes
 */
function getEntryNodes(sectionCard) {
  if (!sectionCard) return [];

  // 2025+ layout: entries are marked with data-view-name="profile-component-entity"
  const entities = topLevelNodesOnly([...sectionCard.querySelectorAll(PROFILE_ENTITY_SELECTOR)]);
  if (entities.length) return entities;

  // Legacy layout: entries are the items of the first list in the section
  const list = sectionCard.querySelector('ul');
  if (!list) return [];
  return [...list.querySelectorAll(':scope > li')].filter(li => li.innerText && li.innerText.trim());
}

/**
 * Collects the visible text lines of an entry in visual order.
 * Only reads span[aria-hidden="true"] elements, skipping the .visually-hidden
 * duplicates LinkedIn renders for screen readers, nested lists (sub-components)
 * and any explicitly excluded nodes (e.g. nested role entities).
 * @param {Element} root - Entry node to read
 * @param {Element[]} [excludedNodes] - Nodes whose text must not be included
 * @returns {string[]} Trimmed, non-empty text lines
 */
function collectVisibleLines(root, excludedNodes) {
  const excluded = excludedNodes || [];
  const lines = [];

  (function walk(element) {
    for (const child of element.children) {
      if (excluded.indexOf(child) !== -1) continue;
      if (child.tagName === 'UL') continue; // sub-components (descriptions, skills, nested roles)
      if (child.classList && child.classList.contains('visually-hidden')) continue;

      if (child.tagName === 'SPAN' && child.getAttribute('aria-hidden') === 'true') {
        child.innerText.split('\n').forEach(part => {
          const text = part.trim();
          if (text) lines.push(text);
        });
        continue;
      }
      walk(child);
    }
  })(root);

  return lines;
}

/**
 * Heuristic to recognize date-range/duration lines like
 * "Jan 2020 - Present · 6 yrs" or "3 jr 2 mnd" (works for common UI languages)
 * @param {string} text - Line to test
 * @returns {boolean} Whether the line looks like a date range or duration
 */
function looksLikeDateRange(text) {
  if (!text) return false;
  return (/\d{4}/.test(text) && /[-–—·]|present|heden|today|aujourd/i.test(text)) ||
         /^\d+\s*(yrs?|mos?|jaar|jr|mnd|maand)/i.test(text);
}

/**
 * Extracts the free-text description of an entry or role
 * @param {Element} node - Entry or role node
 * @returns {string} Description text, or empty string
 */
function extractDescription(node) {
  const descriptionElement = node.querySelector('.inline-show-more-text--is-collapsed') ||
                             node.querySelector('.inline-show-more-text');
  if (descriptionElement) {
    const span = descriptionElement.querySelector('span[aria-hidden="true"]');
    return (span ? span.innerText : descriptionElement.innerText).trim();
  }

  // Class-agnostic fallback: longest text block inside the entry's sub-list
  let best = '';
  node.querySelectorAll('ul span[aria-hidden="true"]').forEach(span => {
    const text = span.innerText.trim();
    if (/^(skills|vaardigheden|compétences)/i.test(text)) return;
    if (text.length > best.length) best = text;
  });
  return best.length >= 40 ? best : '';
}

/**
 * Finds nested role/program nodes inside an entry (multi-role experience at one
 * company, or multiple programs at one school)
 * @param {Element} node - Entry node
 * @returns {Element[]} Role nodes, or empty array if this is a single-role entry
 */
function getNestedRoleNodes(node) {
  let nested = topLevelNodesOnly([...node.querySelectorAll(PROFILE_ENTITY_SELECTOR)]);

  if (!nested.length) {
    // Legacy layout: roles are list items with a bold title
    const subList = node.querySelector('ul');
    if (subList) {
      nested = [...subList.querySelectorAll(':scope > li')].filter(li => li.querySelector('.t-bold span'));
    }
  }

  // Real grouped roles always carry a date line; this filters out media cards
  // and other sub-components that happen to be rendered as entities
  nested = nested.filter(roleNode => {
    const lines = collectVisibleLines(roleNode);
    return lines.length && lines.some(looksLikeDateRange);
  });

  // LinkedIn only groups entries when there are at least two roles
  return nested.length >= 2 ? nested : [];
}

/**
 * Parses a single role experience entry (one position at one company)
 * @param {Element} node - Entry node
 * @returns {Object|null} Experience object with company and single position
 */
function parseSingleRoleExperience(node) {
  const lines = collectVisibleLines(node);
  if (!lines.length) return null;

  const experienceEntry = {};
  const position = {};
  position.title = lines[0];

  let index = 1;
  // Company line: "Acme Corp · Full-time" or just "Acme Corp"
  if (lines[index] && !looksLikeDateRange(lines[index])) {
    const parts = lines[index].split('·').map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      experienceEntry.company = parts[0];
      position.employmentType = parts[1];
    } else if (parts.length === 1 && parts[0] !== position.title) {
      experienceEntry.company = parts[0];
    }
    index++;
  }

  if (lines[index] && looksLikeDateRange(lines[index])) {
    position.duration = lines[index];
    index++;
  }

  if (lines[index] && lines[index].length <= 80) {
    position.location = lines[index];
  }

  const description = extractDescription(node);
  if (description) position.description = description;

  experienceEntry.positions = [position];
  return experienceEntry;
}

/**
 * Parses a multi-role experience entry (multiple positions at the same company)
 * @param {Element} node - Entry node
 * @param {Element[]} roleNodes - Nested role nodes
 * @returns {Object|null} Experience object with company and multiple positions
 */
function parseMultiRoleExperience(node, roleNodes) {
  const experienceEntry = {};

  const headerLines = collectVisibleLines(node, roleNodes);
  if (headerLines[0]) experienceEntry.company = headerLines[0];
  if (headerLines[1]) experienceEntry.totalDuration = headerLines[1];

  experienceEntry.positions = [];
  roleNodes.forEach(roleNode => {
    const lines = collectVisibleLines(roleNode);
    if (!lines.length) return;

    const position = { title: lines[0] };
    const durationLine = lines.slice(1).find(looksLikeDateRange);
    if (durationLine) position.duration = durationLine;

    const description = extractDescription(roleNode);
    if (description) position.description = description;

    experienceEntry.positions.push(position);
  });

  return experienceEntry.positions.length ? experienceEntry : null;
}

/**
 * Extracts work experience data from LinkedIn profile experience section
 * Handles both single-role and multi-role company experiences
 * @returns {Array} Array of experience objects with company and positions data
 */
function extractExperienceData() {
  try {
    const sectionCard = findSectionCard('experience');
    if (!sectionCard) return [];

    const experienceData = [];
    getEntryNodes(sectionCard).forEach(entryNode => {
      try {
        const roleNodes = getNestedRoleNodes(entryNode);
        const parsedExperience = roleNodes.length ?
          parseMultiRoleExperience(entryNode, roleNodes) :
          parseSingleRoleExperience(entryNode);

        if (parsedExperience) experienceData.push(parsedExperience);
      } catch (e) {
        console.warn('Error parsing individual experience entry:', e);
      }
    });

    console.log('Extracted Experience Data:', experienceData);
    return experienceData;
  } catch (e) {
    console.error('Fatal error extracting experience data:', e);
    return [];
  }
}

/**
 * Extracts education data from LinkedIn profile education section
 * Handles both simple and complex education entries (with multiple degrees/programs)
 * @returns {Array} Array of education objects with university and program data
 */
function extractEducationData() {
  try {
    const sectionCard = findSectionCard('education');
    if (!sectionCard) return [];

    const educationData = [];
    getEntryNodes(sectionCard).forEach(entryNode => {
      try {
        const programNodes = getNestedRoleNodes(entryNode);

        if (programNodes.length) {
          // Complex entry: multiple programs/degrees at the same institution
          const entry = {};
          const headerLines = collectVisibleLines(entryNode, programNodes);
          if (headerLines[0]) entry.university = headerLines[0];
          if (headerLines[1] && !looksLikeDateRange(headerLines[1])) entry.subject = headerLines[1];

          entry.positions = [];
          programNodes.forEach(programNode => {
            const lines = collectVisibleLines(programNode);
            if (!lines.length) return;
            const program = { title: lines[0] };
            const durationLine = lines.slice(1).find(looksLikeDateRange);
            if (durationLine) program.duration = durationLine;
            entry.positions.push(program);
          });

          educationData.push(entry);
        } else {
          const lines = collectVisibleLines(entryNode);
          if (!lines.length) return;
          const entry = { university: lines[0] };
          if (lines[1] && !looksLikeDateRange(lines[1])) entry.subject = lines[1];
          educationData.push(entry);
        }
      } catch (e) {
        console.warn('Error parsing education entry:', e);
      }
    });

    return educationData;
  } catch (error) {
    console.error('Error extracting education data:', error);
    return [];
  }
}

/**
 * Extracts the "About" section text
 * @returns {string} About text, or empty string
 */
function extractAboutText() {
  try {
    const sectionCard = findSectionCard('about');
    if (!sectionCard) return '';

    const contentRoot = sectionCard.querySelector('.inline-show-more-text') || sectionCard;

    // The blurb is the longest visible text block in the card (skips the
    // section heading and "see more" affordances)
    let best = '';
    contentRoot.querySelectorAll('span[aria-hidden="true"]').forEach(span => {
      const text = span.innerText.trim();
      if (text.length > best.length) best = text;
    });
    if (best) return best;

    return sectionCard.innerText?.trim() || '';
  } catch (e) {
    console.warn('Error extracting about section:', e);
    return '';
  }
}

/**
 * Extracts complete profile data from normal LinkedIn profile page
 * Combines personal info, experience, and education data
 * @param {Object} request - Request object containing form data from popup
 * @returns {Object} Complete profile data object ready for n8n
 */
function extractCompleteProfileData(request){
  try {
    console.log("Extracting complete profile data from normal LinkedIn page");

    // Extract basic profile information
    const nameElement = document.querySelector('main h1') || document.querySelector('h1');
    const personName = nameElement ? nameElement.innerText.trim() : '';

    // Extract about section
    const personBlurb = extractAboutText();

    // Extract structured data
    const experienceData = extractExperienceData();
    const educationData = extractEducationData();

    console.log('Extracted experience data:', experienceData);
    console.log('Extracted education data:', educationData);

    // Extract current job info from first experience entry
    const currentExperience = experienceData[0] || {};
    const currentCompany = currentExperience.company || '';
    const currentJobTitle = (currentExperience.positions && currentExperience.positions[0] && currentExperience.positions[0].title) || '';

    // Build complete profile data object
    const profileData = {
      notes: request.formData.notes,
      personBlurb,
      personName,
      email: '', // Email not available on normal LinkedIn profiles
      experience: experienceData,
      education: educationData,
      company: currentCompany,
      job: currentJobTitle,
      linkedinUrl: window.location.href,
    };

    return profileData;
  } catch (error) {
    console.error('Error in extractCompleteProfileData:', error);
    throw error;
  }
}

/**
 * LinkedIn lazy-renders below-the-fold section content. If a section card is
 * present but has no entries yet, scroll it into view and wait for the
 * entries to render before extracting.
 * @param {number} [timeoutMs] - Max wait per section
 */
async function waitForLazySections(timeoutMs) {
  const timeout = timeoutMs || 2000;
  const originalScrollY = window.scrollY;
  let scrolled = false;

  for (const anchorId of ['experience', 'education']) {
    let sectionCard = findSectionCard(anchorId);
    if (!sectionCard || getEntryNodes(sectionCard).length) continue;

    document.getElementById(anchorId)?.scrollIntoView({ block: 'center' });
    scrolled = true;

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 200));
      sectionCard = findSectionCard(anchorId);
      if (sectionCard && getEntryNodes(sectionCard).length) break;
    }
  }

  if (scrolled) window.scrollTo(0, originalScrollY);
}

/**
 * Main message listener for handling requests from popup
 * Processes profile data extraction and n8n webhook requests
 * Guarded so on-demand injection from the popup never registers it twice
 */
if (!window.__linkedin2n8nNormalLoaded) {
  window.__linkedin2n8nNormalLoaded = true;

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Normal content script received message:', request.action, 'on URL:', window.location.href);

    // Liveness check used by the popup before falling back to on-demand injection
    if (request.action === "ping") {
      sendResponse({ pong: true });
      return;
    }

    // Handle n8n webhook send requests
    if (request.action === "sendToN8n") {
      (async () => {
        let profileData;

        try {
          await waitForLazySections();
          profileData = extractCompleteProfileData(request);
          console.log('Profile data prepared for n8n webhook:', profileData);
        } catch (error) {
          console.error('Error extracting profile data for n8n:', error);
          sendResponse({ success: false, message: 'Profile data extraction failed: ' + error.message });
          return;
        }

        if (!profileData.personName && profileData.experience.length === 0) {
          sendResponse({
            success: false,
            message: 'Could not read any profile data from this page. Scroll through the profile so all sections load, then try again. If it keeps failing, LinkedIn may have changed its layout — please report it.'
          });
          return;
        }

        console.log("Forwarding profile data to background script for n8n webhook processing");

        // Forward data to background script for webhook handling
        chrome.runtime.sendMessage({
          action: "sendToN8n",
          profileData: profileData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error communicating with background script:', chrome.runtime.lastError);
            sendResponse({
              success: false,
              message: 'Failed to communicate with background script: ' + chrome.runtime.lastError.message
            });
          } else {
            console.log('Background script response:', response);
            if (response && response.success && profileData.experience.length === 0) {
              response.message = (response.message || 'Sent') + ' — note: the experience section could not be read on this page.';
            }
            sendResponse(response);
          }
        });
      })();

      return true; // Keep message channel open for async response
    }
  });
}
