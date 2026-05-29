/* global chrome, DATE_FORMAT_KEY, REPO_CACHE_KEY, DEFAULT_DATE_FORMAT, PAT_KEY, SETTINGS_KEY, DEFAULT_SETTINGS, RATE_LIMIT_KEY, getRelativeTime, formatAbsoluteDate, getLindyBadge, getHealthStatus, formatSize */

// In-memory cache for high-performance reads and duplicate-fetch prevention
const cache = {
  data: null, // Full repository data dictionary
  inflight: new Map(), // Track active fetch operations to prevent double-requests
};

let domObserver = null;
let debounceTimer = null;
let storageWriteTimer = null;
const DEBUG = false;
let processingRepos = new Set();
let rateLimitResetTime = 0;

if (DEBUG) console.log('[GDC] Extension Script: Heartbeat OK');

/**
 * Optimized Storage Helpers
 */
function getFromStorage(key, defaultValue = {}) {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage || !chrome.storage.local) return resolve(defaultValue);
      chrome.storage.local.get({ [key]: defaultValue }, (response) => {
        if (chrome.runtime.lastError) return resolve(defaultValue);
        resolve(response[key]);
      });
    } catch (e) {
      resolve(defaultValue);
    }
  });
}

function getFromSyncStorage(key, defaultValue) {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage || !chrome.storage.sync) return resolve(defaultValue);
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
 * Debounced storage write to disk
 */
function persistCacheToDisk() {
  clearTimeout(storageWriteTimer);
  storageWriteTimer = setTimeout(async () => {
    if (cache.data) {
      try {
        await chrome.storage.local.set({ [REPO_CACHE_KEY]: cache.data });
      } catch (e) {
        console.error('[GDC] Failed to set local storage', e);
      }
    }
  }, 1000); // Wait 1 second after last update before hitting disk
}

async function getPat() {
  let pat = await getFromStorage(PAT_KEY, '');
  if (!pat) {
    pat = await getFromSyncStorage(PAT_KEY, '');
    if (pat) {
      // Migrate it automatically
      await chrome.storage.local.set({ [PAT_KEY]: pat });
      await chrome.storage.sync.remove(PAT_KEY);
    }
  }
  return pat;
}

/**
 * Save rate limit metadata to storage
 */
function saveRateLimit(headers) {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  if (limit !== null && remaining !== null && reset !== null) {
    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          [RATE_LIMIT_KEY]: {
            limit: parseInt(limit, 10),
            remaining: parseInt(remaining, 10),
            reset: parseInt(reset, 10) * 1000,
            updated_at: Date.now()
          }
        });
      }
    } catch (e) {
      if (DEBUG) console.error('[GDC] Failed to save rate limit', e);
    }
  }
}

/**
 * Optimized fetch with Memory-First & In-Flight Tracking
 */
async function fetchRepoData(owner, repo) {
  const apiUri = `https://api.github.com/repos/${owner}/${repo}`;
  const cacheKey = `${owner}/${repo}`;
  
  // 1. Initialize full cache into memory if empty
  if (cache.data === null) {
    cache.data = await getFromStorage(REPO_CACHE_KEY, {});
  }

  // 2. Read from memory (Instant result)
  const cachedEntry = cache.data[cacheKey];
  if (cachedEntry && typeof cachedEntry === 'object' && cachedEntry.created_at) {
    // Check TTL on read to prevent stale UI loading while disk alarm handles sweeps
    if (cachedEntry.cached_at && (Date.now() - cachedEntry.cached_at <= CACHE_TTL_MS)) {
      return cachedEntry;
    }
  }

  // 3. Handle in-flight requests (Prevent duplicate API calls for same repo)
  if (cache.inflight.has(cacheKey)) {
    return cache.inflight.get(cacheKey);
  }

  const fetchPromise = (async () => {
    if (Date.now() < rateLimitResetTime) {
      throw new Error('RATE_LIMIT_EXCEEDED');
    }

    const pat = await getPat();
    const headers = {};
    if (pat) headers['Authorization'] = `token ${pat}`;

    try {
      const response = await fetch(apiUri, { headers });
      saveRateLimit(response.headers);
      
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        const reset = response.headers.get('x-ratelimit-reset');
        if (reset) {
          rateLimitResetTime = parseInt(reset, 10) * 1000;
        }
      }

      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          throw new Error('RATE_LIMIT_EXCEEDED');
        }
        throw new Error('API_ERROR');
      }
      const data = await response.json();
      const result = {
        created_at: data.created_at,
        pushed_at: data.pushed_at,
        cached_at: Date.now(),
      };
      
      // Update memory and schedule disk sync
      cache.data[cacheKey] = result;
      persistCacheToDisk();
      
      return result;
    } finally {
      cache.inflight.delete(cacheKey);
    }
  })();

  cache.inflight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Inject logic for Repo Landing Page
 */
