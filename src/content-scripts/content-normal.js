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

    // Extract about section
    let personBlurb = extractAboutText();

    // Extract structured data
    let experienceData = extractExperienceData();
    let educationData = extractEducationData();

    // The DOM offered no usable landmarks (anchor ids / entity markers) —
    // fall back to parsing the page's readable text line by line
    let textProfile = null;
    if (!experienceData.length) {
      console.warn('LinkedIn to n8n: DOM extraction found no experience, falling back to text parsing');
      textProfile = parseProfileFromMainText();
      if (textProfile.experience.length) experienceData = textProfile.experience;
      if (!educationData.length && textProfile.education.length) educationData = textProfile.education;
      if (!personBlurb && textProfile.about) personBlurb = textProfile.about;
    }

    // Extract basic profile information
    const nameElement = document.querySelector('main h1') || queryDeep('main h1') || queryDeep('h1');
    const personName = (nameElement ? nameElement.innerText.trim() : '') ||
                       (extractJsonLdPerson()?.name || '').trim() ||
                       extractNameFromTitle() ||
                       (textProfile ? textProfile.firstLine : '');

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
 * Queries across open shadow roots as well as the regular DOM, in case
 * LinkedIn renders parts of the page inside web components
 * @param {string} selector - CSS selector
 * @returns {Element|null} First match in document or any open shadow root
 */
function queryDeep(selector) {
  const direct = document.querySelector(selector);
  if (direct) return direct;

  const search = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const found = el.shadowRoot.querySelector(selector) || search(el.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  };
  return search(document);
}

/**
 * Extracts the person's name from the document title as a layout-independent
 * fallback. Titles look like "Jane Doe | LinkedIn" or "(3) Jane Doe | LinkedIn".
 * @returns {string} Name, or empty string
 */
function extractNameFromTitle() {
  const title = (document.title || '').replace(/^\(\d+\)\s*/, '');
  const name = title.split('|')[0].trim();
  return /linkedin/i.test(name) ? '' : name;
}

/**
 * Extracts schema.org Person data from JSON-LD script tags when present
 * @returns {Object|null} Person object, or null
 */
function extractJsonLdPerson() {
  try {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      const data = JSON.parse(script.textContent);
      const graph = data['@graph'] || [data];
      const person = graph.find(item => item && item['@type'] === 'Person');
      if (person) return person;
    }
  } catch (e) {
    console.warn('Error parsing JSON-LD:', e);
  }
  return null;
}

/**
 * Returns the readable text of the profile page as cleaned lines. LinkedIn
 * renders strings twice (aria-hidden + visually-hidden), so consecutive
 * duplicate lines are collapsed.
 * @returns {string[]} Trimmed, non-empty, deduplicated text lines
 */
function getMainTextLines() {
  const main = document.querySelector('main') || queryDeep('main') || document.body;
  const lines = [];
  for (const raw of (main.innerText || '').split('\n')) {
    const line = raw.replace(/[\u200b\u200e\u200f]/g, '').trim();
    if (!line) continue;
    if (line === lines[lines.length - 1]) continue;
    lines.push(line);
  }
  return lines;
}

/**
 * Last-resort extraction: the readable text of the profile page
 * @returns {string} Cleaned page text, capped at 15k characters
 */
function extractRawProfileText() {
  return getMainTextLines().join('\n').slice(0, 15000);
}

// Section heading names (English + Dutch) used to split the page text into
// sections when the DOM offers no usable landmarks
var TEXT_SECTION_HEADINGS = [
  'about', 'over', 'info',
  'activity', 'activiteit',
  'experience', 'ervaring',
  'education', 'opleiding', 'opleidingen',
  'licenses & certifications', 'licenties en certificaten',
  'skills', 'vaardigheden',
  'recommendations', 'aanbevelingen',
  'interests', 'interesses',
  'publications', 'publicaties',
  'projects', 'projecten',
  'volunteer experience', 'vrijwilligerservaring',
  'courses', 'cursussen',
  'honors & awards', 'prijzen en onderscheidingen',
  'languages', 'talen',
  'featured', 'uitgelicht',
  'sales insights', 'key signals',
  'more profiles for you', 'meer profielen voor jou',
  'people you may know', 'mensen die je mogelijk kent',
  'explore premium profiles'
];

