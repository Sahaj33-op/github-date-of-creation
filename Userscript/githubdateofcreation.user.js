// ==UserScript==
// @name         GitHub Date of Creation
// @namespace    https://github.com/sizwinz
// @version      3.1.0
// @description  Display the date of creation, repository size, and maintenance status for GitHub repositories.
// @author       Sahaj
// @match        https://github.com/*
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/572909/GitHub%20Date%20of%20Creation.user.js
// @updateURL https://update.greasyfork.org/scripts/572909/GitHub%20Date%20of%20Creation.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const SETTINGS_KEY = 'gdc.settings';
    const URIS_KEY = 'gdc.uris';
    const PAT_KEY = 'gdc.pat';
    const DATE_FORMAT_KEY = 'gdc.date_format';
    const DEFAULT_SETTINGS = { relativeTime: true, showHealth: true, showSize: true };
    const DEFAULT_DATE_FORMAT = 'MMMM, YYYY';
    const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

    const cache = { data: GM_getValue(URIS_KEY, {}) };

    // --- Utilities ---
    function getRelativeTime(dateString) {
        if (!dateString) return 'unknown';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'unknown';
        const diffDays = Math.floor((Date.now() - date) / 86400000);
        if (diffDays < 1) return 'today';
        if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        const diffMonths = Math.floor(diffDays / 30);
        if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
        return `${Math.floor(diffMonths / 12)} year${Math.floor(diffMonths / 12) > 1 ? 's' : ''} ago`;
    }

    function formatAbsoluteDate(dateString, format) {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        const tokens = {
            YYYY: date.getFullYear(),
            YY: String(date.getFullYear()).slice(-2),
            MMMM: date.toLocaleDateString('en-US', { month: 'long' }),
            MMM: date.toLocaleDateString('en-US', { month: 'short' }),
            MM: String(date.getMonth() + 1).padStart(2, '0'),
            M: date.getMonth() + 1,
            DD: String(date.getDate()).padStart(2, '0'),
            D: date.getDate(),
        };
        return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g, (match) => {
            const v = tokens[match];
            return v !== undefined ? String(v) : match;
        });
    }

    function getLindyBadge(dateString) {
        const years = (Date.now() - new Date(dateString)) / 31557600000;
        if (years < 1) return { icon: '🌱', label: 'Sprout' };
        if (years > 10) return { icon: '🏛️', label: 'Ancient' };
        if (years > 5) return { icon: '🌳', label: 'Mature' };
        return { icon: '🌿', label: 'Established' };
    }

    function getHealthStatus(pushedAtString) {
        if (!pushedAtString) return { label: 'Unknown', color: '#8b949e', icon: '❓' };
        const diffDays = (Date.now() - new Date(pushedAtString)) / 86400000;
        if (diffDays <= 30) return { label: 'Active', color: '#3fb950', icon: '⚡' };
        if (diffDays <= 180) return { label: 'Stable', color: '#58a6ff', icon: '✅' };
        if (diffDays <= 730) return { label: 'Dormant', color: '#d29922', icon: '💤' };
        return { label: 'Legacy', color: '#f85149', icon: '⚠️' };
    }

    function formatSize(kbSize) {
        if (kbSize === undefined || kbSize === null || isNaN(Number(kbSize))) return null;
        const kb = Number(kbSize);
        if (kb < 1024) return `${kb} KB`;
        const mb = kb / 1024;
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(1)} GB`;
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
            try { timeStr = `last push was ${getRelativeTime(pushedAt)}`; } catch {}
        }
        if (clean.includes('active')) return `Active updates (${timeStr}). Under active and rapid development.`;
        if (clean.includes('stable')) return `Stable updates (${timeStr}). Maintained and responsive to bugs.`;
        if (clean.includes('dormant')) return `Dormant updates (${timeStr}). Development has slowed, code is stable.`;
        if (clean.includes('legacy')) return `Legacy project (${timeStr}). Unmaintained, proceed with caution.`;
        return 'Maintenance frequency classification based on commit history.';
    }

    // --- Network & Cache ---
    async function fetchRepoData(owner, repo) {
        const cacheKey = `${owner}/${repo}`;
        const cached = cache.data[cacheKey];
        if (cached?.created_at && cached.cached_at && Date.now() - cached.cached_at < CACHE_TTL_MS) {
            return cached;
        }

        const pat = GM_getValue(PAT_KEY, '');
        const headers = pat ? { Authorization: `token ${pat}` } : {};

        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'API_ERROR');

        const data = await res.json();
        const result = {
            created_at: data.created_at,
            pushed_at: data.pushed_at,
            size: data.size,
            cached_at: Date.now(),
        };
        cache.data[cacheKey] = result;
        GM_setValue(URIS_KEY, cache.data);
        return result;
    }

    function deleteCacheEntry(cacheKey) {
        if (cache.data?.[cacheKey]) {
            delete cache.data[cacheKey];
            GM_setValue(URIS_KEY, cache.data);
        }
    }

    function clearAllCache() {
        cache.data = {};
        GM_setValue(URIS_KEY, {});
    }

    let globalTooltip = null;

    function getTooltip() {
        if (globalTooltip) return globalTooltip;
        globalTooltip = document.createElement('div');
        globalTooltip.id = 'gdc-userscript-tooltip';
        globalTooltip.style.cssText =
            'position:fixed;z-index:999999;background:rgba(22,27,34,0.95);backdrop-filter:blur(10px);' +
            'border:1px solid #30363d;border-radius:8px;color:#c9d1d9;padding:12px 16px;' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;' +
            'font-size:13px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,0.5);' +
            'pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity 0.2s,transform 0.2s;min-width:220px;';
        document.body.appendChild(globalTooltip);
        return globalTooltip;
    }

    function positionTooltip(e, tooltip) {
        const margin = 12;
        let x = e.clientX + margin;
        let y = e.clientY + margin;
        const rect = tooltip.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - margin;
        if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - margin;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
    }

    // --- Injection ---
    async function injectToRepoPage() {
        const parts = window.location.pathname.split('/').filter(Boolean);
        if (parts.length !== 2) return;

        const [owner, repo] = parts;
        const cacheKey = `${owner}/${repo}`;

        try {
            const data = await fetchRepoData(owner, repo);
            const settings = GM_getValue(SETTINGS_KEY, DEFAULT_SETTINGS);
            const dateFormat = GM_getValue(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT);

            const createdStr = settings.relativeTime
                ? `Created ${getRelativeTime(data.created_at)}`
                : `Created ${formatAbsoluteDate(data.created_at, dateFormat)}`;
            const healthStr = settings.showHealth && data.pushed_at ? ` • Last push ${getRelativeTime(data.pushed_at)}` : '';
            const sizeStr = settings.showSize && data.size !== undefined ? ` • ${formatSize(data.size)}` : '';
            const lindy = getLindyBadge(data.created_at);

            const aboutSelectors = [
                '[data-testid="about-section"]',
                '.Layout-sidebar [data-testid="about-section"]',
                '.Layout-sidebar .BorderGrid-cell',
                '.repository-sidebar .BorderGrid-cell',
                'div[itemprop="about"]',
                '[data-testid="repository-details-sidebar"] > div',
                '.Box--full .BorderGrid-cell',
            ];

            let aboutCell = null;
            for (const sel of aboutSelectors) {
                try {
                    aboutCell = document.querySelector(sel);
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
                    '.Layout-sidebar', '.repository-sidebar', '.Box--full', 'aside', '[class*="sidebar"]',
                ];
                for (const sel of sidebarSelectors) {
                    try {
                        aboutCell = document.querySelector(sel);
                        if (aboutCell?.offsetParent !== null) break;
                    } catch {}
                }
            }

            if (!aboutCell || aboutCell.querySelector('#gdc-injected') || document.querySelector('#gdc-injected')) return;

            const wrapper = document.createElement('div');
            wrapper.id = 'gdc-injected';
            wrapper.style.cssText =
                'border-top:1px solid var(--color-border-muted,#30363d);padding-top:16px;margin-top:16px;animation:fadeIn 0.5s ease-in-out;';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:flex-start;gap:12px;';

            const iconSpan = document.createElement('span');
            iconSpan.style.cssText = 'font-size:28px;line-height:1;';
            iconSpan.textContent = lindy.icon;

            const textCol = document.createElement('div');
            textCol.style.cssText = 'flex:1;';

            const statusLine = document.createElement('div');
            statusLine.style.cssText = 'font-weight:600;font-size:14px;color:var(--color-fg-default);';
            statusLine.textContent = `${createdStr}${healthStr}${sizeStr}`;

            const refreshBtn = document.createElement('span');
            refreshBtn.textContent = '↻';
            refreshBtn.title = 'Refresh repo data';
            refreshBtn.style.cssText =
                'font-size:14px;cursor:pointer;opacity:0.5;margin-left:8px;vertical-align:middle;display:inline-block;transition:opacity 0.2s,transform 0.2s;';
            refreshBtn.addEventListener('mouseenter', () => { refreshBtn.style.opacity = '1'; refreshBtn.style.transform = 'rotate(90deg)'; });
            refreshBtn.addEventListener('mouseleave', () => { refreshBtn.style.opacity = '0.5'; refreshBtn.style.transform = 'rotate(0deg)'; });
            refreshBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                refreshBtn.style.transform = 'rotate(360deg)';
                refreshBtn.style.transition = 'transform 0.5s';
                deleteCacheEntry(cacheKey);
                wrapper.remove();
                await injectToRepoPage();
            });
            statusLine.appendChild(refreshBtn);

            const maturityLine = document.createElement('div');
            maturityLine.style.cssText = 'font-size:13px;color:var(--color-fg-muted);margin-top:2px;';
            maturityLine.innerHTML = `Project Maturity: <strong>${lindy.label}</strong>`;

            textCol.appendChild(statusLine);
            textCol.appendChild(maturityLine);
            row.appendChild(iconSpan);
            row.appendChild(textCol);
            wrapper.appendChild(row);

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
                    ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;gap:16px;"><span style="color:#8b949e;">Repo Size:</span><span style="font-weight:500;color:#c9d1d9;">${sizeLabel}</span></div>`
                    : '';

                tooltip.innerHTML = `
                    <div style="font-weight:600;font-size:14px;color:#f0f6fc;margin-bottom:8px;border-bottom:1px solid #30363d;padding-bottom:4px;">${owner}/${repo} Insights</div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;gap:16px;"><span style="color:#8b949e;">Created:</span><span style="font-weight:500;color:#c9d1d9;">${exactCreated}</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:${sizeLabel ? '4px' : '8px'};gap:16px;"><span style="color:#8b949e;">Last Push:</span><span style="font-weight:500;color:#c9d1d9;">${exactPushed}</span></div>
                    ${sizeRow}
                    <div style="display:flex;justify-content:space-between;border-top:1px solid #30363d;padding-top:8px;gap:16px;"><span style="color:#8b949e;">Maturity:</span><span style="font-weight:500;color:#c9d1d9;">${lindy.icon} ${lindy.label}</span></div>
                    <div style="font-size:11px;color:#8b949e;margin-bottom:8px;margin-top:-2px;line-height:1.3;">${getLindyExplanation(lindy.label)}</div>
                    <div style="display:flex;justify-content:space-between;border-top:1px solid #30363d;padding-top:8px;margin-top:4px;gap:16px;"><span style="color:#8b949e;">Maintenance:</span><span style="font-weight:bold;color:${health.color};">${health.icon} ${health.label}</span></div>
                    <div style="font-size:11px;color:#8b949e;margin-top:-2px;line-height:1.3;">${getHealthExplanation(health.label, data.pushed_at)}</div>
                `;
                tooltip.style.opacity = '1';
                tooltip.style.transform = 'translateY(0)';
                positionTooltip(e, tooltip);
            });

            wrapper.addEventListener('mousemove', (e) => {
                const tooltip = getTooltip();
                positionTooltip(e, tooltip);
            });

            wrapper.addEventListener('mouseleave', () => {
                const tooltip = getTooltip();
                tooltip.style.opacity = '0';
                tooltip.style.transform = 'translateY(6px)';
            });

            const target = aboutCell.querySelector('p.f4') || aboutCell.querySelector('h2') || aboutCell.querySelector('[role="heading"]');
            if (target) target.insertAdjacentElement('afterend', wrapper);
            else aboutCell.insertAdjacentElement('afterbegin', wrapper);
        } catch (err) {
            if (err.message === 'RATE_LIMIT_EXCEEDED') {
                const sidebar = document.querySelector('.Layout-sidebar, [data-testid="repository-details-sidebar"]');
                if (sidebar) {
                    const cell = sidebar.querySelector('.BorderGrid-cell, [data-testid="about-section"]');
                    if (cell && !cell.querySelector('.gdc-error')) {
                        const errDiv = document.createElement('div');
                        errDiv.className = 'gdc-error';
                        errDiv.style.cssText = 'color:var(--color-fg-danger,#cf222e);font-size:12px;margin-top:4px;';
                        errDiv.textContent = 'Rate limit exceeded. Add a PAT in settings.';
                        cell.appendChild(errDiv);
                    }
                }
            }
        }
    }

    async function injectToSearchResults() {
        const repoItems = Array.from(
            document.querySelectorAll('.repo-list-item, .Box-row, [data-testid="results-list"] > div, .list-style-none > li')
        );
        if (!repoItems.length) return;

        const settings = GM_getValue(SETTINGS_KEY, DEFAULT_SETTINGS);
        const dateFormat = GM_getValue(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT);
        const pat = GM_getValue(PAT_KEY, '');
        let fetchCount = 0;

        for (const item of repoItems) {
            if (item.querySelector('.gdc-search-injected')) continue;

            const link = item.querySelector(
                'a[href*="/"][data-hydro-click*="RESULT"], h3 a, h2 a, a.v-align-middle, a[data-testid="results-list-item-path"]'
            );
            if (!link) continue;

            const parts = link.getAttribute('href').split('/').filter(Boolean);
            if (parts.length < 2) continue;

            const [owner, repo] = parts;
            const cacheKey = `${owner}/${repo}`;
            const isCached = !!(cache.data[cacheKey]?.created_at);

            if (!pat && !isCached && fetchCount >= 5) continue;
            if (!isCached) fetchCount++;

            const marker = document.createElement('span');
            marker.className = 'gdc-search-injected';
            item.appendChild(marker);

            fetchRepoData(owner, repo).then(data => {
                const lindy = getLindyBadge(data.created_at);
                const createdStr = settings.relativeTime
                    ? getRelativeTime(data.created_at)
                    : formatAbsoluteDate(data.created_at, dateFormat);
                const target = item.querySelector('.f6.color-fg-muted, .text-small.color-fg-muted, .color-fg-subtle');

                const wrapper = document.createElement('span');
                wrapper.className = 'mr-3 gdc-injected-search-label d-inline-flex flex-items-center';
                wrapper.style.cssText = 'gap:4px;margin-right:12px;vertical-align:middle;';
                wrapper.title = `Created on ${new Date(data.created_at).toLocaleDateString()}`;
                wrapper.innerHTML = `
                    <span style="font-size:14px;">${lindy.icon}</span>
                    <svg height="14" class="octicon octicon-calendar" viewBox="0 0 16 16" width="14" aria-hidden="true" style="fill:currentColor;opacity:0.7;"><path fill-rule="evenodd" d="M13 2h-1v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H6v1.5c0 .28-.22.5-.5.5h-2c-.28 0-.5-.22-.5-.5V2H2c-.55 0-1 .45-1 1v11c0 .55.45 1 1 1h11c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1zm0 12H2V5h11v9zM5 3H4V1h1v2zm6 0h-1V1h1v2z"/></svg>
                    <span style="font-size:12px;">Created ${createdStr}</span>
                `;

                if (target) target.insertAdjacentElement('afterbegin', wrapper);
                else {
                    const row = document.createElement('div');
                    row.className = 'mt-1 text-small color-fg-subtle';
                    row.appendChild(wrapper);
                    item.appendChild(row);
                }
            }).catch(() => {});
        }
    }

    // --- Settings Modal ---
    GM_addStyle(`
        #gdc-settings-overlay {
            position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);
            display:flex;justify-content:center;align-items:center;z-index:999999;backdrop-filter:blur(4px);
        }
        #gdc-settings-modal {
            background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;width:420px;
            max-width:90vw;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
            box-shadow:0 10px 30px rgba(0,0,0,0.5);max-height:90vh;overflow-y:auto;
        }
        #gdc-settings-modal h2 {
            margin:0 0 16px 0;font-size:18px;border-bottom:1px solid #30363d;padding-bottom:12px;
            display:flex;justify-content:space-between;align-items:center;
        }
        .gdc-close-btn { cursor:pointer;color:#8b949e;font-size:20px;line-height:1;background:none;border:none;padding:0; }
        .gdc-close-btn:hover { color:#c9d1d9; }
        .gdc-group { margin-bottom:16px; }
        .gdc-group label.bl { display:block;font-size:13px;font-weight:600;margin-bottom:6px; }
        .gdc-desc { font-size:12px;color:#8b949e;margin-bottom:8px; }
        .gdc-input,.gdc-select { width:100%;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:8px 12px;border-radius:6px;box-sizing:border-box; }
        .gdc-input:focus,.gdc-select:focus { outline:none;border-color:#0969da; }
        .gdc-cb { display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:8px;cursor:pointer; }
        .gdc-save-btn { width:100%;background:#238636;color:white;border:none;padding:8px;border-radius:6px;font-weight:600;cursor:pointer;margin-top:8px; }
        .gdc-save-btn:hover { background:#2ea043; }
        .gdc-danger-btn { width:100%;background:#f85149;color:white;border:none;padding:8px;border-radius:6px;font-weight:600;cursor:pointer;margin-top:8px; }
        .gdc-danger-btn:hover { background:#da3633; }
    `);

    function openSettings() {
        if (document.getElementById('gdc-settings-overlay')) return;

        const s = GM_getValue(SETTINGS_KEY, DEFAULT_SETTINGS);
        const pat = GM_getValue(PAT_KEY, '');
        const fmt = GM_getValue(DATE_FORMAT_KEY, DEFAULT_DATE_FORMAT);

        const overlay = document.createElement('div');
        overlay.id = 'gdc-settings-overlay';
        overlay.innerHTML = `
            <div id="gdc-settings-modal">
                <h2><span>⚙️ GitHub Date of Creation</span><button class="gdc-close-btn" id="gdc-close-btn">&times;</button></h2>

                <div class="gdc-group">
                    <label class="bl">Personal Access Token</label>
                    <div class="gdc-desc">Bypass API limits (60 req/hr). No scopes needed.</div>
                    <input type="text" id="gdc-pat-input" class="gdc-input" value="${pat}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
                </div>

                <div class="gdc-group">
                    <label class="bl">Features</label>
                    <label class="gdc-cb"><input type="checkbox" id="gdc-relative-check" ${s.relativeTime ? 'checked' : ''}> Use relative time</label>
                    <label class="gdc-cb"><input type="checkbox" id="gdc-health-check" ${s.showHealth ? 'checked' : ''}> Show last push status</label>
                    <label class="gdc-cb"><input type="checkbox" id="gdc-size-check" ${s.showSize !== false ? 'checked' : ''}> Show repository size</label>
                </div>

                <div class="gdc-group">
                    <label class="bl">Absolute Date Format</label>
                    <select id="gdc-format-select" class="gdc-select">
                        <option value="MMMM, YYYY">Full Month, YYYY</option>
                        <option value="MMM D, YYYY">MMM D, YYYY</option>
                        <option value="YYYY-MM-DD">ISO Format</option>
                        <option value="DD/MM/YYYY">European</option>
                        <option value="custom">Custom...</option>
                    </select>
                    <input type="text" id="gdc-custom-format" class="gdc-input" style="display:none;margin-top:8px;" value="${fmt}" placeholder="e.g. YYYY-MM">
                </div>

                <button class="gdc-save-btn" id="gdc-save-btn">Save Settings</button>
                <button class="gdc-danger-btn" id="gdc-clear-cache-btn">Clear All Cache</button>
            </div>
        `;
        document.body.appendChild(overlay);

        const select = document.getElementById('gdc-format-select');
        const customInput = document.getElementById('gdc-custom-format');
        if (Array.from(select.options).some(o => o.value === fmt)) {
            select.value = fmt;
        } else {
            select.value = 'custom';
            customInput.style.display = 'block';
        }
        select.addEventListener('change', () => {
            customInput.style.display = select.value === 'custom' ? 'block' : 'none';
        });

        document.getElementById('gdc-close-btn').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        document.getElementById('gdc-save-btn').onclick = () => {
            GM_setValue(PAT_KEY, document.getElementById('gdc-pat-input').value.trim());
            GM_setValue(SETTINGS_KEY, {
                relativeTime: document.getElementById('gdc-relative-check').checked,
                showHealth: document.getElementById('gdc-health-check').checked,
                showSize: document.getElementById('gdc-size-check').checked,
            });
            GM_setValue(DATE_FORMAT_KEY, select.value === 'custom' ? customInput.value : select.value);
            overlay.remove();
            // Remove injected badges so they re-render with new settings
            document.querySelectorAll('#gdc-injected, .gdc-error').forEach(el => el.remove());
            processPage();
        };

        document.getElementById('gdc-clear-cache-btn').onclick = () => {
            clearAllCache();
            document.querySelectorAll('#gdc-injected, .gdc-error, .gdc-search-injected').forEach(el => el.remove());
            overlay.remove();
            processPage();
        };
    }

    GM_registerMenuCommand('⚙️ Settings', openSettings);

    // --- Observer ---
    let debounceTimer;
    function processPage() {
        const path = window.location.pathname;
        if (path.split('/').filter(Boolean).length >= 2) injectToRepoPage();
        if (path.includes('/search') || path.includes('/trending')) injectToSearchResults();
    }

    const domObserver = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => requestAnimationFrame(processPage), 250);
    });

    processPage();
    domObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('pjax:end', processPage);
    document.addEventListener('turbo:load', processPage);

    // --- Cache cleanup on load ---
    (function cleanupCache() {
        const now = Date.now();
        let changed = false;
        for (const key in cache.data) {
            if (now - (cache.data[key].cached_at || 0) > CACHE_TTL_MS) {
                delete cache.data[key];
                changed = true;
            }
        }
        if (changed) GM_setValue(URIS_KEY, cache.data);
    })();

    // Inject fade-in keyframes
    const styleSheet = document.createElement('style');
    styleSheet.textContent = '@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(styleSheet);
})();