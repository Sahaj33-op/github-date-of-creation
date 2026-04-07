/* global chrome */
importScripts('../constant/index.js');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function handleBrowserActionClicked() {
  chrome.runtime.openOptionsPage();
}

/**
 * Clean up old cache entries
 */
async function cleanCache() {
  const response = await chrome.storage.local.get({ [URIS_KEY]: {} });
  const uris = response[URIS_KEY];
  const now = Date.now();
  let changed = false;

  for (const key in uris) {
    const entry = uris[key];
    // If entry has a timestamp (new format), check TTL. 
    // If it's old format (just string), we'll keep it for now but ideally add timestamp on next fetch.
    if (entry.cached_at && (now - entry.cached_at > CACHE_TTL_MS)) {
      delete uris[key];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ [URIS_KEY]: uris });
  }
}

chrome.action.onClicked.addListener(handleBrowserActionClicked);

// Run cleanup on startup
chrome.runtime.onStartup.addListener(cleanCache);
chrome.runtime.onInstalled.addListener(cleanCache);

// Also set up an alarm for periodic cleanup if the browser stays open
if (chrome.alarms) {
  chrome.alarms.create('cacheCleanup', { periodInMinutes: 1440 }); // Daily
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cacheCleanup') cleanCache();
  });
}