async function injectToRepoPage() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) return;
  const IS_REPO_ROOT = pathParts.length === 2;
  const IS_FILE_VIEW = pathParts.length >= 3 && ['tree', 'blob', 'edit'].includes(pathParts[2]);
  if (!IS_REPO_ROOT && !IS_FILE_VIEW) return;

  const [owner, repo] = pathParts;
  const cacheKey = `${owner}/${repo}`;
  
  if (processingRepos.has(cacheKey)) return;
  processingRepos.add(cacheKey);

  try {
    const data = await fetchRepoData(owner, repo);
    const [settings, dateFormat] = await Promise.all([
      getFromSyncStorage(SETTINGS_KEY, DEFAULT_SETTINGS),
      getFromSyncStorage(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT)
    ]);

    const createdStr = settings.relativeTime 
      ? `Created ${getRelativeTime(data.created_at)}`
      : formatAbsoluteDate(data.created_at, dateFormat);
    const healthStr = (settings.showHealth && data.pushed_at) ? ` • Last push ${getRelativeTime(data.pushed_at)}` : '';
    const lindy = getLindyBadge(data.created_at);

    const aboutSelectors = ['[data-testid="about-section"]', '.Layout-sidebar .BorderGrid-cell', 'div[itemprop="about"]', '.BorderGrid-cell'];
    let aboutCell = null;
    for (const selector of aboutSelectors) {
      aboutCell = document.querySelector(selector);
      if (aboutCell) break;
    }
    if (!aboutCell) {
      const headers = Array.from(document.querySelectorAll('h2'));
      const aboutHeader = headers.find(h => h.textContent.trim().toLowerCase() === 'about');
      if (aboutHeader) aboutCell = aboutHeader.parentElement;
    }

    if (aboutCell && !aboutCell.querySelector('#gdc-injected')) {
      const theme = settings.theme || 'native';
      const wrapper = document.createElement('div');
      wrapper.id = 'gdc-injected';
      wrapper.className = `gdc-badge-container gdc-theme-${theme}`;
      wrapper.style.animation = 'fadeIn 0.5s ease-in-out';
      
      const flexContainer = document.createElement('div');
      flexContainer.className = 'gdc-inner-flex';
      flexContainer.style.display = 'flex';
      flexContainer.style.alignItems = 'flex-start';
      flexContainer.style.gap = '12px';

      const iconDiv = document.createElement('div');
      iconDiv.className = 'gdc-icon';
      iconDiv.style.fontSize = '28px';
      iconDiv.style.lineHeight = '1';
      iconDiv.textContent = lindy.icon;

      const textDiv = document.createElement('div');
      textDiv.style.flex = '1';

      const statusDiv = document.createElement('div');
      statusDiv.className = 'gdc-title';
      statusDiv.style.fontWeight = '600';
      statusDiv.style.fontSize = '14px';
      statusDiv.style.color = 'var(--color-fg-default)';
      statusDiv.textContent = `${createdStr}${healthStr}`;

      const maturityDiv = document.createElement('div');
      maturityDiv.className = 'gdc-subtitle';
      maturityDiv.style.fontSize = '13px';
      maturityDiv.style.color = 'var(--color-fg-muted)';
      maturityDiv.style.marginTop = '2px';
      
      maturityDiv.innerHTML = `Project Maturity: <strong></strong>`;
      maturityDiv.querySelector('strong').textContent = lindy.label;

      textDiv.appendChild(statusDiv);
      textDiv.appendChild(maturityDiv);
      
      flexContainer.appendChild(iconDiv);
      flexContainer.appendChild(textDiv);
      wrapper.appendChild(flexContainer);

      // Tooltip Hover Listeners
      wrapper.style.cursor = 'pointer';
      wrapper.addEventListener('mouseenter', (e) => {
        const tooltip = getTooltip();
        const health = getHealthStatus(data.pushed_at);
        const starsStr = getStarsFromDOM();
        const forksStr = getForksFromDOM();
        const licenseStr = getLicenseFromDOM();
        
        tooltip.innerHTML = `
          <div class="gdc-tooltip-title">${owner}/${repo} Details</div>
          <div class="gdc-tooltip-row">
            <span class="gdc-tooltip-label">Maturity Status:</span>
            <span class="gdc-tooltip-value">${lindy.icon} ${lindy.label}</span>
          </div>
          <div class="gdc-tooltip-row">
            <span class="gdc-tooltip-label">Project Health:</span>
            <span class="gdc-tooltip-value" style="color: ${health.color}; font-weight: bold;">
              ${health.icon} ${health.label}
            </span>
          </div>
          <div class="gdc-tooltip-row">
            <span class="gdc-tooltip-label">Stars:</span>
            <span class="gdc-tooltip-value">⭐ ${starsStr}</span>
          </div>
          <div class="gdc-tooltip-row">
            <span class="gdc-tooltip-label">Forks:</span>
            <span class="gdc-tooltip-value">🍴 ${forksStr}</span>
          </div>
          <div class="gdc-tooltip-row">
            <span class="gdc-tooltip-label">License:</span>
            <span class="gdc-tooltip-value">⚖️ ${licenseStr}</span>
          </div>
        `;
        tooltip.classList.add('visible');
        positionTooltip(e, tooltip);
      });

      wrapper.addEventListener('mousemove', (e) => {
        const tooltip = getTooltip();
        positionTooltip(e, tooltip);
      });

      wrapper.addEventListener('mouseleave', () => {
        const tooltip = getTooltip();
        tooltip.classList.remove('visible');
      });

      const target = aboutCell.querySelector('p.f4') || aboutCell.querySelector('h2');
      if (target) target.insertAdjacentElement('afterend', wrapper);
      else aboutCell.insertAdjacentElement('afterbegin', wrapper);
    }
  } catch (err) {
    if (err.message === 'RATE_LIMIT_EXCEEDED') showErrorInInject('Rate limit exceeded. Add a PAT in options.');
  } finally {
    processingRepos.delete(cacheKey);
  }
}

