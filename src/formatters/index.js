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
 * Utility: Historical context
 */
function getHistoricalContext(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const milestones = [
    { year: 2013, label: 'React 0.3' },
    { year: 2009, label: 'Node.js' },
    { year: 2015, label: 'ES6' },
    { year: 2016, label: 'Next.js' },
    { year: 2010, label: 'AngularJS' },
    { year: 2014, label: 'Vue.js' },
  ];
  const relevant = milestones.find(m => m.year === year);
  return relevant ? `Created around the time ${relevant.label} launched!` : null;
}
