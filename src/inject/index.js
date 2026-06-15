/* global chrome, DATE_FORMAT_KEY, REPO_CACHE_KEY, DEFAULT_DATE_FORMAT, PAT_KEY, SETTINGS_KEY, DEFAULT_SETTINGS, RATE_LIMIT_KEY, getRelativeTime, formatAbsoluteDate, getLindyBadge, getHealthStatus, formatSize */

const cache = { data: null, inflight: new Map() };
let domObserver = null;
let debounceTimer = null;
let storageWriteTimer = null;
let processingRepos = new Set();
let rateLimitResetTime = 0;
let globalTooltip = null;

function getFromStorage(key, defaultValue = {}) {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage?.local) return resolve(defaultValue);
      chrome.storage.local.get({ [key]: defaultValue }, (response) => {
        if (chrome.runtime.lastError) return resolve(defaultValue);
        resolve(response[key]);
      });
    } catch {
      resolve(defaultValue);
    }
  });
}

function getFromSyncStorage(key, defaultValue) {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage?.sync) return resolve(defaultValue);
      chrome.storage.sync.get({ [key]: defaultValue }, (response) => {
        if (chrome.runtime.lastError) return resolve(defaultValue);
        resolve(response[key]);
      });
    } catch {
      resolve(defaultValue);
    }
  });
}

function persistCacheToDisk() {
  clearTimeout(storageWriteTimer);
  storageWriteTimer = setTimeout(async () => {
    if (cache.data && chrome.storage?.local) {
      try {
        await chrome.storage.local.set({ [REPO_CACHE_KEY]: cache.data });
      } catch {}
    }
  }, 1000);
}

async function getPat() {
  const local = await getFromStorage(PAT_KEY, '');
  if (local) return local;

  const sync = await getFromSyncStorage(PAT_KEY, '');
  if (sync) {
    await chrome.storage.local.set({ [PAT_KEY]: sync });
    await chrome.storage.sync.remove(PAT_KEY);
    return sync;
  }
  return '';
}

function saveRateLimit(headers) {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  if (limit === null || remaining === null || reset === null) return;

  try {
    chrome.storage.local
      .set({
        [RATE_LIMIT_KEY]: {
          limit: parseInt(limit, 10),
          remaining: parseInt(remaining, 10),
          reset: parseInt(reset, 10) * 1000,
          updated_at: Date.now(),
        },
      })
      .catch(() => {});
  } catch {}
}

