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
 * Utility: Absolute time formatting (Token Replacement)
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

  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g, (matched) => {
    const key = matched.toUpperCase();
    return map[key] !== undefined ? map[key] : matched;
  });
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
 * Utility: Repository Health Classification
 */
function getHealthStatus(pushedAtString) {
  if (!pushedAtString) return { label: 'Unknown', color: '#8b949e', icon: '❓' };
  const date = new Date(pushedAtString);
  if (isNaN(date.getTime())) return { label: 'Unknown', color: '#8b949e', icon: '❓' };
  
  const diffInMs = new Date() - date;
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
  
  if (diffInDays <= 30) {
    return { label: 'Active', color: '#3fb950', icon: '⚡' };
  } else if (diffInDays <= 180) {
    return { label: 'Stable', color: '#58a6ff', icon: '✅' };
  } else if (diffInDays <= 730) {
    return { label: 'Dormant', color: '#d29922', icon: '💤' };
  } else {
    return { label: 'Legacy', color: '#f85149', icon: '⚠️' };
  }
}

/**
 * Utility: Size conversion (KB to MB/GB)
 */
function formatSize(kbSize) {
  if (kbSize === undefined || kbSize === null || isNaN(Number(kbSize))) return 'unknown';
  const kb = Number(kbSize);
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

// Export for Node environments (Vitest/Jest) but keep safe for browser
if (typeof exports !== 'undefined') {
  exports.getRelativeTime = getRelativeTime;
  exports.formatAbsoluteDate = formatAbsoluteDate;
  exports.getLindyBadge = getLindyBadge;
  exports.getHealthStatus = getHealthStatus;
  exports.formatSize = formatSize;
}
