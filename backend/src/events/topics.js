// Kafka topic layout. Events are routed by aggregate type and keyed by aggregate id, so all
// events for one order (or one product) land on the same partition, in order.

const TOPIC_BY_AGGREGATE = {
  order: 'orders',
  product: 'inventory',
};

export const TOPIC_PARTITIONS = 3;

/** All topics the platform uses, e.g. ["ecommerce.orders", "ecommerce.inventory"]. */
export function allTopics(prefix) {
  return Object.values(TOPIC_BY_AGGREGATE).map((name) => `${prefix}.${name}`);
}

export function topicFor(prefix, aggregateType) {
  const name = TOPIC_BY_AGGREGATE[aggregateType];
  if (!name) throw new Error(`No Kafka topic configured for aggregate type "${aggregateType}"`);
  return `${prefix}.${name}`;
}
