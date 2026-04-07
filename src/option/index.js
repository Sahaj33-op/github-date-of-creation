/* global chrome, DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT, PAT_KEY, SETTINGS_KEY, DEFAULT_SETTINGS */

const elements = {
  pat: document.getElementById('pat'),
  relativeTime: document.getElementById('relativeTime'),
  showHealth: document.getElementById('showHealth'),
  formatSelect: document.getElementById('date-format-select'),
  customFormat: document.getElementById('custom-format'),
  previewText: document.getElementById('preview-text'),
  status: document.getElementById('status'),
};

/**
 * Utility: Simpler version of formatting for preview
 */
function formatPreview(createdDate, pushedDate, settings, dateFormat) {
  let createdStr = '';
  const now = new Date();
  
  if (settings.relativeTime) {
    createdStr = 'Created 4 years ago'; // Hardcoded for preview visual consistency
  } else {
    // Basic absolute format logic (simulating Intl.DateTimeFormat)
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    createdStr = `Created ${new Date('2021-06-24').toLocaleDateString(undefined, options)}`;
  }

  let healthStr = settings.showHealth ? ' • Last push 3 days ago' : '';
  
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
function saveSettings() {
  const settings = {
    relativeTime: elements.relativeTime.checked,
    showHealth: elements.showHealth.checked,
  };
  
  const dateFormat = elements.formatSelect.value === 'custom' 
    ? elements.customFormat.value 
    : elements.formatSelect.value;

  chrome.storage.sync.set({
    [PAT_KEY]: elements.pat.value,
    [SETTINGS_KEY]: settings,
    [DATE_FORMAT_KEY]: dateFormat,
  }, () => {
    showStatus();
    updatePreview();
  });
}

/**
 * Update Preview
 */
function updatePreview() {
  const settings = {
    relativeTime: elements.relativeTime.checked,
    showHealth: elements.showHealth.checked,
  };
  const dateFormat = elements.formatSelect.value === 'custom' 
    ? elements.customFormat.value 
    : elements.formatSelect.value;

  elements.previewText.textContent = formatPreview(null, null, settings, dateFormat);
}

/**
 * Initialize settings page
 */
function init() {
  chrome.storage.sync.get({
    [PAT_KEY]: '',
    [SETTINGS_KEY]: DEFAULT_SETTINGS,
    [DATE_FORMAT_KEY]: DEFAULT_DATE_FORMAT,
  }, (items) => {
    elements.pat.value = items[PAT_KEY];
    elements.relativeTime.checked = items[SETTINGS_KEY].relativeTime;
    elements.showHealth.checked = items[SETTINGS_KEY].showHealth;
    
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
  });

  // Listen for changes
  elements.pat.addEventListener('input', saveSettings);
  elements.relativeTime.addEventListener('change', saveSettings);
  elements.showHealth.addEventListener('change', saveSettings);
  
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