// UI chrome that appears between data lines and must be ignored
var TEXT_NOISE_PATTERNS = [
  /^show all/i, /^toon alle/i,
  /^…\s*more$/i, /^…?\s*see more$/i, /^meer weergeven$/i,
  /^message$/i, /^bericht$/i, /^connect$/i, /^follow(ing)?$/i, /^volgen$/i,
  /^endorse$/i, /^onderschrijven$/i, /^view job$/i,
  /^visit my website$/i, /^contact info$/i, /^contactgegevens$/i,
  /^book an appointment$/i, /^view in recruiter$/i,
  /^[·•]\s*(1st|2nd|3rd\+?|1e|2e|3e\+?)$/i,
  /^\d+$/, /^[·•]$/
];

function isTextSectionHeading(line) {
  return TEXT_SECTION_HEADINGS.indexOf(line.toLowerCase()) !== -1;
}

function isTextNoiseLine(line) {
  return TEXT_NOISE_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Returns the cleaned lines of one named section of the page text
 * @param {string[]} lines - Full page text lines
 * @param {string[]} headingNames - Lowercase heading variants of the section
 * @returns {string[]} Lines between this heading and the next known heading
 */
function getTextSection(lines, headingNames) {
  const start = lines.findIndex(line => headingNames.indexOf(line.toLowerCase()) !== -1);
  if (start === -1) return [];

  const sectionLines = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (isTextSectionHeading(lines[i])) break;
    if (!isTextNoiseLine(lines[i])) sectionLines.push(lines[i]);
  }
  return sectionLines;
}

function looksLikeLocation(line) {
  return line.length <= 70 &&
         !looksLikeDateRange(line) &&
         (/,/.test(line) || /(remote|hybrid|on-site|area|netherlands|nederland)/i.test(line));
}

/**
 * Parses experience entries from section text lines. Entries follow the
 * pattern: title / "Company · EmploymentType" / date range / [location] /
 * [description...]. Date-range lines anchor the entry boundaries.
 * @param {string[]} sectionLines - Experience section lines
 * @returns {Array} Experience entries in the same shape as the DOM parser
 */
function parseExperienceFromLines(sectionLines) {
  const entries = [];
  const dateIndexes = [];
  sectionLines.forEach((line, i) => { if (looksLikeDateRange(line)) dateIndexes.push(i); });

  dateIndexes.forEach((d, k) => {
    const prevDate = k > 0 ? dateIndexes[k - 1] : -1;
    const nextStart = k + 1 < dateIndexes.length ?
      Math.max(dateIndexes[k + 1] - 2, d + 1) : sectionLines.length;

    const entry = {};
    const position = {};

    if (d - 2 > prevDate) {
      position.title = sectionLines[d - 2];
      const parts = sectionLines[d - 1].split('·').map(part => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        entry.company = parts[0];
        position.employmentType = parts[1];
      } else if (parts[0]) {
        entry.company = parts[0];
      }
    } else if (d - 1 > prevDate) {
      position.title = sectionLines[d - 1];
    }

    position.duration = sectionLines[d];

    const tail = sectionLines.slice(d + 1, nextStart);
    if (tail.length && looksLikeLocation(tail[0])) position.location = tail.shift();
    if (tail.length) position.description = tail.join('\n');

    if (position.title || entry.company) {
      entry.positions = [position];
      entries.push(entry);
    }
  });

  return entries;
}

/**
 * Parses education entries from section text lines. Entries follow the
 * pattern: university / subject / [date range].
 * @param {string[]} sectionLines - Education section lines
 * @returns {Array} Education entries in the same shape as the DOM parser
 */
function parseEducationFromLines(sectionLines) {
  const dateIndexes = [];
  sectionLines.forEach((line, i) => { if (looksLikeDateRange(line)) dateIndexes.push(i); });

  if (!dateIndexes.length) {
    if (sectionLines.length >= 1 && sectionLines.length <= 3) {
      const entry = { university: sectionLines[0] };
      if (sectionLines[1]) entry.subject = sectionLines[1];
      return [entry];
    }
    return [];
  }

  const entries = [];
  dateIndexes.forEach((d, k) => {
    const prevDate = k > 0 ? dateIndexes[k - 1] : -1;
    const entry = {};
    if (d - 2 > prevDate) {
      entry.university = sectionLines[d - 2];
      entry.subject = sectionLines[d - 1];
    } else if (d - 1 > prevDate) {
      entry.university = sectionLines[d - 1];
    }
    if (entry.university) entries.push(entry);
  });
  return entries;
}

