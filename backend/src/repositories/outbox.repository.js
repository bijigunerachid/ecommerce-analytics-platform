/**
 * Transactional outbox writes. Always call with the same transaction client as the business
 * change, so the event exists if and only if the change committed.
 */
export function createOutboxRepository() {
  return {
    async add(client, { eventType, aggregateType, aggregateId, payload }) {
      const { rows } = await client.query(
        `INSERT INTO event_outbox (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4) RETURNING event_id`,
        [eventType, aggregateType, aggregateId, payload],
      );
      return rows[0].event_id;
    },
  };
}