let globalTooltip = null;

function getTooltip() {
  if (globalTooltip) return globalTooltip;
  globalTooltip = document.createElement('div');
  globalTooltip.className = 'gdc-tooltip';
  document.body.appendChild(globalTooltip);
  return globalTooltip;
}

function positionTooltip(e, tooltip) {
  const margin = 12;
  let x = e.pageX + margin;
  let y = e.pageY + margin;
  
  // Boundary check to keep inside viewport
  const tooltipRect = tooltip.getBoundingClientRect();
  if (x + tooltipRect.width > window.innerWidth + window.scrollX) {
    x = e.pageX - tooltipRect.width - margin;
  }
  if (y + tooltipRect.height > window.innerHeight + window.scrollY) {
    y = e.pageY - tooltipRect.height - margin;
  }
  
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function getStarsFromDOM() {
  const headerStar = document.querySelector('#repo-stars-counter-star') || 
                     document.querySelector('.Counter.js-social-count') ||
                     document.querySelector('[data-testid="repository-stars-button"] .Counter');
  if (headerStar) return headerStar.textContent.trim();

  const sidebarStar = document.querySelector('a[href$="/stargazers"]') || 
                      document.querySelector('a[href*="/stars"]');
  if (sidebarStar) {
    const text = sidebarStar.textContent.trim();
    return text.replace(/\s*stars?/i, '').trim();
  }
  return '0';
}

function getForksFromDOM() {
  const headerFork = document.querySelector('#repo-network-counter') ||
                     document.querySelector('[data-testid="repository-forks-button"] .Counter');
  if (headerFork) return headerFork.textContent.trim();

  const sidebarFork = document.querySelector('a[href$="/forks"]') || 
                      document.querySelector('a[href$="/network/members"]');
  if (sidebarFork) {
    const text = sidebarFork.textContent.trim();
    return text.replace(/\s*forks?/i, '').trim();
  }
  return '0';
}

function getLicenseFromDOM() {
  const licenseLink = document.querySelector('a[href*="/LICENSE"]') || 
                      document.querySelector('a[href*="/license"]');
  if (licenseLink) {
    return licenseLink.textContent.trim().replace(/\s*license/i, '').trim();
  }

  const lawIcon = document.querySelector('.octicon-law');
  if (lawIcon) {
    const parentText = lawIcon.parentElement.textContent.trim();
    return parentText.replace(/\s*license/i, '').trim();
  }
  return 'None';
}

function showErrorInInject(msg) {
  const sidebar = document.querySelector('.Layout-sidebar') || document.querySelector('[data-testid="repository-details-sidebar"]');
  if (!sidebar) return;
  const aboutCell = sidebar.querySelector('.BorderGrid-cell') || sidebar.querySelector('[data-testid="about-section"]');
  if (!aboutCell || aboutCell.querySelector('#gdc-error')) return;
  
  const errDiv = document.createElement('div');
  errDiv.id = 'gdc-error';
  errDiv.className = 'mt-2 text-small color-fg-danger';
  errDiv.style.color = 'var(--color-fg-danger, #cf222e)';
  errDiv.textContent = msg;
  
  aboutCell.appendChild(errDiv);
}

/**
 * Parallelized Search Results (Network-Waterfall Elimination)
 */
async function injectToSearchResults() {
  const repoItems = Array.from(document.querySelectorAll('.repo-list-item, .Box-row, [data-testid="results-list"] > div, .list-style-none > li'));
  if (repoItems.length === 0) return;

  if (DEBUG) console.log('[GDC] Scanning search results...');

  if (cache.data === null) {
    cache.data = await getFromStorage(REPO_CACHE_KEY, {});
  }

  const [settings, dateFormat, pat] = await Promise.all([
    getFromSyncStorage(SETTINGS_KEY, DEFAULT_SETTINGS),
    getFromSyncStorage(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT),
    getPat()
  ]);
  
  let fetchCount = 0;
  const CONCURRENCY = 5;
  let executing = new Set();

  for (const item of repoItems) {
    if (item.querySelector('.gdc-search-injected')) continue;

    const link = item.querySelector('a[href*="/"][data-hydro-click*="RESULT"], h3 a, h2 a, a.v-align-middle, a[data-testid="results-list-item-path"]');
    if (!link) continue;

    const href = link.getAttribute('href');
    const pathParts = href.split('/').filter(Boolean);
    if (pathParts.length < 2) continue;

    const [owner, repo] = pathParts;
    const cacheKey = `${owner}/${repo}`;
    const cachedEntry = cache.data[cacheKey];
    const isCached = cachedEntry && typeof cachedEntry === 'object' && cachedEntry.created_at && (Date.now() - cachedEntry.cached_at <= CACHE_TTL_MS);
    
    // Rate limit check
    if (!pat && !isCached && fetchCount >= 5) {
      if (DEBUG) console.log(`[GDC] Skipping ${owner}/${repo} - No Token`);
      continue;
    }
    if (!isCached) fetchCount++;
    
    // Mark immediately to stop re-processing
    const marker = document.createElement('span');
    marker.className = 'gdc-search-injected';
    item.appendChild(marker);

    // PARALLEL EXECUTION with concurrency limit
    const promise = fetchRepoData(owner, repo).then((data) => {
      const lindy = getLindyBadge(data.created_at);
      const createdStr = settings.relativeTime ? getRelativeTime(data.created_at) : formatAbsoluteDate(data.created_at, dateFormat);
      const target = item.querySelector('.f6.color-fg-muted, .text-small.color-fg-muted, .color-fg-subtle');
      
      const svgHTML = `<svg height="14" class="octicon octicon-calendar" viewBox="0 0 16 16" version="1.1" width="14" aria-hidden="true" style="fill: currentColor; opacity: 0.7;"><path fill-rule="evenodd" d="M13 2h-1v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H6v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H2c-.55 0-1 .45-1 1v11c0 .55.45 1 1 1h11c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1zm0 12H2V5h11v9zM5 3H4V1h1v2zm6 0h-1V1h1v2z"></path></svg>`;

      const wrapper = document.createElement('span');
      wrapper.className = 'mr-3 gdc-injected-search-label d-inline-flex flex-items-center';
      wrapper.style.gap = '4px';
      wrapper.style.marginRight = '12px';
      wrapper.style.verticalAlign = 'middle';
      wrapper.setAttribute('title', `Created on ${new Date(data.created_at).toLocaleDateString()}`);

      wrapper.innerHTML = `
        <span style="font-size: 14px;" class="gdc-search-icon"></span>
        ${svgHTML}
        <span style="font-size: 12px;" class="gdc-search-text"></span>
      `;
      
      wrapper.querySelector('.gdc-search-icon').textContent = lindy.icon;
      wrapper.querySelector('.gdc-search-text').textContent = `Created ${createdStr}`;

      if (target) {
        target.insertAdjacentElement('afterbegin', wrapper);
      } else {
        const row = document.createElement('div');
        row.className = 'mt-1 text-small color-fg-subtle';
        row.appendChild(wrapper);
        item.appendChild(row);
      }
    }).catch(e => {
      if (DEBUG) console.warn(`[GDC] Fetch failed for ${owner}/${repo}:`, e.message);
    }).finally(() => {
      executing.delete(promise);
    });

    executing.add(promise);
    if (executing.size >= CONCURRENCY) {
      await Promise.race(executing);
    }
  }
  
  if (executing.size > 0) {
    await Promise.all(executing);
  }
}

/**
 * Main processor with Debounced Observer
 */
function processPage() {
  const path = window.location.pathname;
  if (path.split('/').filter(Boolean).length >= 2) injectToRepoPage();
  if (path.includes('/search')) injectToSearchResults();
  if (path.includes('/trending')) injectToSearchResults();
}

function startObserver() {
  if (domObserver) domObserver.disconnect();
  domObserver = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      requestAnimationFrame(processPage);
    }, 250); // High-performance debounce
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
}

// Initial Kickoff
processPage();
startObserver();

document.addEventListener('pjax:end', () => {
  processingRepos.clear();
  requestAnimationFrame(processPage);
});
document.addEventListener('turbo:load', () => {
  processingRepos.clear();
  requestAnimationFrame(processPage);
});