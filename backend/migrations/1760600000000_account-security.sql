-- Up Migration

-- Sessions carry the user's session_version; raising it signs out every existing session
-- (password change, "sign out other sessions", admin password reset, deactivation).
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_changed_at timestamptz;

-- Who did what and when: sign-ins (including failed ones) and every change made through the
-- API. actor_email is kept so entries stay readable if the account is later removed.
-- details never contains passwords or tokens.
CREATE TABLE audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     bigint      REFERENCES users (id) ON DELETE SET NULL,
  actor_email  text,
  action       text        NOT NULL,
  entity_type  text,
  entity_id    text,
  summary      text        NOT NULL,
  details      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip           text,
  CONSTRAINT audit_log_action_format CHECK (action ~ '^[a-z_]+\.[a-z_]+$')
);
CREATE INDEX audit_log_occurred_at_idx ON audit_log (occurred_at DESC, id DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, occurred_at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action, occurred_at DESC);

-- Append-only: entries cannot be edited or deleted row by row, even by the application user.
-- (ON DELETE SET NULL from users is allowed: it only clears actor_id; the email remains.)
CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
     AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- Down Migration

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
DROP FUNCTION IF EXISTS audit_log_append_only();
DROP TABLE IF EXISTS audit_log;
ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;
ALTER TABLE users DROP COLUMN IF EXISTS session_version;
