import { describe, expect, it } from 'vitest';
import { customerSegment, restockAdvice } from '../../src/services/insights.service.js';

const NOW = new Date('2026-06-30T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('customerSegment', () => {
  it.each([
    [0, null, 'prospect'],
    [1, daysAgo(3), 'new'],
    [3, daysAgo(3), 'returning'],
    [4, daysAgo(3), 'loyal'],
    [10, daysAgo(91), 'lapsed'],
    [1, daysAgo(90), 'new'],
  ])('%i net orders, last %s → %s', (netOrders, lastOrderAt, expected) => {
    expect(customerSegment({ netOrders, lastOrderAt }, NOW)).toBe(expected);
  });
});

describe('restockAdvice', () => {
  it('targets 30 days of sales on top of the reorder level', () => {
    // 60 units in 30 days = 2/day; target 2 × 30 + 10 = 70; stock 20 → order 50.
    expect(restockAdvice({ stock: 20, reorderLevel: 10, recentUnits: 60 })).toEqual({
      dailyUnits: 2,
      daysOfCover: 10,
      targetStock: 70,
      suggestedQuantity: 50,
      needsRestock: true,
    });
  });

  it('suggests nothing when stock covers the target', () => {
    expect(restockAdvice({ stock: 200, reorderLevel: 10, recentUnits: 30 })).toMatchObject({
      daysOfCover: 200,
      suggestedQuantity: 0,
      needsRestock: false,
    });
  });

  it('has no cover figure without recent sales, but still protects the reorder level', () => {
    expect(restockAdvice({ stock: 3, reorderLevel: 5, recentUnits: 0 })).toEqual({
      dailyUnits: 0,
      daysOfCover: null,
      targetStock: 5,
      suggestedQuantity: 2,
      needsRestock: true,
    });
  });
});
