import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRelativeTime, formatAbsoluteDate, getLindyBadge } from './index.js';

describe('Formatters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set a predictable mock date: "2024-01-01T12:00:00.000Z"
    vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRelativeTime', () => {
    it('returns "unknown" for invalid dates', () => {
      expect(getRelativeTime('')).toBe('unknown');
      expect(getRelativeTime('invalid-date')).toBe('unknown');
    });

    it('returns "today" for dates less than 1 day old', () => {
      expect(getRelativeTime('2024-01-01T10:00:00.000Z')).toBe('today');
    });

    it('returns "X days ago" for dates less than 30 days old', () => {
      expect(getRelativeTime('2023-12-31T12:00:00.000Z')).toBe('1 day ago');
      expect(getRelativeTime('2023-12-20T12:00:00.000Z')).toBe('12 days ago');
    });

    it('returns "X months ago" for dates less than 12 months old', () => {
      expect(getRelativeTime('2023-11-20T12:00:00.000Z')).toBe('1 month ago');
      expect(getRelativeTime('2023-08-01T12:00:00.000Z')).toBe('5 months ago');
    });

    it('returns "X years ago" for dates beyond 12 months', () => {
      expect(getRelativeTime('2022-12-01T12:00:00.000Z')).toBe('1 year ago');
      expect(getRelativeTime('2020-01-01T12:00:00.000Z')).toBe('4 years ago');
    });
  });

  describe('formatAbsoluteDate', () => {
    it('handles invalid dates gracefully', () => {
      expect(formatAbsoluteDate('invalid', 'YYYY')).toBe('invalid');
    });

    it('formats single tokens correctly', () => {
      expect(formatAbsoluteDate('2024-06-05T12:00:00.000Z', 'YYYY')).toBe('2024');
      expect(formatAbsoluteDate('2024-06-05T12:00:00.000Z', 'YY')).toBe('24');
      expect(formatAbsoluteDate('2024-06-05T12:00:00.000Z', 'MM')).toBe('06');
      expect(formatAbsoluteDate('2024-06-05T12:00:00.000Z', 'M')).toBe('6');
      expect(formatAbsoluteDate('2024-06-05T12:00:00.000Z', 'DD')).toBe('05');
      expect(formatAbsoluteDate('2024-06-05T12:00:00.000Z', 'D')).toBe('5');
    });

    it('handles complex format string and keeps unrelated text untouched', () => {
      const date = '2024-06-05T12:00:00.000Z';
      const format = 'Created on MMM D, YYYY';
      // MMMM/MMM depend on locale string, so we'll mock or just do a basic test.
      // E.g., Jun 5, 2024
      const result = formatAbsoluteDate(date, format);
      expect(result).toMatch(/Created on (Jun|June) 5, 2024/);
    });

    it('respects exact casing correctly due to dropped "i" flag', () => {
      // With 'i' flag dropped, 'dd' or 'd' inside 'Created on' should NOT match replacement regex
      const result = formatAbsoluteDate('2024-06-05T12:00:00.000Z', 'Created on');
      expect(result).toBe('Created on');
    });
  });

  describe('getLindyBadge', () => {
    it('categorizes Sprout (< 1 year)', () => {
      expect(getLindyBadge('2023-06-01T12:00:00.000Z').label).toBe('Sprout');
    });

    it('categorizes Established (> 1 year)', () => {
      expect(getLindyBadge('2022-01-01T12:00:00.000Z').label).toBe('Established');
    });

    it('categorizes Mature (> 5 years)', () => {
      expect(getLindyBadge('2018-01-01T12:00:00.000Z').label).toBe('Mature');
    });

    it('categorizes Ancient (> 10 years)', () => {
      expect(getLindyBadge('2012-01-01T12:00:00.000Z').label).toBe('Ancient');
    });
  });
});