async function fetchRepoData(owner, repo) {
  const apiUri = `https://api.github.com/repos/${owner}/${repo}`;
  const cacheKey = `${owner}/${repo}`;

  if (cache.data === null) {
    cache.data = await getFromStorage(REPO_CACHE_KEY, {});
  }

  const cachedEntry = cache.data[cacheKey];
  if (cachedEntry?.created_at && cachedEntry.cached_at) {
    if (Date.now() - cachedEntry.cached_at <= CACHE_TTL_MS) {
      return cachedEntry;
    }
  }

  if (cache.inflight.has(cacheKey)) {
    return cache.inflight.get(cacheKey);
  }

  const fetchPromise = (async () => {
    if (Date.now() < rateLimitResetTime) throw new Error('RATE_LIMIT_EXCEEDED');

    const pat = await getPat();
    const headers = {};
    if (pat) headers['Authorization'] = `token ${pat}`;

    try {
      const response = await fetch(apiUri, { headers });
      saveRateLimit(response.headers);

      if (response.headers.get('x-ratelimit-remaining') === '0') {
        const reset = response.headers.get('x-ratelimit-reset');
        if (reset) rateLimitResetTime = parseInt(reset, 10) * 1000;
      }

      if (!response.ok) {
        throw response.status === 403 || response.status === 429
          ? new Error('RATE_LIMIT_EXCEEDED')
          : new Error('API_ERROR');
      }

      const data = await response.json();
      const result = {
        created_at: data.created_at,
        pushed_at: data.pushed_at,
        size: data.size,
        cached_at: Date.now(),
      };

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
  const rect = tooltip.getBoundingClientRect();
  if (x + rect.width > window.innerWidth + window.scrollX) x = e.pageX - rect.width - margin;
  if (y + rect.height > window.innerHeight + window.scrollY) y = e.pageY - rect.height - margin;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function getLindyExplanation(label) {
  const clean = label.replace(/[🌱🌿🌳🏛️\s]/g, '').toLowerCase();
  if (clean.includes('sprout')) return 'New project (<1 year). High flexibility, but higher risk of abandonment.';
  if (clean.includes('established')) return 'Surviving project (>1 year). Proven baseline stability and structure.';
  if (clean.includes('mature')) return 'Long-running project (>5 years). High reliability, low likelihood of sudden demise.';
  if (clean.includes('ancient')) return 'Decade-old legacy (>10 years). Deeply established standard, extreme stability.';
  return 'Maturity classification based on survival age (Lindy Effect).';
}

function getHealthExplanation(label, pushedAt) {
  const clean = label.toLowerCase();
  let timeStr = 'pushed recently';
  if (pushedAt) {
    try {
      timeStr = `last push was ${getRelativeTime(pushedAt)}`;
    } catch {}
  }

  if (clean.includes('active')) return `Active updates (${timeStr}). Under active and rapid development.`;
  if (clean.includes('stable')) return `Stable updates (${timeStr}). Maintained and responsive to bugs.`;
  if (clean.includes('dormant')) return `Dormant updates (${timeStr}). Development has slowed, code is stable.`;
  if (clean.includes('legacy')) return `Legacy project (${timeStr}). Unmaintained, proceed with caution.`;
  return 'Maintenance frequency classification based on commit history.';
}

function showErrorInInject(msg) {
  const sidebar =
    document.querySelector('.Layout-sidebar') || document.querySelector('[data-testid="repository-details-sidebar"]');
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

async function injectToRepoPage() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length !== 2) return;

  const [owner, repo] = pathParts;
  const cacheKey = `${owner}/${repo}`;
  if (processingRepos.has(cacheKey)) return;
  processingRepos.add(cacheKey);

  try {
    const data = await fetchRepoData(owner, repo);
    const [settings, dateFormat] = await Promise.all([
      getFromSyncStorage(SETTINGS_KEY, DEFAULT_SETTINGS),
      getFromSyncStorage(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT),
    ]);

    const createdStr = settings.relativeTime
      ? `Created ${getRelativeTime(data.created_at)}`
      : formatAbsoluteDate(data.created_at, dateFormat);
    const healthStr = settings.showHealth && data.pushed_at ? ` • Last push ${getRelativeTime(data.pushed_at)}` : '';
    const sizeStr = settings.showSize && data.size !== undefined ? ` • ${formatSize(data.size)}` : '';
    const lindy = getLindyBadge(data.created_at);

    const aboutSelectors = [
      '[data-testid="about-section"]',
      '.Layout-sidebar [data-testid="about-section"]',
      '.Box:has([data-testid="about-section"])',
      '.Layout-sidebar .BorderGrid-cell',
      '.repository-sidebar .BorderGrid-cell',
      'div[itemprop="about"]',
      '[data-testid="repository-details-sidebar"] > div',
      '.Box--full .BorderGrid-cell',
    ];

    let aboutCell = null;
    for (const selector of aboutSelectors) {
      try {
        aboutCell = document.querySelector(selector);
        if (aboutCell?.offsetParent !== null) break;
      } catch {}
    }

    if (!aboutCell) {
      const aboutHeader = Array.from(document.querySelectorAll('h2, h3, [role="heading"]')).find(
        (h) => h.textContent.trim().toLowerCase() === 'about'
      );
      if (aboutHeader) {
        aboutCell = aboutHeader.closest(
          'div[class*="Box"], div[class*="cell"], section, .BorderGrid-cell, [class*="sidebar"]'
        );
      }
    }

    if (!aboutCell) {
      const sidebarSelectors = [
        '[data-testid="repository-details-sidebar"]',
        '.Layout-sidebar',
        '.repository-sidebar',
        '.Box--full',
        'aside',
        '[class*="sidebar"]',
        '.col-12:last-child',
      ];
      for (const selector of sidebarSelectors) {
        try {
          aboutCell = document.querySelector(selector);
          if (aboutCell?.offsetParent !== null) break;
        } catch {}
      }
    }

    if (!aboutCell) {
      const mainContainers = document.querySelectorAll('[role="main"], main, .container, .container-lg, .Box');
      for (const container of mainContainers) {
        if (container.offsetParent !== null && container.offsetHeight > 200) {
          aboutCell = container;
          break;
        }
      }
    }

    if (!aboutCell || aboutCell.querySelector('#gdc-injected') || document.querySelector('#gdc-injected')) return;

    const theme = settings.theme || 'native';
    const wrapper = document.createElement('div');
    wrapper.id = 'gdc-injected';
    wrapper.className = `gdc-badge-container gdc-theme-${theme}`;
    wrapper.style.animation = 'fadeIn 0.5s ease-in-out';

    const flex = document.createElement('div');
    flex.className = 'gdc-inner-flex';
    flex.style.display = 'flex';
    flex.style.alignItems = 'flex-start';
    flex.style.gap = '12px';

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
    statusDiv.textContent = `${createdStr}${healthStr}${sizeStr}`;

    const refreshBtn = document.createElement('span');
    refreshBtn.className = 'gdc-refresh-btn';
    refreshBtn.title = 'Refresh repo data';
    refreshBtn.innerHTML = '↻';
    refreshBtn.style.cssText =
      'font-size:14px;cursor:pointer;opacity:0.5;margin-left:8px;vertical-align:middle;display:inline-block;transition:opacity 0.2s,transform 0.2s;';
    refreshBtn.addEventListener('mouseenter', () => {
      refreshBtn.style.opacity = '1';
      refreshBtn.style.transform = 'rotate(90deg)';
    });
    refreshBtn.addEventListener('mouseleave', () => {
      refreshBtn.style.opacity = '0.5';
      refreshBtn.style.transform = 'rotate(0deg)';
    });
    refreshBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      refreshBtn.style.transform = 'rotate(360deg)';
      refreshBtn.style.transition = 'transform 0.5s';

      if (cache.data?.[cacheKey]) {
        delete cache.data[cacheKey];
        try {
          const stored = await getFromStorage(REPO_CACHE_KEY, {});
          delete stored[cacheKey];
          await chrome.storage.local.set({ [REPO_CACHE_KEY]: stored });
        } catch {}
      }
      processingRepos.delete(cacheKey);
      setTimeout(() => injectToRepoPage(), 100);
    });
    statusDiv.appendChild(refreshBtn);

    const maturityDiv = document.createElement('div');
    maturityDiv.className = 'gdc-subtitle';
    maturityDiv.style.fontSize = '13px';
    maturityDiv.style.color = 'var(--color-fg-muted)';
    maturityDiv.style.marginTop = '2px';
    maturityDiv.innerHTML = `Project Maturity: <strong></strong>`;
    maturityDiv.querySelector('strong').textContent = lindy.label;

    textDiv.appendChild(statusDiv);
    textDiv.appendChild(maturityDiv);
    flex.appendChild(iconDiv);
    flex.appendChild(textDiv);
    wrapper.appendChild(flex);

    wrapper.style.cursor = 'pointer';
    wrapper.addEventListener('mouseenter', (e) => {
      const tooltip = getTooltip();
      const health = getHealthStatus(data.pushed_at);
      const exactCreated = new Date(data.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const exactPushed = data.pushed_at
        ? new Date(data.pushed_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        : 'N/A';

      const sizeLabel = data.size !== undefined ? formatSize(data.size) : null;
      const sizeRow = sizeLabel
        ? `<div class="gdc-tooltip-row"><span class="gdc-tooltip-label">Repo Size:</span><span class="gdc-tooltip-value">${sizeLabel}</span></div>`
        : '';

      tooltip.innerHTML = `
        <div class="gdc-tooltip-title">${owner}/${repo} Insights</div>
        <div class="gdc-tooltip-row"><span class="gdc-tooltip-label">Created:</span><span class="gdc-tooltip-value">${exactCreated}</span></div>
        <div class="gdc-tooltip-row" ${sizeLabel ? '' : 'style="margin-bottom:8px;"'}><span class="gdc-tooltip-label">Last Push:</span><span class="gdc-tooltip-value">${exactPushed}</span></div>
        ${sizeRow}
        <div class="gdc-tooltip-row" style="border-top:1px solid #30363d;padding-top:8px;"><span class="gdc-tooltip-label">Maturity:</span><span class="gdc-tooltip-value">${lindy.icon} ${lindy.label}</span></div>
        <div style="font-size:11px;color:#8b949e;margin-bottom:8px;margin-top:-2px;line-height:1.3;">${getLindyExplanation(lindy.label)}</div>
        <div class="gdc-tooltip-row" style="border-top:1px solid #30363d;padding-top:8px;margin-top:4px;"><span class="gdc-tooltip-label">Maintenance:</span><span class="gdc-tooltip-value" style="color:${health.color};font-weight:bold;">${health.icon} ${health.label}</span></div>
        <div style="font-size:11px;color:#8b949e;margin-top:-2px;line-height:1.3;">${getHealthExplanation(health.label, data.pushed_at)}</div>
      `;
      tooltip.classList.add('visible');
      positionTooltip(e, tooltip);
    });

    wrapper.addEventListener('mousemove', (e) => {
      positionTooltip(e, getTooltip());
    });

    wrapper.addEventListener('mouseleave', () => {
      getTooltip().classList.remove('visible');
    });

    const target =
      aboutCell.querySelector('p.f4') ||
      aboutCell.querySelector('h2') ||
      aboutCell.querySelector('[role="heading"]') ||
      aboutCell.querySelector('.Box-header');
    if (target) target.insertAdjacentElement('afterend', wrapper);
    else aboutCell.insertAdjacentElement('afterbegin', wrapper);
  } catch (err) {
    if (err.message === 'RATE_LIMIT_EXCEEDED') {
      showErrorInInject('Rate limit exceeded. Add a PAT in options.');
    }
  } finally {
    processingRepos.delete(cacheKey);
  }
}

async function injectToSearchResults() {
  const repoItems = Array.from(
    document.querySelectorAll('.repo-list-item, .Box-row, [data-testid="results-list"] > div, .list-style-none > li')
  );
  if (repoItems.length === 0) return;

  if (cache.data === null) {
    cache.data = await getFromStorage(REPO_CACHE_KEY, {});
  }

  const [settings, dateFormat, pat] = await Promise.all([
    getFromSyncStorage(SETTINGS_KEY, DEFAULT_SETTINGS),
    getFromSyncStorage(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT),
    getPat(),
  ]);

  let fetchCount = 0;
  const CONCURRENCY = 5;
  const executing = new Set();

  for (const item of repoItems) {
    if (item.querySelector('.gdc-search-injected')) continue;

    const link = item.querySelector(
      'a[href*="/"][data-hydro-click*="RESULT"], h3 a, h2 a, a.v-align-middle, a[data-testid="results-list-item-path"]'
    );
    if (!link) continue;

    const pathParts = link.getAttribute('href').split('/').filter(Boolean);
    if (pathParts.length < 2) continue;

    const [owner, repo] = pathParts;
    const cacheKey = `${owner}/${repo}`;
    const cachedEntry = cache.data[cacheKey];
    const isCached = cachedEntry?.created_at && Date.now() - cachedEntry.cached_at <= CACHE_TTL_MS;

    if (!pat && !isCached && fetchCount >= 5) continue;
    if (!isCached) fetchCount++;

    const marker = document.createElement('span');
    marker.className = 'gdc-search-injected';
    item.appendChild(marker);

    const promise = fetchRepoData(owner, repo)
      .then((data) => {
        const lindy = getLindyBadge(data.created_at);
        const createdStr = settings.relativeTime
          ? getRelativeTime(data.created_at)
          : formatAbsoluteDate(data.created_at, dateFormat);
        const target = item.querySelector('.f6.color-fg-muted, .text-small.color-fg-muted, .color-fg-subtle');

        const wrapper = document.createElement('span');
        wrapper.className = 'mr-3 gdc-injected-search-label d-inline-flex flex-items-center';
        wrapper.style.gap = '4px';
        wrapper.style.marginRight = '12px';
        wrapper.style.verticalAlign = 'middle';
        wrapper.setAttribute('title', `Created on ${new Date(data.created_at).toLocaleDateString()}`);
        wrapper.innerHTML = `
          <span style="font-size:14px;" class="gdc-search-icon">${lindy.icon}</span>
          <svg height="14" class="octicon octicon-calendar" viewBox="0 0 16 16" width="14" aria-hidden="true" style="fill:currentColor;opacity:0.7;"><path fill-rule="evenodd" d="M13 2h-1v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H6v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H2c-.55 0-1 .45-1 1v11c0 .55.45 1 1 1h11c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1zm0 12H2V5h11v9zM5 3H4V1h1v2zm6 0h-1V1h1v2z"/></svg>
          <span style="font-size:12px;" class="gdc-search-text">Created ${createdStr}</span>
        `;

        if (target) target.insertAdjacentElement('afterbegin', wrapper);
        else {
          const row = document.createElement('div');
          row.className = 'mt-1 text-small color-fg-subtle';
          row.appendChild(wrapper);
          item.appendChild(row);
        }
      })
      .catch(() => {})
      .finally(() => executing.delete(promise));

    executing.add(promise);
    if (executing.size >= CONCURRENCY) await Promise.race(executing);
  }

  if (executing.size > 0) await Promise.all(executing);
}

function processPage() {
  const path = window.location.pathname;
  if (path.split('/').filter(Boolean).length >= 2) injectToRepoPage();
  if (path.includes('/search') || path.includes('/trending')) injectToSearchResults();
}

function startObserver() {
  if (domObserver) domObserver.disconnect();
  domObserver = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => requestAnimationFrame(processPage), 250);
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
}

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