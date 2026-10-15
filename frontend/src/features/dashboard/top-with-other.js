/**
 * The `limit` largest categories, plus one "Other" row for the rest, so a ranked chart stays
 * readable however many categories exist (the table view still lists them all). Shares are
 * percentages; money is summed in cents to stay exact.
 */
export function topWithOther(categories, limit = 7) {
  if (categories.length <= limit + 1) return categories;
  const shown = categories.slice(0, limit);
  const rest = categories.slice(limit);
  const cents = rest.reduce((sum, c) => sum + Math.round(Number(c.revenue) * 100), 0);
  return [
    ...shown,
    {
      categoryId: 'other',
      name: `Other (${rest.length} categories)`,
      revenue: (cents / 100).toFixed(2),
      unitsSold: rest.reduce((sum, c) => sum + c.unitsSold, 0),
      revenueShare: Math.round(rest.reduce((sum, c) => sum + c.revenueShare, 0) * 10) / 10,
    },
  ];
}
