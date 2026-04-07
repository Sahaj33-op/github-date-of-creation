/* global chrome, DATE_FORMAT_KEY, URIS_KEY, DEFAULT_DATE_FORMAT, PAT_KEY, SETTINGS_KEY, DEFAULT_SETTINGS */

// In-memory cache to prevent infinite loops and performance drops during mutations
const cache = {
  data: {}, // { repoKey: { created_at, pushed_at } }
  formatted: {}, // { repoKey: string }
};
let currentRepoURI = null;
let domObserver = null;
const DEBUG = false; // Set to true for development

if (DEBUG) console.log('[GDC] Extension Script: Heartbeat OK');

/**
 * Utility: Relative time calculation
 */
function getRelativeTime(dateString) {
  if (!dateString) return 'unknown';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'unknown';
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  const diffInDays = Math.floor(diffInSeconds / 86400);

  if (diffInDays < 1) return 'today';
  if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
}

/**
 * Utility: Absolute time formatting
 */
/**
 * Utility: Absolute time formatting (Manual Token Replacement)
 */
function formatAbsoluteDate(dateString, format) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const map = {
    'YYYY': date.getFullYear(),
    'YY': String(date.getFullYear()).slice(-2),
    'MMMM': date.toLocaleDateString('en-US', { month: 'long' }),
    'MMM': date.toLocaleDateString('en-US', { month: 'short' }),
    'MM': String(date.getMonth() + 1).padStart(2, '0'),
    'M': date.getMonth() + 1,
    'DD': String(date.getDate()).padStart(2, '0'),
    'D': date.getDate()
  };

  // Replace tokens case-insensitively using the map
  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/gi, (matched) => {
    const key = matched.toUpperCase();
    return map[key] !== undefined ? map[key] : matched;
  });
}

/**
 * Get data from storage
 */
function getFromStorage(key, defaultValue = {}) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ [key]: defaultValue }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[GDC] Context invalidated, please refresh page.');
          return resolve(defaultValue);
        }
        resolve(response[key]);
      });
    } catch (e) {
      resolve(defaultValue);
    }
  });
}

/**
 * Get sync storage data
 */
function getFromSyncStorage(key, defaultValue) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get({ [key]: defaultValue }, (response) => {
        if (chrome.runtime.lastError) return resolve(defaultValue);
        resolve(response[key]);
      });
    } catch (e) {
      resolve(defaultValue);
    }
  });
}

/**
 * Fetch repo data (created_at, pushed_at)
 */
async function fetchRepoData(owner, repo) {
  const apiUri = `https://api.github.com/repos/${owner}/${repo}`;
  const cacheKey = `${owner}/${repo}`;
  
  const storedUris = await getFromStorage(URIS_KEY, {});
  const cachedEntry = storedUris[cacheKey];

  // Migration: If entry exists but it's just a string (old format), we need to re-fetch
  if (cachedEntry && typeof cachedEntry === 'object' && cachedEntry.created_at) {
    return cachedEntry;
  }

  const pat = await getFromSyncStorage(PAT_KEY, null);
  const headers = {};
  if (pat) {
    headers['Authorization'] = `token ${pat}`;
  }

  try {
    const response = await fetch(apiUri, { headers });
    if (!response.ok) {
      if (response.status === 403) throw new Error('RATE_LIMIT_EXCEEDED');
      throw new Error('API_ERROR');
    }
    const data = await response.json();
    const result = {
      created_at: data.created_at,
      pushed_at: data.pushed_at,
      cached_at: Date.now(),
    };
    
    // Update storage
    storedUris[cacheKey] = result;
    chrome.storage.local.set({ [URIS_KEY]: storedUris });
    
    return result;
  } catch (e) {
    console.error('[GDC] Error fetching repo data:', e.message);
    throw e;
  }
}

/**
 * Utility: Lindy Effect Badge
 */
function getLindyBadge(dateString) {
  const years = (new Date() - new Date(dateString)) / (1000 * 60 * 60 * 24 * 365.25);
  if (years < 1) return { icon: '🌱', label: 'Sprout' };
  if (years > 10) return { icon: '🏛️', label: 'Ancient' };
  if (years > 5) return { icon: '🌳', label: 'Mature' };
  return { icon: '🌿', label: 'Established' };
}

/**
 * Utility: Historical context
 */
function getHistoricalContext(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const milestones = [
    { year: 2013, label: 'React 0.3' },
    { year: 2009, label: 'Node.js' },
    { year: 2015, label: 'ES6' },
    { year: 2016, label: 'Next.js' },
    { year: 2010, label: 'AngularJS' },
    { year: 2014, label: 'Vue.js' },
  ];
  
  const relevant = milestones.find(m => m.year === year);
  if (relevant) return `Created around the time ${relevant.label} launched!`;
  return null;
}

/**
 * Inject logic for Repo Landing Page
 */
