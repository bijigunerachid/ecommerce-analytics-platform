-- Up Migration

-- Strict insertion order for the outbox relay. occurred_at is the transaction time, so events
-- written in the same transaction share it and cannot be ordered by it alone.
ALTER TABLE event_outbox ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE event_outbox ADD CONSTRAINT event_outbox_seq_unique UNIQUE (seq);

DROP INDEX event_outbox_unpublished_idx;
CREATE INDEX event_outbox_unpublished_idx ON event_outbox (seq) WHERE published_at IS NULL;
CREATE INDEX event_outbox_published_at_idx ON event_outbox (published_at);

-- Liveness reports from pipeline components (outbox relay, streaming jobs). Each component
-- upserts its row periodically; the health endpoint treats stale rows as down.
CREATE TABLE pipeline_heartbeats (
  component     text        PRIMARY KEY,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  details       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Down Migration

DROP TABLE IF EXISTS pipeline_heartbeats;
DROP INDEX IF EXISTS event_outbox_published_at_idx;
DROP INDEX IF EXISTS event_outbox_unpublished_idx;
ALTER TABLE event_outbox DROP CONSTRAINT IF EXISTS event_outbox_seq_unique;
ALTER TABLE event_outbox DROP COLUMN IF EXISTS seq;
CREATE INDEX event_outbox_unpublished_idx ON event_outbox (occurred_at) WHERE published_at IS NULL;
