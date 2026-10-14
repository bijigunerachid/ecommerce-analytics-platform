"""Docker health check for the streaming job: healthy when its heartbeat in pipeline_heartbeats
is recent and it is not reporting an error. The job beats on every progress or idle report
(about every 10 s)."""

import sys

import psycopg

from ecommerce_analytics.config import load_settings
from ecommerce_analytics.heartbeat import COMPONENT

MAX_AGE_SECONDS = 60


def main() -> int:
    try:
        with psycopg.connect(**load_settings().pg_conninfo(), connect_timeout=5) as conn:
            row = conn.execute(
                """SELECT details->>'status', extract(epoch FROM now() - last_seen_at)
                   FROM pipeline_heartbeats WHERE component = %s""",
                (COMPONENT,),
            ).fetchone()
    except Exception as exc:  # any failure means "not healthy"
        print(f"health check failed: {exc}", file=sys.stderr)
        return 1
    if row is None:
        print("no heartbeat yet", file=sys.stderr)
        return 1
    status, age = row[0], float(row[1])
    if status != "ok" or age > MAX_AGE_SECONDS:
        print(f"status={status}, last heartbeat {age:.0f} s ago", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