async function injectToRepoPage() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) return;
  
  // Only inject on repo root or file tree views
  const IS_REPO_ROOT = pathParts.length === 2;
  const IS_FILE_VIEW = pathParts.length >= 3 && ['tree', 'blob', 'edit'].includes(pathParts[2]);
  if (!IS_REPO_ROOT && !IS_FILE_VIEW) return;

  const [owner, repo] = pathParts;
  console.log('[GDC] Processing repo:', `${owner}/${repo}`);

  try {
    const data = await fetchRepoData(owner, repo);
    const settings = await getFromSyncStorage(SETTINGS_KEY, DEFAULT_SETTINGS);
    const dateFormat = await getFromSyncStorage(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT);

    const createdStr = settings.relativeTime 
      ? `Created ${getRelativeTime(data.created_at)}`
      : formatAbsoluteDate(data.created_at, dateFormat);
    
    const healthStr = (settings.showHealth && data.pushed_at)
      ? ` • Last push ${getRelativeTime(data.pushed_at)}`
      : '';

    const lindy = getLindyBadge(data.created_at);
    const history = getHistoricalContext(data.created_at);

    // DOM Discovery: Attempt to find the "About" container using multiple strategies
    const aboutSelectors = [
      '[data-testid="about-section"]',
      '.Layout-sidebar .BorderGrid-cell',
      'div[itemprop="about"]',
      '.repository-content aside .BorderGrid-cell',
      '.BorderGrid-cell' // Last resort: any grid cell
    ];

    let aboutCell = null;
    for (const selector of aboutSelectors) {
      aboutCell = document.querySelector(selector);
      if (aboutCell) break;
    }

    // Failsafe: Search by Header Text if no container found
    if (!aboutCell) {
      const headers = Array.from(document.querySelectorAll('h2'));
      const aboutHeader = headers.find(h => h.textContent.trim().toLowerCase() === 'about');
      if (aboutHeader) aboutCell = aboutHeader.parentElement;
    }

    if (!aboutCell) {
      console.warn('[GDC] No About section found using all strategies.');
      return;
    }

    // Prevent double injection
    if (aboutCell.querySelector('#gdc')) return;

    const dateHTML = `
      <div id="gdc" class="mt-3" style="font-size: 12px; color: var(--color-fg-muted);">
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <span title="Lindy Index: ${lindy.label}" style="font-size: 16px;">${lindy.icon}</span>
          <div>
            <span title="Exact creation date: ${new Date(data.created_at).toLocaleString()}" style="cursor:help">
              <svg height="16" class="octicon octicon-calendar mr-2" viewBox="0 0 16 16" version="1.1" width="16" aria-hidden="true" style="fill: currentColor; vertical-align: text-bottom;"><path fill-rule="evenodd" d="M13 2h-1v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H6v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H2c-.55 0-1 .45-1 1v11c0 .55.45 1 1 1h11c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1zm0 12H2V5h11v9zM5 3H4V1h1v2zm6 0h-1V1h1v2zM6 7H5V6h1v1zm2 0H7V6h1v1zm2 0H9V6h1v1zm2 0h-1V6h1v1zM4 9H3V8h1v1zm2 0H5V8h1v1zm2 0H7V8h1v1zm2 0H9V8h1v1zm2 0h-1V8h1v1zm-8 2H3v-1h1v1zm2 0H5v-1h1v1zm2 0H7v-1h1v1zm2 0H9v-1h1v1zm2 0h-1v-1h1v1zm-8 2H3v-1h1v1zm2 0H5v-1h1v1zm2 0H7v-1h1v1zm2 0H9v-1h1v1z"></path></svg>
              ${createdStr}${healthStr}
            </span>
            ${history ? `<div style="font-style: italic; margin-top: 4px; opacity: 0.8;">${history}</div>` : ''}
          </div>
        </div>
      </div>
    `;

    // Insertion: Target the description paragraph or the first header
    const description = aboutCell.querySelector('p.f4') || aboutCell.querySelector('h2');
    if (description) {
      description.insertAdjacentHTML('afterend', dateHTML);
    } else {
      aboutCell.insertAdjacentHTML('afterbegin', dateHTML);
    }
  } catch (err) {
    console.error('[GDC] Fatal error:', err);
    if (err.message === 'RATE_LIMIT_EXCEEDED') {
      showErrorInInject('Rate limit exceeded. Add a PAT in options.');
    } else {
      showErrorInInject('Failed to load creation date.');
    }
  }
}

/**
 * Show error in UI
 */
function showErrorInInject(msg) {
  const sidebar = document.querySelector('.Layout-sidebar') || document.querySelector('[data-testid="repository-details-sidebar"]');
  if (!sidebar) return;
  const aboutCell = sidebar.querySelector('.BorderGrid-cell') || sidebar.querySelector('[data-testid="about-section"]');
  if (!aboutCell || aboutCell.querySelector('#gdc-error')) return;

  // Added #cf222e fallback for color-fg-danger
  const errorHTML = `<div id="gdc-error" class="mt-2 text-small color-fg-danger" style="color: var(--color-fg-danger, #cf222e);">${msg}</div>`;
  aboutCell.insertAdjacentHTML('beforeend', errorHTML);
}

