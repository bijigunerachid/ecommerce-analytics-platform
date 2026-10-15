import { describe, expect, it } from 'vitest';
import { topWithOther } from './top-with-other.js';

const cat = (id, revenue, share) => ({
  categoryId: id,
  name: `C${id}`,
  revenue,
  unitsSold: 1,
  revenueShare: share,
});

describe('topWithOther', () => {
  it('keeps short lists as they are', () => {
    const list = Array.from({ length: 8 }, (_, i) => cat(i, '10.00', 12.5));
    expect(topWithOther(list)).toBe(list);
  });

  it('folds the rest into one "Other" row with exact sums', () => {
    const list = [
      cat(1, '50.00', 50),
      ...Array.from({ length: 9 }, (_, i) => cat(i + 2, '0.10', 1.1)),
    ];
    const result = topWithOther(list, 3);
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual({
      categoryId: 'other',
      name: 'Other (7 categories)',
      revenue: '0.70',
      unitsSold: 7,
      revenueShare: 7.7,
    });
  });
});
