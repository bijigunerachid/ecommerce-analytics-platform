-- Up Migration

-- Things staff should know about: stock that ran low or out, and anomalies the stream processor
-- detected. Created by triggers, so every writer (API, Spark, scripts) produces them the same
-- way and in the same transaction as the change. dedup_key keeps one notification per fact,
-- even when the analytics rebuild job re-inserts old anomalies.
CREATE TABLE notifications (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        text        NOT NULL,
  severity    text        NOT NULL,
  title       text        NOT NULL,
  body        text        NOT NULL,
  link        text,
  dedup_key   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_kind_valid CHECK (kind IN ('low_stock', 'out_of_stock', 'anomaly')),
  CONSTRAINT notifications_severity_valid CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT notifications_dedup_key_unique UNIQUE (dedup_key)
);
CREATE INDEX notifications_created_at_idx ON notifications (created_at DESC, id DESC);

-- Per user: notifications created after last_read_at are unread.
CREATE TABLE notification_reads (
  user_id       bigint      PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL
);

-- Stock crossing its reorder level, or running out.
CREATE FUNCTION notify_stock_level() RETURNS trigger AS $$
BEGIN
  IF NEW.stock_quantity = 0 AND OLD.stock_quantity > 0 THEN
    INSERT INTO notifications (kind, severity, title, body, link, dedup_key)
    VALUES ('out_of_stock', 'critical', NEW.name || ' is out of stock',
            'SKU ' || NEW.sku || ' has no units left.',
            '/products/' || NEW.id,
            'out_of_stock:' || NEW.id || ':' || txid_current() || ':' || clock_timestamp())
    ON CONFLICT (dedup_key) DO NOTHING;
  ELSIF NEW.stock_quantity > 0
    AND NEW.stock_quantity <= NEW.reorder_level
    AND OLD.stock_quantity > OLD.reorder_level THEN
    INSERT INTO notifications (kind, severity, title, body, link, dedup_key)
    VALUES ('low_stock', 'warning', NEW.name || ' is low on stock',
            format('%s units left (reorder level %s).', NEW.stock_quantity, NEW.reorder_level),
            '/products/' || NEW.id,
            'low_stock:' || NEW.id || ':' || txid_current() || ':' || clock_timestamp())
    ON CONFLICT (dedup_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_stock_level_notify
  AFTER UPDATE OF stock_quantity, reorder_level ON products
  FOR EACH ROW
  WHEN (NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity
        OR NEW.reorder_level IS DISTINCT FROM OLD.reorder_level)
  EXECUTE FUNCTION notify_stock_level();

-- Anomalies written by the stream processor. One function maps an anomaly to its notification,
-- used by the trigger and by the backfill below.
CREATE FUNCTION insert_anomaly_notification(a analytics_anomalies, created timestamptz)
RETURNS void AS $$
  INSERT INTO notifications (kind, severity, title, body, link, dedup_key, created_at)
  VALUES (
    'anomaly',
    CASE a.severity WHEN 'high' THEN 'critical' WHEN 'medium' THEN 'warning' ELSE 'info' END,
    CASE a.anomaly_type
      WHEN 'high_value_order' THEN 'Unusually large order'
      WHEN 'order_velocity' THEN 'Burst of orders'
      WHEN 'revenue_spike' THEN 'Revenue spike'
      WHEN 'large_stock_reduction' THEN 'Large stock write-off'
      ELSE initcap(replace(a.anomaly_type, '_', ' '))
    END,
    a.description,
    CASE a.entity_type
      WHEN 'order' THEN '/orders/' || a.entity_id
      WHEN 'customer' THEN '/customers/' || a.entity_id
      WHEN 'product' THEN '/products/' || a.entity_id
      ELSE '/'
    END,
    'anomaly:' || a.anomaly_type || ':' || a.entity_type || ':' || a.entity_id || ':'
      || to_char(a.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    created
  )
  ON CONFLICT (dedup_key) DO NOTHING;
$$ LANGUAGE sql;

CREATE FUNCTION notify_anomaly() RETURNS trigger AS $$
BEGIN
  PERFORM insert_anomaly_notification(NEW, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Anomalies detected before this migration, with their original detection time (inserted
-- before the publish trigger exists, so nothing is broadcast for them).
SELECT insert_anomaly_notification(a, a.detected_at) FROM analytics_anomalies a;

CREATE TRIGGER analytics_anomalies_notify
  AFTER INSERT ON analytics_anomalies
  FOR EACH ROW EXECUTE FUNCTION notify_anomaly();

-- Live updates: the API listens on the app_events channel and forwards to browsers. Messages
-- carry only small scalar fields (pg_notify payloads are limited to 8000 bytes) and are
-- delivered when the transaction commits.
CREATE FUNCTION publish_notification() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('app_events', json_build_object(
    'type', 'notification',
    'id', NEW.id,
    'kind', NEW.kind,
    'severity', NEW.severity,
    'title', NEW.title
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notifications_publish
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION publish_notification();

CREATE FUNCTION publish_business_event() RETURNS trigger AS $$
BEGIN
  IF NEW.event_type IN ('order.created', 'order.status_changed') THEN
    PERFORM pg_notify('app_events', json_build_object(
      'type', NEW.event_type,
      'eventId', NEW.event_id,
      'occurredAt', NEW.occurred_at,
      'orderId', (NEW.payload ->> 'orderId')::bigint,
      'customerId', (NEW.payload ->> 'customerId')::bigint,
      'customerName', (SELECT first_name || ' ' || last_name FROM customers
                       WHERE id = (NEW.payload ->> 'customerId')::bigint),
      'totalAmount', NEW.payload ->> 'totalAmount',
      'fromStatus', NEW.payload ->> 'fromStatus',
      'toStatus', NEW.payload ->> 'toStatus'
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_outbox_publish
  AFTER INSERT ON event_outbox
  FOR EACH ROW EXECUTE FUNCTION publish_business_event();

-- Down Migration

DROP TRIGGER IF EXISTS event_outbox_publish ON event_outbox;
DROP FUNCTION IF EXISTS publish_business_event();
DROP TRIGGER IF EXISTS notifications_publish ON notifications;
DROP FUNCTION IF EXISTS publish_notification();
DROP TRIGGER IF EXISTS analytics_anomalies_notify ON analytics_anomalies;
DROP FUNCTION IF EXISTS notify_anomaly();
DROP FUNCTION IF EXISTS insert_anomaly_notification(analytics_anomalies, timestamptz);
DROP TRIGGER IF EXISTS products_stock_level_notify ON products;
DROP FUNCTION IF EXISTS notify_stock_level();
DROP TABLE IF EXISTS notification_reads;
DROP TABLE IF EXISTS notifications;
