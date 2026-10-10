// Exact money arithmetic. Amounts travel as decimal strings ("19.99"); calculations use integer
// cents so 0.1 + 0.2 style floating-point errors cannot affect order totals.

/** "19.99" → 1999. Accepts strings as returned by PostgreSQL numeric(12,2). */
export function toCents(amount) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount));
  if (!match) throw new Error(`Invalid money amount: ${amount}`);
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** 1999 → "19.99" */
export function fromCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Invalid cents value: ${cents}`);
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
