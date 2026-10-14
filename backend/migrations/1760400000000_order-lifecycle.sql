-- Up Migration

-- Every status an order has been in, in order. The first row of an order has no from_status
-- (the order was placed). Written in the same transaction as the status change itself.
CREATE TABLE order_status_history (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     bigint      NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status  text,
  to_status    text        NOT NULL,
  changed_by   bigint      REFERENCES users (id) ON DELETE SET NULL,
  note         text,
  changed_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_status_history_to_valid
    CHECK (to_status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  CONSTRAINT order_status_history_from_valid
    CHECK (from_status IS NULL OR from_status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  CONSTRAINT order_status_history_changes_status
    CHECK (from_status IS DISTINCT FROM to_status),
  CONSTRAINT order_status_history_note_length
    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500)
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, changed_at, id);

-- Internal notes staff add to an order (not visible to customers).
CREATE TABLE order_notes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    bigint      NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  author_id   bigint      REFERENCES users (id) ON DELETE SET NULL,
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_notes_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);
CREATE INDEX order_notes_order_idx ON order_notes (order_id, created_at, id);

-- Backfill existing orders from the business events in the outbox, which record every
-- placement and status change with its time.
INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_at)
SELECT o.id, NULL, 'pending', o.created_by, e.occurred_at
FROM event_outbox e
JOIN orders o ON o.id = e.aggregate_id::bigint
WHERE e.event_type = 'order.created' AND e.aggregate_type = 'order';

INSERT INTO order_status_history (order_id, from_status, to_status, changed_at)
SELECT o.id, e.payload ->> 'fromStatus', e.payload ->> 'toStatus',
       COALESCE((e.payload ->> 'changedAt')::timestamptz, e.occurred_at)
FROM event_outbox e
JOIN orders o ON o.id = e.aggregate_id::bigint
WHERE e.event_type = 'order.status_changed' AND e.aggregate_type = 'order';

-- Orders without events (none are expected) still get their placement and current status.
INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_at)
SELECT o.id, NULL, 'pending', o.created_by, o.created_at
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id);

INSERT INTO order_status_history (order_id, from_status, to_status, changed_at)
SELECT o.id, 'pending', o.status, o.updated_at
FROM orders o
WHERE o.status <> 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM order_status_history h WHERE h.order_id = o.id AND h.to_status = o.status
  );

-- Down Migration

DROP TABLE IF EXISTS order_notes;
DROP TABLE IF EXISTS order_status_history;
