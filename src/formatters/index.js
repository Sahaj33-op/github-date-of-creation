function getRelativeTime(dateString) {
  if (!dateString) return 'unknown';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'unknown';

  const diffDays = Math.floor((Date.now() - date) / 86400000);
  if (diffDays < 1) return 'today';
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
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
    const value = tokens[match];
    return value !== undefined ? String(value) : match;
  });
}

function getLindyBadge(dateString) {
  const years = (Date.now() - new Date(dateString)) / (31557600000);
  if (years < 1) return { icon: '🌱', label: 'Sprout' };
  if (years > 10) return { icon: '🏛️', label: 'Ancient' };
  if (years > 5) return { icon: '🌳', label: 'Mature' };
  return { icon: '🌿', label: 'Established' };
}

function getHealthStatus(pushedAtString) {
  if (!pushedAtString) return { label: 'Unknown', color: '#8b949e', icon: '❓' };

  const date = new Date(pushedAtString);
  if (isNaN(date.getTime())) return { label: 'Unknown', color: '#8b949e', icon: '❓' };

  const diffDays = (Date.now() - date) / 86400000;

  if (diffDays <= 30) return { label: 'Active', color: '#3fb950', icon: '⚡' };
  if (diffDays <= 180) return { label: 'Stable', color: '#58a6ff', icon: '✅' };
  if (diffDays <= 730) return { label: 'Dormant', color: '#d29922', icon: '💤' };
  return { label: 'Legacy', color: '#f85149', icon: '⚠️' };
}

function formatSize(kbSize) {
  if (kbSize === undefined || kbSize === null || isNaN(Number(kbSize))) return 'unknown';
  const kb = Number(kbSize);
  if (kb < 1024) return `${kb} KB`;

  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;

  return `${(mb / 1024).toFixed(1)} GB`;
}

if (typeof exports !== 'undefined') {
  exports.getRelativeTime = getRelativeTime;
  exports.formatAbsoluteDate = formatAbsoluteDate;
  exports.getLindyBadge = getLindyBadge;
  exports.getHealthStatus = getHealthStatus;
  exports.formatSize = formatSize;
}