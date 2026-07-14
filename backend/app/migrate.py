"""
Additive-only migration runner.

The app uses SQLAlchemy's create_all() to bring up brand-new tables, but that
doesn't touch existing tables. This module ships idempotent ALTER statements
that add new columns/indexes so upgrades don't need manual DBA work.

Every statement uses "IF NOT EXISTS" so re-running is safe.
"""

import logging
from sqlalchemy import text
from app.database import engine

log = logging.getLogger("smartbin.migrate")

# Ordered list of (name, sql) pairs. name is only used for logging.
STATEMENTS = [
    ("bins.category",           "ALTER TABLE bins ADD COLUMN IF NOT EXISTS category VARCHAR(24) NOT NULL DEFAULT 'other'"),
    ("bins.soft_threshold_pct", "ALTER TABLE bins ADD COLUMN IF NOT EXISTS soft_threshold_pct FLOAT NOT NULL DEFAULT 40.0"),
    ("bins.active",             "ALTER TABLE bins ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE"),
    ("bins.device_id",          "ALTER TABLE bins ADD COLUMN IF NOT EXISTS device_id VARCHAR(50)"),
    ("bins.device_id_idx",      "CREATE UNIQUE INDEX IF NOT EXISTS ix_bins_device_id ON bins (device_id) WHERE device_id IS NOT NULL"),
    ("bins.pending",            "ALTER TABLE bins ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT FALSE"),
    ("bins.pending_idx",        "CREATE INDEX IF NOT EXISTS ix_bins_pending ON bins (pending)"),

    ("collection_logs.weight_at_collection", "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS weight_at_collection FLOAT"),
    ("collection_logs.collected_by",         "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS collected_by VARCHAR(80)"),
    ("collection_logs.lat",                  "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS lat FLOAT"),
    ("collection_logs.lng",                  "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS lng FLOAT"),
    ("collection_logs.photo_path",           "ALTER TABLE collection_logs ADD COLUMN IF NOT EXISTS photo_path VARCHAR(255)"),

    ("sensor_readings.bin_id_idx",    "CREATE INDEX IF NOT EXISTS ix_sensor_readings_bin_id ON sensor_readings (bin_id)"),
    ("sensor_readings.timestamp_idx", "CREATE INDEX IF NOT EXISTS ix_sensor_readings_timestamp ON sensor_readings (timestamp)"),
    ("collection_logs.bin_id_idx",    "CREATE INDEX IF NOT EXISTS ix_collection_logs_bin_id ON collection_logs (bin_id)"),

    # v0.4 — OAuth / self-registration support
    ("users.email",           "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)"),
    ("users.avatar_url",      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)"),
    ("users.auth_provider",   "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(16) NOT NULL DEFAULT 'local'"),
    ("users.google_sub",      "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(128)"),
    ("users.password_nullable", "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"),
    ("users.email_idx",       "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email) WHERE email IS NOT NULL"),
    ("users.google_sub_idx",  "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL"),
]


def run_migrations() -> None:
    with engine.begin() as conn:
        for name, sql in STATEMENTS:
            try:
                conn.execute(text(sql))
            except Exception as exc:
                log.warning("Migration %s failed (may be safe to ignore): %s", name, exc)
    log.info("Migrations complete")
