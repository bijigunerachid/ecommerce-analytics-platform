// Display formatting. Money arrives from the API as decimal strings ("1299.00").

export const CURRENCY = import.meta.env.VITE_CURRENCY || 'EUR';
const LOCALE = undefined; // the browser's locale

const moneyFull = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const moneyCompact = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

export function formatMoney(value, { compact: useCompact = false } = {}) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return '—';
  return useCompact && Math.abs(n) >= 10_000 ? moneyCompact.format(n) : moneyFull.format(n);
}

const moneyTick = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 0,
});

/** Axis ticks: compact whole amounts for every value, so the axis reads consistently. */
export function formatMoneyTick(value) {
  return moneyTick.format(Number(value));
}

const INTERVAL_MS = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000 };

/** True when a bucket has not finished yet (its totals are still growing). */
export function isBucketInProgress(iso, interval, now = Date.now()) {
  return Date.parse(iso) + (INTERVAL_MS[interval] ?? 0) > now;
}

export function formatNumber(value, { compact: useCompact = false } = {}) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return '—';
  return useCompact && Math.abs(n) >= 1_000 ? compact.format(n) : integer.format(n);
}

/** 12.5 → "12.5%" */
export function formatPercent(value, { signed = false } = {}) {
  if (value === null || value === undefined) return '—';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(1).replace(/\.0$/, '')}%`;
}

const DATE = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const DATE_SHORT = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const HOUR = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** Labels for chart buckets. Buckets are UTC; display them in UTC so days don't shift. */
export function formatBucket(iso, interval) {
  const d = new Date(iso);
  if (interval === 'hour') return `${DATE_SHORT.format(d)} ${HOUR.format(d)}`;
  if (interval === 'week') return `Week of ${DATE_SHORT.format(d)}`;
  return DATE_SHORT.format(d);
}

export function formatAxisDate(iso, interval) {
  const d = new Date(iso);
  return interval === 'hour' ? HOUR.format(d) : DATE_SHORT.format(d);
}

/** "2026-03-07" → "7 Mar 2026" */
export function formatDay(isoDay) {
  return DATE.format(new Date(`${isoDay}T00:00:00Z`));
}

/** Absolute local date-time, e.g. for "updated at". */
export function formatDateTime(iso) {
  return iso ? DATE_TIME.format(new Date(iso)) : '—';
}

/** "3 minutes ago" style relative time. */
export function formatRelative(iso, now = Date.now()) {
  if (!iso) return 'never';
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const MONTH = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });

/** UTC month of a timestamp: "Mar 2026", or "Mar" with `short`. */
export function formatMonth(iso, { short = false } = {}) {
  return (short ? MONTH_SHORT : MONTH).format(new Date(iso));
}

/** The configured currency's symbol, e.g. "€" (for input prefixes). */
export function currencySymbol() {
  return (
    new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? CURRENCY
  );
}
