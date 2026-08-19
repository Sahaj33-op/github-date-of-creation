if (typeof importScripts !== 'undefined') {
  try {
    importScripts('../constant/index.js');
  } catch {}
}

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

async function cleanCache() {
  const { [REPO_CACHE_KEY]: repoCache } = await chrome.storage.local.get({ [REPO_CACHE_KEY]: {} });
  const now = Date.now();
  let changed = false;

  for (const key of Object.keys(repoCache)) {
    if (repoCache[key].cached_at && now - repoCache[key].cached_at > CACHE_TTL_MS) {
      delete repoCache[key];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ [REPO_CACHE_KEY]: repoCache });
  }
}

chrome.runtime.onStartup.addListener(cleanCache);
chrome.runtime.onInstalled.addListener(cleanCache);

if (chrome.alarms) {
  chrome.alarms.create('cacheCleanup', { periodInMinutes: 1440 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cacheCleanup') cleanCache();
  });
}