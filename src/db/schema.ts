/**
 * Local SQLite schema for offline-first observations.
 * Premium sync mirrors observations + signals to Supabase (see supabase/schema.sql).
 * Premium AI suggestions stay local (analyze stored data only).
 * Offline premium sync queue holds pending observation/signal/photo pushes.
 */

export const SCHEMA_VERSION = 6;

export const CREATE_TABLES_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY NOT NULL,
  photo_uri TEXT,
  photo_storage_path TEXT,
  latitude REAL,
  longitude REAL,
  captured_at TEXT NOT NULL,
  place_label TEXT,
  place_source TEXT CHECK (place_source IS NULL OR place_source IN ('exif', 'device', 'manual')),
  time_source TEXT CHECK (time_source IS NULL OR time_source IN ('exif', 'device', 'manual')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  outcome_rating INTEGER,
  outcome_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY NOT NULL,
  observation_id TEXT NOT NULL,
  key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('api', 'manual', 'derived')),
  value TEXT,
  unit TEXT,
  confidence REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signals_observation
  ON signals(observation_id);

CREATE INDEX IF NOT EXISTS idx_observations_captured_at
  ON observations(captured_at);

CREATE TABLE IF NOT EXISTS trend_views (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  signal_keys_json TEXT NOT NULL DEFAULT '[]',
  chart_type TEXT NOT NULL DEFAULT 'line'
    CHECK (chart_type IN ('line', 'scatter', 'bar')),
  date_range_start TEXT,
  date_range_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrichment_prefs (
  dataset_id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('top3', 'suggestions', 'custom')),
  custom_source_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_usage (
  dataset_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  PRIMARY KEY (dataset_id, source_id)
);

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('correlation', 'interesting_period')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  signal_keys_json TEXT NOT NULL DEFAULT '[]',
  observation_ids_json TEXT NOT NULL DEFAULT '[]',
  date_range_start TEXT,
  date_range_end TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  dismissed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_dismissed
  ON ai_suggestions(dismissed_at);

CREATE TABLE IF NOT EXISTS sync_queue (
  observation_id TEXT NOT NULL,
  change_type TEXT NOT NULL
    CHECK (change_type IN ('observation', 'signals', 'photo')),
  enqueued_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  PRIMARY KEY (observation_id, change_type),
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_enqueued
  ON sync_queue(enqueued_at);
`;

/** Additive migrations for existing installs created at schema v1. */
export const MIGRATIONS: Record<number, string[]> = {
  2: [
    `ALTER TABLE observations ADD COLUMN place_source TEXT`,
    `ALTER TABLE observations ADD COLUMN time_source TEXT`,
  ],
  3: [
    `CREATE TABLE IF NOT EXISTS enrichment_prefs (
      dataset_id TEXT PRIMARY KEY NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('top3', 'suggestions', 'custom')),
      custom_source_ids_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS source_usage (
      dataset_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      PRIMARY KEY (dataset_id, source_id)
    )`,
  ],
  4: [`ALTER TABLE observations ADD COLUMN photo_storage_path TEXT`],
  5: [
    `CREATE TABLE IF NOT EXISTS ai_suggestions (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('correlation', 'interesting_period')),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      signal_keys_json TEXT NOT NULL DEFAULT '[]',
      observation_ids_json TEXT NOT NULL DEFAULT '[]',
      date_range_start TEXT,
      date_range_end TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      dismissed_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_suggestions_dismissed
      ON ai_suggestions(dismissed_at)`,
  ],
  6: [
    `CREATE TABLE IF NOT EXISTS sync_queue (
      observation_id TEXT NOT NULL,
      change_type TEXT NOT NULL
        CHECK (change_type IN ('observation', 'signals', 'photo')),
      enqueued_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      PRIMARY KEY (observation_id, change_type),
      FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_enqueued
      ON sync_queue(enqueued_at)`,
  ],
};
