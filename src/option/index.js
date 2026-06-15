/* global chrome, DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT, PAT_KEY, SETTINGS_KEY, DEFAULT_SETTINGS, RATE_LIMIT_KEY */

const elements = {
  pat: document.getElementById('pat'),
  relativeTime: document.getElementById('relativeTime'),
  showHealth: document.getElementById('showHealth'),
  showSize: document.getElementById('showSize'),
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

function formatPreview(settings, dateFormat) {
  const dummyDate = new Date();
  dummyDate.setFullYear(dummyDate.getFullYear() - 4);

  const createdStr = settings.relativeTime
    ? `Created ${getRelativeTime(dummyDate.toISOString())}`
    : `Created ${formatAbsoluteDate(dummyDate.toISOString(), dateFormat)}`;
  const healthStr = settings.showHealth ? ' • Last push 2 days ago' : '';
  const sizeStr = settings.showSize ? ' • 1.5 MB' : '';

  return `${createdStr}${healthStr}${sizeStr}`;
}

function showStatus() {
  elements.status.classList.add('visible');
  setTimeout(() => elements.status.classList.remove('visible'), 2000);
}

async function saveSettings() {
  const settings = {
    relativeTime: elements.relativeTime.checked,
    showHealth: elements.showHealth.checked,
    showSize: elements.showSize.checked,
    theme: elements.theme.value,
  };

  const dateFormat =
    elements.formatSelect.value === 'custom'
      ? elements.customFormat.value
      : elements.formatSelect.value;

  await Promise.all([
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings, [DATE_FORMAT_KEY]: dateFormat }),
    chrome.storage.local.set({ [PAT_KEY]: elements.pat.value }),
  ]);

  showStatus();
  updatePreview();
}

function updatePreview() {
  const settings = {
    relativeTime: elements.relativeTime.checked,
    showHealth: elements.showHealth.checked,
    showSize: elements.showSize.checked,
    theme: elements.theme.value,
  };

  const dateFormat =
    elements.formatSelect.value === 'custom'
      ? elements.customFormat.value
      : elements.formatSelect.value;

  elements.previewText.textContent = formatPreview(settings, dateFormat);
  elements.previewBox.className = `preview-box preview-theme-${settings.theme}`;
}

async function updateQuotaDisplay() {
  if (!chrome.storage?.local) return;

  const { [RATE_LIMIT_KEY]: quota } = await chrome.storage.local.get({ [RATE_LIMIT_KEY]: null });

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
  elements.quotaBarFill.className = `quota-bar-fill${percent <= 20 ? ' critical' : percent <= 50 ? ' warning' : ''}`;

  if (quota.reset) {
    const minsLeft = Math.ceil((quota.reset - Date.now()) / 60000);
    elements.quotaReset.textContent = minsLeft > 0 ? `Resets in ${minsLeft}m` : 'Resets shortly';
  } else {
    elements.quotaReset.textContent = '';
  }
}

async function init() {
  const [items, localItems, syncItems] = await Promise.all([
    chrome.storage.sync.get({ [SETTINGS_KEY]: DEFAULT_SETTINGS, [DATE_FORMAT_KEY]: DEFAULT_DATE_FORMAT }),
    chrome.storage.local.get({ [PAT_KEY]: '' }),
    chrome.storage.sync.get({ [PAT_KEY]: '' }),
  ]);

  if (!localItems[PAT_KEY] && syncItems[PAT_KEY]) {
    elements.pat.value = syncItems[PAT_KEY];
    await chrome.storage.local.set({ [PAT_KEY]: syncItems[PAT_KEY] });
    await chrome.storage.sync.remove(PAT_KEY);
  } else {
    elements.pat.value = localItems[PAT_KEY] || '';
  }

  elements.relativeTime.checked = items[SETTINGS_KEY].relativeTime;
  elements.showHealth.checked = items[SETTINGS_KEY].showHealth;
  elements.showSize.checked =
    items[SETTINGS_KEY].showSize !== undefined ? items[SETTINGS_KEY].showSize : true;
  elements.theme.value = items[SETTINGS_KEY].theme || 'native';

  const options = Array.from(elements.formatSelect.options).map((o) => o.value);
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

  elements.pat.addEventListener('input', saveSettings);
  elements.relativeTime.addEventListener('change', saveSettings);
  elements.showHealth.addEventListener('change', saveSettings);
  elements.showSize.addEventListener('change', saveSettings);
  elements.theme.addEventListener('change', saveSettings);
  elements.customFormat.addEventListener('input', saveSettings);

  elements.formatSelect.addEventListener('change', () => {
    elements.customFormat.style.display =
      elements.formatSelect.value === 'custom' ? 'block' : 'none';
    saveSettings();
  });

  const clearCacheBtn = document.getElementById('clearCacheBtn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      try {
        await chrome.storage.local.remove([REPO_CACHE_KEY, RATE_LIMIT_KEY]);
        elements.status.textContent = 'Cache cleared successfully!';
        elements.status.className = 'status-badge status-success';
        elements.status.classList.add('visible');
        setTimeout(() => elements.status.classList.remove('visible'), 3000);
        updateQuotaDisplay();
      } catch {
        elements.status.textContent = 'Failed to clear cache';
        elements.status.className = 'status-badge status-danger';
        elements.status.classList.add('visible');
        setTimeout(() => elements.status.classList.remove('visible'), 3000);
      }
    });
  }
}

init();