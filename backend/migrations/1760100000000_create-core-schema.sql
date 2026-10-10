-- Up Migration

-- Keeps updated_at current on every UPDATE.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Users (staff accounts). No public registration; admins create accounts.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          text        NOT NULL,
  password_hash  text        NOT NULL,
  full_name      text        NOT NULL,
  role           text        NOT NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_role_valid      CHECK (role IN ('admin', 'analyst')),
  CONSTRAINT users_email_unique    UNIQUE (email)
);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text        NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_unique UNIQUE (name)
);

CREATE TABLE products (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku             text          NOT NULL,
  name            text          NOT NULL,
  description     text,
  category_id     bigint        NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  price           numeric(12,2) NOT NULL,
  stock_quantity  integer       NOT NULL DEFAULT 0,
  reorder_level   integer       NOT NULL DEFAULT 10,
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT products_sku_unique          UNIQUE (sku),
  CONSTRAINT products_price_nonnegative   CHECK (price >= 0),
  -- Last line of defense against overselling; the service layer also checks.
  CONSTRAINT products_stock_nonnegative   CHECK (stock_quantity >= 0),
  CONSTRAINT products_reorder_nonnegative CHECK (reorder_level >= 0)
);
CREATE INDEX products_category_id_idx ON products (category_id);

-- ---------------------------------------------------------------------------
-- Customers (synthetic data only in this project)
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       text        NOT NULL,
  first_name  text        NOT NULL,
  last_name   text        NOT NULL,
  phone       text,
  city        text,
  country     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT customers_email_unique    UNIQUE (email)
);

-- ---------------------------------------------------------------------------
-- Orders. Totals are computed by the backend inside the order transaction.
-- idempotency_key makes a retried "create order" request return the original order
-- instead of creating a duplicate and deducting stock twice.
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id      bigint        NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  status           text          NOT NULL DEFAULT 'pending',
  total_amount     numeric(12,2) NOT NULL,
  idempotency_key  text          NOT NULL,
  created_by       bigint        REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT orders_status_valid
    CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  CONSTRAINT orders_total_nonnegative     CHECK (total_amount >= 0),
  CONSTRAINT orders_idempotency_key_unique UNIQUE (idempotency_key)
);
CREATE INDEX orders_customer_id_idx ON orders (customer_id);
CREATE INDEX orders_created_at_idx  ON orders (created_at);
CREATE INDEX orders_status_idx      ON orders (status);

CREATE TABLE order_items (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    bigint        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id  bigint        NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity    integer       NOT NULL,
  unit_price  numeric(12,2) NOT NULL,
  line_total  numeric(12,2) NOT NULL,
  CONSTRAINT order_items_quantity_positive   CHECK (quantity > 0),
  CONSTRAINT order_items_price_nonnegative   CHECK (unit_price >= 0),
  CONSTRAINT order_items_line_total_matches  CHECK (line_total = quantity * unit_price),
  CONSTRAINT order_items_product_once        UNIQUE (order_id, product_id)
);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);

-- ---------------------------------------------------------------------------
-- Inventory ledger. Every stock change is recorded; idempotency_key prevents a
-- retried request from applying the same change twice.
-- ---------------------------------------------------------------------------
CREATE TABLE stock_movements (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       bigint      NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity_change  integer     NOT NULL,
  reason           text        NOT NULL,
  order_id         bigint      REFERENCES orders (id) ON DELETE SET NULL,
  note             text,
  idempotency_key  text        NOT NULL,
  created_by       bigint      REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_change_nonzero CHECK (quantity_change <> 0),
  CONSTRAINT stock_movements_reason_valid
    CHECK (reason IN ('order', 'restock', 'adjustment', 'cancellation')),
  CONSTRAINT stock_movements_idempotency_key_unique UNIQUE (idempotency_key)
);
CREATE INDEX stock_movements_product_id_idx ON stock_movements (product_id, created_at);

-- ---------------------------------------------------------------------------
-- Transactional outbox. Business events are inserted in the same transaction as
-- the change they describe, then relayed to Kafka. event_id is the deduplication
-- key used downstream by the streaming pipeline.
-- ---------------------------------------------------------------------------
CREATE TABLE event_outbox (
  event_id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text        NOT NULL,
  aggregate_type  text        NOT NULL,
  aggregate_id    text        NOT NULL,
  payload         jsonb       NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz,
  attempts        integer     NOT NULL DEFAULT 0,
  last_error      text
);
CREATE INDEX event_outbox_unpublished_idx ON event_outbox (occurred_at) WHERE published_at IS NULL;

CREATE TRIGGER users_set_updated_at      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_set_updated_at   BEFORE UPDATE ON products   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_set_updated_at  BEFORE UPDATE ON customers  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER orders_set_updated_at     BEFORE UPDATE ON orders     FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS event_outbox;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS set_updated_at();
