import { describe, expect, it } from 'vitest';
import { allowedTransitions, canTransition } from '../../src/domain/order-status.js';
import { fromCents, toCents } from '../../src/utils/money.js';

describe('money', () => {
  it.each([
    ['19.99', 1999],
    ['0.1', 10],
    ['5', 500],
    ['0.05', 5],
    ['9999999999.99', 999999999999],
  ])('toCents(%s) = %i', (amount, cents) => {
    expect(toCents(amount)).toBe(cents);
  });

  it.each([
    [1999, '19.99'],
    [5, '0.05'],
    [500, '5.00'],
    [0, '0.00'],
  ])('fromCents(%i) = %s', (cents, amount) => {
    expect(fromCents(cents)).toBe(amount);
  });

  it('round-trips without floating-point error', () => {
    expect(fromCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
    expect(fromCents(toCents('19.99') * 3)).toBe('59.97');
  });

  it('rejects malformed input', () => {
    expect(() => toCents('-1')).toThrow();
    expect(() => toCents('1.234')).toThrow();
    expect(() => fromCents(1.5)).toThrow();
    expect(() => fromCents(-1)).toThrow();
  });
});

describe('order status transitions', () => {
  it.each([
    ['pending', 'paid', true],
    ['pending', 'cancelled', true],
    ['paid', 'shipped', true],
    ['paid', 'cancelled', true],
    ['shipped', 'delivered', true],
    ['pending', 'shipped', false],
    ['shipped', 'cancelled', false],
    ['delivered', 'cancelled', false],
    ['cancelled', 'pending', false],
    ['pending', 'pending', false],
    ['unknown', 'paid', false],
  ])('%s → %s allowed: %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('marks delivered and cancelled as final', () => {
    expect(allowedTransitions('delivered')).toEqual([]);
    expect(allowedTransitions('cancelled')).toEqual([]);
  });
});
