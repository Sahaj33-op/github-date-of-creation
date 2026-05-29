/* global chrome, DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT, PAT_KEY, SETTINGS_KEY, DEFAULT_SETTINGS, RATE_LIMIT_KEY */

const elements = {
  pat: document.getElementById('pat'),
  relativeTime: document.getElementById('relativeTime'),
  showHealth: document.getElementById('showHealth'),
  theme: document.getElementById('theme'),
  formatSelect: document.getElementById('date-format-select'),
  customFormat: document.getElementById('custom-format'),
  previewText: document.getElementById('preview-text'),
  previewBox: document.querySelector('.preview-box'),
  status: document.getElementById('status'),
  quotaCount: document.getElementById('quota-count'),
  quotaReset: document.getElementById('quota-reset'),
  quotaBarFill: document.getElementById('quota-bar-fill'),
};

/**
 * Utility: Simpler version of formatting for preview
 */
function formatPreview(createdDate, pushedDate, settings, dateFormat) {
  let createdStr = '';
  const dummyDate = new Date();
  dummyDate.setFullYear(dummyDate.getFullYear() - 4); // 4 years ago
  
  if (settings.relativeTime) {
    createdStr = `Created ${getRelativeTime(dummyDate.toISOString())}`;
  } else {
    createdStr = `Created ${formatAbsoluteDate(dummyDate.toISOString(), dateFormat)}`;
  }

  let healthStr = settings.showHealth ? ' • Last push 2 days ago' : '';
  
  return `${createdStr}${healthStr}`;
}

/**
 * Show saved status
 */
function showStatus() {
  elements.status.classList.add('visible');
  setTimeout(() => {
    elements.status.classList.remove('visible');
  }, 2000);
}

/**
 * Save all settings
 */
async function saveSettings() {
  const settings = {
    relativeTime: elements.relativeTime.checked,
    showHealth: elements.showHealth.checked,
    theme: elements.theme.value,
  };
  
  const dateFormat = elements.formatSelect.value === 'custom' 
    ? elements.customFormat.value 
    : elements.formatSelect.value;

  await Promise.all([
    chrome.storage.sync.set({
      [SETTINGS_KEY]: settings,
      [DATE_FORMAT_KEY]: dateFormat,
    }),
    chrome.storage.local.set({ [PAT_KEY]: elements.pat.value })
  ]);

  showStatus();
  updatePreview();
}

/**
 * Update Preview
 */
function updatePreview() {
  const settings = {
    relativeTime: elements.relativeTime.checked,
    showHealth: elements.showHealth.checked,
    theme: elements.theme.value,
  };
  const dateFormat = elements.formatSelect.value === 'custom' 
    ? elements.customFormat.value 
    : elements.formatSelect.value;

  elements.previewText.textContent = formatPreview(null, null, settings, dateFormat);
  
  // Set preview theme styles
  elements.previewBox.className = `preview-box preview-theme-${settings.theme}`;
}

/**
 * Initialize settings page
 */
/**
 * Utility: Fetch and draw API quota info
 */
async function updateQuotaDisplay() {
  if (!chrome.storage || !chrome.storage.local) return;
  const items = await chrome.storage.local.get({ [RATE_LIMIT_KEY]: null });
  const quota = items[RATE_LIMIT_KEY];
  
  if (!quota) {
    elements.quotaCount.textContent = 'Quota status: No requests made yet';
    elements.quotaReset.textContent = '';
    elements.quotaBarFill.style.width = '100%';
    elements.quotaBarFill.className = 'quota-bar-fill';
    return;
  }

  const limit = quota.limit || 60;
  const remaining = quota.remaining !== undefined ? quota.remaining : 60;
  const percent = Math.max(0, Math.min(100, (remaining / limit) * 100));
  
  elements.quotaCount.textContent = `Remaining: ${remaining} / ${limit} requests`;
  elements.quotaBarFill.style.width = `${percent}%`;
  
  if (percent <= 20) {
    elements.quotaBarFill.className = 'quota-bar-fill critical';
  } else if (percent <= 50) {
    elements.quotaBarFill.className = 'quota-bar-fill warning';
  } else {
    elements.quotaBarFill.className = 'quota-bar-fill';
  }

  const resetTime = quota.reset;
  if (resetTime) {
    const msLeft = resetTime - Date.now();
    if (msLeft > 0) {
      const minsLeft = Math.ceil(msLeft / 60000);
      elements.quotaReset.textContent = `Resets in ${minsLeft}m`;
    } else {
      elements.quotaReset.textContent = 'Resets shortly';
    }
  } else {
    elements.quotaReset.textContent = '';
  }
}

async function init() {
  const [items, localItems, syncItems] = await Promise.all([
    chrome.storage.sync.get({
      [SETTINGS_KEY]: DEFAULT_SETTINGS,
      [DATE_FORMAT_KEY]: DEFAULT_DATE_FORMAT,
    }),
    chrome.storage.local.get({ [PAT_KEY]: '' }),
    chrome.storage.sync.get({ [PAT_KEY]: '' })
  ]);

  // Migrate PAT if exists in sync but not local
  if (!localItems[PAT_KEY]) {
    if (syncItems[PAT_KEY]) {
      elements.pat.value = syncItems[PAT_KEY];
      await chrome.storage.local.set({ [PAT_KEY]: syncItems[PAT_KEY] });
      await chrome.storage.sync.remove(PAT_KEY);
    } else {
      elements.pat.value = '';
    }
  } else {
    elements.pat.value = localItems[PAT_KEY];
  }
  
  elements.relativeTime.checked = items[SETTINGS_KEY].relativeTime;
  elements.showHealth.checked = items[SETTINGS_KEY].showHealth;
  elements.theme.value = items[SETTINGS_KEY].theme || 'native';
  
  // Check if current format is in the dropdown
  const options = Array.from(elements.formatSelect.options).map(o => o.value);
  if (options.includes(items[DATE_FORMAT_KEY])) {
    elements.formatSelect.value = items[DATE_FORMAT_KEY];
    elements.customFormat.style.display = 'none';
  } else {
    elements.formatSelect.value = 'custom';
    elements.customFormat.value = items[DATE_FORMAT_KEY];
    elements.customFormat.style.display = 'block';
  }
  
  updatePreview();
  updateQuotaDisplay();

  // Listen for changes
  elements.pat.addEventListener('input', saveSettings);
  elements.relativeTime.addEventListener('change', saveSettings);
  elements.showHealth.addEventListener('change', saveSettings);
  elements.theme.addEventListener('change', saveSettings);
  
  elements.formatSelect.addEventListener('change', () => {
    if (elements.formatSelect.value === 'custom') {
      elements.customFormat.style.display = 'block';
    } else {
      elements.customFormat.style.display = 'none';
    }
    saveSettings();
  });
  
  elements.customFormat.addEventListener('input', saveSettings);
}

init();
