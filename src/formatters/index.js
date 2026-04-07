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

// Export for Node environments (Vitest/Jest) but keep safe for browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getRelativeTime,
    formatAbsoluteDate,
    getLindyBadge
  };
}