/**
 * Layout-independent extraction from the page's readable text. Used when the
 * DOM offers none of the landmarks the structured parser needs.
 * @returns {Object} { experience, education, about, firstLine }
 */
function parseProfileFromMainText() {
  const lines = getMainTextLines();
  return {
    experience: parseExperienceFromLines(getTextSection(lines, ['experience', 'ervaring'])),
    education: parseEducationFromLines(getTextSection(lines, ['education', 'opleiding', 'opleidingen'])),
    about: getTextSection(lines, ['about', 'over', 'info']).join('\n'),
    firstLine: lines[0] || ''
  };
}

/**
 * Builds a compact description of the page structure for bug reports when
 * extraction fails. Contains no profile text — only tag/attribute statistics.
 * @returns {Object} Diagnostics object
 */
function buildDomDiagnostics() {
  const anchorState = {};
  ['about', 'experience', 'education'].forEach(id => {
    anchorState[id] = document.getElementById(id) ? 'present' :
      (queryDeep('[id="' + id + '"]') ? 'in-shadow-dom' : 'missing');
  });

  const dataViewNames = {};
  document.querySelectorAll('[data-view-name]').forEach(el => {
    const value = el.getAttribute('data-view-name');
    dataViewNames[value] = (dataViewNames[value] || 0) + 1;
  });

  let shadowHosts = 0;
  document.querySelectorAll('*').forEach(el => { if (el.shadowRoot) shadowHosts++; });

  return {
    extensionVersion: chrome.runtime?.getManifest?.().version,
    url: window.location.href,
    h1Count: document.querySelectorAll('h1').length,
    mainPresent: !!document.querySelector('main'),
    sectionCount: document.querySelectorAll('section').length,
    shadowHosts,
    anchors: anchorState,
    dataViewNames
  };
}

/**
 * Scrolls through the page once to force LinkedIn to render lazy sections,
 * then restores the scroll position
 */
async function autoScrollPage() {
  const originalScrollY = window.scrollY;
  const height = Math.max(document.body.scrollHeight, 3000);
  for (let y = 0; y <= height; y += Math.ceil(height / 4)) {
    window.scrollTo(0, y);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  window.scrollTo(0, originalScrollY);
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

        // Structured extraction failed → scroll through the page to force
        // lazy rendering and try once more
        if (profileData.experience.length === 0) {
          console.warn('LinkedIn2n8n: no experience entries found, auto-scrolling and retrying...');
          await autoScrollPage();
          profileData = extractCompleteProfileData(request);
        }

        // Still nothing structured → fall back to raw page text so the n8n
        // workflow keeps receiving data, and log diagnostics for a bug report
        if (profileData.experience.length === 0) {
          const diagnostics = buildDomDiagnostics();
          console.warn('LinkedIn2n8n diagnostics (copy this into a bug report):', JSON.stringify(diagnostics, null, 2));

          profileData.profileText = extractRawProfileText();

          const jsonLdPerson = extractJsonLdPerson();
          if (jsonLdPerson) {
            if (!profileData.job && jsonLdPerson.jobTitle) {
              profileData.job = Array.isArray(jsonLdPerson.jobTitle) ? jsonLdPerson.jobTitle[0] : jsonLdPerson.jobTitle;
            }
            const worksFor = jsonLdPerson.worksFor;
            const worksForName = Array.isArray(worksFor) ? worksFor[0]?.name : worksFor?.name;
            if (!profileData.company && worksForName) {
              profileData.company = worksForName;
            }
            if (!profileData.personBlurb && jsonLdPerson.description) {
              profileData.personBlurb = jsonLdPerson.description;
            }
          }

          if (!profileData.personName && !profileData.profileText) {
            sendResponse({
              success: false,
              message: 'Could not read any profile data from this page. Press F12, open the Console tab, and copy the "LinkedIn2n8n diagnostics" message into a bug report so this can be fixed.'
            });
            return;
          }
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
              response.message = (response.message || 'Sent') +
                (profileData.profileText
                  ? ' — structured parsing failed, sent raw profile text instead (see DevTools console for diagnostics).'
                  : ' — note: the experience section could not be read on this page.');
            }
            sendResponse(response);
          }
        });
      })();

      return true; // Keep message channel open for async response
    }
  });
}