/**
 * Inject logic for Search Results
 */
/**
 * Inject logic for Search Results (New & Old UI)
 */
async function injectToSearchResults() {
  const repoItems = Array.from(document.querySelectorAll('.repo-list-item, .Box-row, [data-testid="results-list"] > div, .list-style-none > li'));
  if (repoItems.length === 0) return;

  if (DEBUG) console.log('[GDC] Processing search results, found items:', repoItems.length);

  let settings, dateFormat, pat, cacheResponse;
  try {
    [settings, dateFormat, pat, cacheResponse] = await Promise.all([
      getFromSyncStorage(SETTINGS_KEY, DEFAULT_SETTINGS),
      getFromSyncStorage(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT),
      getFromSyncStorage(PAT_KEY, ''),
      getFromStorage(URIS_KEY, {})
    ]);
  } catch (err) {
    console.error('[GDC] Failed to load settings for search:', err);
    return;
  }
  
  const uris = cacheResponse;
  let fetchCount = 0;

  for (const item of repoItems) {
    if (item.querySelector('.gdc-search-injected')) continue;

    // Aggressive link detection for the repository path
    const link = item.querySelector('a[href*="/"][data-hydro-click*="RESULT"], h3 a, h2 a, a.v-align-middle, a[data-testid="results-list-item-path"]');
    if (!link) continue;

    const href = link.getAttribute('href');
    if (!href) continue;
    
    const pathParts = href.split('/').filter(Boolean);
    if (pathParts.length < 2) continue; // Owner/Repo required

    const owner = pathParts[0];
    const repo = pathParts[1];
    const cacheKey = `${owner}/${repo}`;

    const isCached = uris[cacheKey] && typeof uris[cacheKey] === 'object' && uris[cacheKey].created_at;
    
    // If no PAT and not cached, only fetch the first 5 per page
    if (!pat && !isCached && fetchCount >= 5) {
      if (DEBUG) console.log(`[GDC] Skipping ${owner}/${repo} (Rate limit protection)`);
      continue;
    }
    if (!isCached) fetchCount++;
    
    // Mark as injected EARLY to avoid racing
    const marker = document.createElement('span');
    marker.className = 'gdc-search-injected';
    item.appendChild(marker);

    try {
      const data = await fetchRepoData(owner, repo);
      const lindy = getLindyBadge(data.created_at);
      const createdStr = settings.relativeTime 
        ? getRelativeTime(data.created_at)
        : formatAbsoluteDate(data.created_at, dateFormat);
      
      // Target multiple potential metadata rows
      const target = item.querySelector('.f6.color-fg-muted, .text-small.color-fg-muted, .color-fg-subtle, [data-testid="search-result-item-metadata"]');
      
      const html = `
        <span class="mr-3 gdc-injected-search-label d-inline-flex flex-items-center" style="gap:4px; margin-right: 12px; vertical-align: middle;" title="Created on ${new Date(data.created_at).toLocaleDateString()}">
          <span style="font-size: 14px;">${lindy.icon}</span>
          <svg height="14" class="octicon octicon-calendar" viewBox="0 0 16 16" version="1.1" width="14" aria-hidden="true" style="fill: currentColor; opacity: 0.7;"><path fill-rule="evenodd" d="M13 2h-1v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H6v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H2c-.55 0-1 .45-1 1v11c0 .55.45 1 1 1h11c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1zm0 12H2V5h11v9zM5 3H4V1h1v2zm6 0h-1V1h1v2z"></path></svg>
          <span style="font-size: 12px;">Created ${createdStr}</span>
        </span>
      `;

      if (target) {
        target.insertAdjacentHTML('afterbegin', html);
      } else {
        // Fallback: Create a new row if we can't find the native one
        const fallbackRow = document.createElement('div');
        fallbackRow.className = 'mt-1 text-small color-fg-subtle';
        fallbackRow.innerHTML = html;
        item.appendChild(fallbackRow);
      }
      if (DEBUG) console.log(`[GDC] Successfully injected: ${owner}/${repo}`);
    } catch (e) {
      if (DEBUG) console.warn(`[GDC] Search fetch failed for ${owner}/${repo}:`, e.message);
    }
  }
}

/**
 * Main processor
 */
function processPage() {
  const path = window.location.pathname;
  
  // Repo Page
  if (path.split('/').filter(Boolean).length >= 2) {
    injectToRepoPage();
  }

  // Search Results
  if (path === '/search' || path.startsWith('/search')) {
    injectToSearchResults();
  }
  
  // Trending
  if (path === '/trending' || path.startsWith('/trending')) {
    injectToSearchResults(); // Trending often uses same Box-row structure
  }
}

/**
 * Observer
 */
function startObserver() {
  if (domObserver) domObserver.disconnect();
  domObserver = new MutationObserver(() => processPage());
  domObserver.observe(document.body, { childList: true, subtree: true });
}

// Initial execution
processPage();
startObserver();

// Event listeners for SPA navigation
document.addEventListener('pjax:end', processPage);
document.addEventListener('turbo:load', processPage);