/**
 * Local SQLite schema for offline-first observations.
 * Premium sync (Supabase) will mirror these tables later — not wired yet.
 */

export const SCHEMA_VERSION = 2;

export const CREATE_TABLES_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY NOT NULL,
  photo_uri TEXT,
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
`;

/** Additive migrations for existing installs created at schema v1. */
export const MIGRATIONS: Record<number, string[]> = {
  2: [
    `ALTER TABLE observations ADD COLUMN place_source TEXT`,
    `ALTER TABLE observations ADD COLUMN time_source TEXT`,
  ],
};
