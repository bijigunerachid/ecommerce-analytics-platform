// Customer value segments from the Spark insights job (RFM: recency, frequency, monetary).
// Rules and order mirror analytics/src/ecommerce_analytics/insights.py.

export const SEGMENT_INFO = {
  champions: {
    label: 'Champions',
    description: 'Bought recently, buy often, and spend the most.',
  },
  loyal: {
    label: 'Loyal',
    description: 'Buy regularly and recently.',
  },
  promising: {
    label: 'Promising',
    description: 'Bought recently, but only a few times so far.',
  },
  needs_attention: {
    label: 'Needs attention',
    description: 'Average recency and few orders: at risk of drifting away.',
  },
  at_risk: {
    label: 'At risk',
    description: 'Used to buy often, but not lately.',
  },
  hibernating: {
    label: 'Hibernating',
    description: 'Few orders, a long time ago.',
  },
};
