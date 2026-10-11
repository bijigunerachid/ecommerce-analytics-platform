import { describe, expect, it } from 'vitest';
import { presetRange } from '../hooks/useDateRange.js';
import {
  formatBucket,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
} from './format.js';

describe('formatting', () => {
  it('formats money from decimal strings, compacting large values only when asked', () => {
    expect(formatMoney('1299.00')).toMatch(/1,?299\.00/);
    expect(formatMoney('128450.75', { compact: true })).toMatch(/128\.5K/);
    expect(formatMoney('950.50', { compact: true })).toMatch(/950\.50/);
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney('abc')).toBe('—');
  });

  it('formats counts and percentages', () => {
    expect(formatNumber(1520)).toMatch(/1,?520/);
    expect(formatNumber(15200, { compact: true })).toBe('15.2K');
    expect(formatPercent(12.5)).toBe('12.5%');
    expect(formatPercent(6)).toBe('6%');
    expect(formatPercent(3.2, { signed: true })).toBe('+3.2%');
    expect(formatPercent(-3.2, { signed: true })).toBe('-3.2%');
    expect(formatPercent(null)).toBe('—');
  });

  it('labels UTC buckets without shifting the day', () => {
    // Midnight UTC must stay the same calendar day regardless of the machine's time zone.
    expect(formatBucket('2026-03-01T00:00:00.000Z', 'day')).toMatch(/1/);
    expect(formatBucket('2026-03-01T00:00:00.000Z', 'day')).toMatch(/Mar/);
    expect(formatBucket('2026-03-02T00:00:00.000Z', 'week')).toMatch(/^Week of /);
    // The clock style follows the viewer's locale (14:00 or 02:00 PM); the hour must be 14 UTC.
    expect(formatBucket('2026-03-01T14:00:00.000Z', 'hour')).toMatch(/14:00|0?2:00\s?PM/i);
  });

  it('describes relative times', () => {
    const now = Date.parse('2026-03-11T10:00:00Z');
    expect(formatRelative('2026-03-11T09:59:58Z', now)).toBe('just now');
    expect(formatRelative('2026-03-11T09:57:00Z', now)).toBe('3 min ago');
    expect(formatRelative('2026-03-11T07:00:00Z', now)).toBe('3 h ago');
    expect(formatRelative(null, now)).toBe('never');
  });
});

describe('presetRange', () => {
  it('returns an inclusive UTC range ending today', () => {
    const today = new Date('2026-03-11T15:00:00Z');
    expect(presetRange('7d', today)).toEqual({ from: '2026-03-05', to: '2026-03-11' });
    expect(presetRange('30d', today)).toEqual({ from: '2026-02-10', to: '2026-03-11' });
    expect(presetRange('nonsense', today)).toEqual({ from: '2026-02-10', to: '2026-03-11' });
  });
});
