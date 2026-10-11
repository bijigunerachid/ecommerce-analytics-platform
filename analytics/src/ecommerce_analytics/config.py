"""Settings for the analytics jobs, read from environment variables.

Inside Docker Compose the services are reached by name (postgres, kafka:29092); the defaults
below match that setup.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise RuntimeError(f"Missing required environment variable {name}")
    return value


@dataclass(frozen=True)
class Settings:
    kafka_bootstrap: str
    topic_prefix: str
    pg_host: str
    pg_port: int
    pg_user: str
    pg_password: str
    pg_database: str
    data_dir: str
    trigger_seconds: int
    max_offsets_per_trigger: int

    @property
    def topics(self) -> list[str]:
        return [f"{self.topic_prefix}.orders", f"{self.topic_prefix}.inventory"]

    @property
    def events_path(self) -> str:
        return f"{self.data_dir}/history/events"

    @property
    def quarantine_path(self) -> str:
        return f"{self.data_dir}/history/quarantine"

    @property
    def checkpoint_path(self) -> str:
        return f"{self.data_dir}/checkpoints/stream-events"

    def pg_conninfo(self) -> dict:
        return {
            "host": self.pg_host,
            "port": self.pg_port,
            "user": self.pg_user,
            "password": self.pg_password,
            "dbname": self.pg_database,
        }


def load_settings(*, test: bool = False) -> Settings:
    database = os.environ.get("POSTGRES_TEST_DB", "ecommerce_test") if test else _env("POSTGRES_DB")
    return Settings(
        kafka_bootstrap=os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:29092"),
        topic_prefix=os.environ.get("KAFKA_TOPIC_PREFIX", "ecommerce"),
        pg_host=os.environ.get("POSTGRES_HOST", "postgres"),
        pg_port=int(os.environ.get("POSTGRES_PORT", "5432")),
        pg_user=_env("POSTGRES_USER"),
        pg_password=_env("POSTGRES_PASSWORD"),
        pg_database=database,
        data_dir=os.environ.get("ANALYTICS_DATA_DIR", "/data"),
        trigger_seconds=int(os.environ.get("STREAM_TRIGGER_SECONDS", "5")),
        max_offsets_per_trigger=int(os.environ.get("STREAM_MAX_OFFSETS_PER_TRIGGER", "20000")),
    )
