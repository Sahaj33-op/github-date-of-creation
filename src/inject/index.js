/* global chrome, moment, DATE_FORMAT_KEY, URIS_KEY, DEFAULT_DATE_FORMAT */

// In-memory cache to prevent infinite loops and performance drops during mutations
let cachedFormattedDate = null;
let currentRepoURI = null;
let domObserver = null;

/**
 * Check whether the current page is a landpage or not
 */
function isLandPage() {
  let uri = window.location.pathname.substring(1);
  if (uri.endsWith('/')) {
    uri = uri.slice(0, -1);
  }
  return uri.split('/').length === 2;
}

/**
 * Check whether the gdc has been injected or not
 */
function hasInjected() {
  return document.getElementById('gdc') !== null;
}

/**
 * Get a complete uri in the format of https://api.github.com/repos/{:owner}/{:repository}
 */
function getRepositoryURI() {
  const API = 'https://api.github.com/repos';
  const uri = window.encodeURI(window.location.pathname.substring(1));
  const [owner, repository] = uri.split('/');
  return `${API}/${owner}/${repository}`;
}

/**
 * Get an URI from local storage
 */
function getURIFromStorage(uri) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [URIS_KEY]: {} }, (response) => {
      const uris = response[URIS_KEY];
      if (uris[uri]) resolve(uris[uri]);
      else resolve(null);
    });
  });
}

/**
 * Add a new URI to local storage 
 */
function addURIToStorage(uri, date) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [URIS_KEY]: {} }, (response) => {
      const uris = response[URIS_KEY];
      uris[uri] = date;
      chrome.storage.local.set({ [URIS_KEY]: uris }, () => {
        resolve();
      });
    });
  });
}

/**
 * Get a date from a given URI
 */
async function getDateOfCreation(uri) {
  try {
    const existingDate = await getURIFromStorage(uri);
    if (existingDate) return existingDate;

    const response = await fetch(uri);
    const data = await response.json();
    const date = data.created_at;
    await addURIToStorage(uri, date); 
    return date;
  } catch (e) {
    throw new Error(e);
  }
}

/**
 * Get date format
 */
function getDateFormat() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { [DATE_FORMAT_KEY]: DEFAULT_DATE_FORMAT },
      (response) => resolve(response[DATE_FORMAT_KEY])
    );
  });
}

/**
 * Format the given date using moment.js
 */
function formatDate(date, format) {
  return moment(date).format(format);
}

/**
 * Inject the given date into HTML
 */
function injectDateToHTML(date) {
  if (hasInjected()) return; // Failsafe to prevent double injection

  const h2Elems = Array.from(document.querySelectorAll('.BorderGrid-cell h2'));
  const aboutHeader = h2Elems.find((elem) => elem.textContent.trim() === 'About');
  
  if (!aboutHeader || !aboutHeader.parentElement) return;
  
  const aboutElementContainer = aboutHeader.parentElement;

  const dateHTML = `
    <div id="gdc" class="mt-3">
      <a class="muted-link" href="#">
        <svg height="16" class="octicon octicon-calendar mr-2" mr="2" viewBox="0 0 16 16" version="1.1" width="16" aria-hidden="true"><path fill-rule="evenodd" d="M13 2h-1v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H6v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H2c-.55 0-1 .45-1 1v11c0 .55.45 1 1 1h11c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1zm0 12H2V5h11v9zM5 3H4V1h1v2zm6 0h-1V1h1v2zM6 7H5V6h1v1zm2 0H7V6h1v1zm2 0H9V6h1v1zm2 0h-1V6h1v1zM4 9H3V8h1v1zm2 0H5V8h1v1zm2 0H7V8h1v1zm2 0H9V8h1v1zm2 0h-1V8h1v1zm-8 2H3v-1h1v1zm2 0H5v-1h1v1zm2 0H7v-1h1v1zm2 0H9v-1h1v1zm2 0h-1v-1h1v1zm-8 2H3v-1h1v1zm2 0H5v-1h1v1zm2 0H7v-1h1v1zm2 0H9v-1h1v1z"></path></svg>
        ${date}
      </a>  
    </div>
  `;

  aboutElementContainer.insertAdjacentHTML('beforeend', dateHTML);
}

/**
 * Handle navigation and fetch logic independently of injection
 */
async function processPage() {
  if (!isLandPage()) return;

  const uri = getRepositoryURI();
  
  // Only trigger expensive network/storage logic if the repository actually changed
  if (uri !== currentRepoURI) {
    currentRepoURI = uri;
    cachedFormattedDate = null; // Clear old cache immediately 
    
    const date = await getDateOfCreation(uri);
    const dateFormat = await getDateFormat();
    cachedFormattedDate = formatDate(date, dateFormat);
  }

  if (cachedFormattedDate) {
    injectDateToHTML(cachedFormattedDate);
  }
}

/**
 * Brute-force resilience against React DOM updates
 */
function startObserver() {
  if (domObserver) domObserver.disconnect();
  
  domObserver = new MutationObserver(() => {
    if (isLandPage() && !hasInjected() && cachedFormattedDate) {
      injectDateToHTML(cachedFormattedDate);
    }
  });

  // Watch the entire body. It's safe because our observer logic is incredibly lightweight.
  domObserver.observe(document.body, { childList: true, subtree: true });
}

// GitHub routing events
document.addEventListener('pjax:end', processPage, false); 
document.addEventListener('turbo:load', processPage, false); 

// Initial payload execution
processPage();
startObserver();