import type { SQLiteDatabase } from 'expo-sqlite';

import type { ChartType, Observation, Signal, TrendView } from '@/types/models';
import {
  parseTrendFilters,
  serializeTrendFilters,
  type TrendFilters,
  type TrendQuery,
} from '@/trends/types';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowToTrendView(row: Record<string, unknown>): TrendView {
  return {
    id: String(row.id),
    name: String(row.name),
    filtersJson: String(row.filters_json ?? '{}'),
    signalKeysJson: String(row.signal_keys_json ?? '[]'),
    chartType: (row.chart_type as ChartType) ?? 'line',
    dateRangeStart: (row.date_range_start as string | null) ?? null,
    dateRangeEnd: (row.date_range_end as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseSignalKeysJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k): k is string => typeof k === 'string' && k.trim().length > 0);
  } catch {
    return [];
  }
}

export function trendViewToQuery(view: TrendView): TrendQuery {
  return {
    signalKeys: parseSignalKeysJson(view.signalKeysJson),
    chartType: view.chartType,
    dateRangeStart: view.dateRangeStart,
    dateRangeEnd: view.dateRangeEnd,
    filters: parseTrendFilters(view.filtersJson),
  };
}

export async function listTrendViews(db: SQLiteDatabase): Promise<TrendView[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM trend_views ORDER BY updated_at DESC`,
  );
  return rows.map(rowToTrendView);
}

export async function getTrendView(
  db: SQLiteDatabase,
  id: string,
): Promise<TrendView | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM trend_views WHERE id = ?`,
    [id],
  );
  return row ? rowToTrendView(row) : null;
}

export interface SaveTrendViewInput {
  name: string;
  signalKeys: string[];
  chartType?: ChartType;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  filters?: TrendFilters;
}

export async function createTrendView(
  db: SQLiteDatabase,
  input: SaveTrendViewInput,
): Promise<TrendView> {
  const id = newId();
  const ts = nowIso();
  const filtersJson = serializeTrendFilters(input.filters ?? parseTrendFilters('{}'));
  const signalKeysJson = JSON.stringify(input.signalKeys);
  const chartType = input.chartType ?? 'line';
  const dateRangeStart = input.dateRangeStart ?? null;
  const dateRangeEnd = input.dateRangeEnd ?? null;

  await db.runAsync(
    `INSERT INTO trend_views (
      id, name, filters_json, signal_keys_json, chart_type,
      date_range_start, date_range_end, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name.trim(),
      filtersJson,
      signalKeysJson,
      chartType,
      dateRangeStart,
      dateRangeEnd,
      ts,
      ts,
    ],
  );

  return {
    id,
    name: input.name.trim(),
    filtersJson,
    signalKeysJson,
    chartType,
    dateRangeStart,
    dateRangeEnd,
    createdAt: ts,
    updatedAt: ts,
  };
}

export async function updateTrendView(
  db: SQLiteDatabase,
  id: string,
  input: SaveTrendViewInput,
): Promise<void> {
  await db.runAsync(
    `UPDATE trend_views SET
      name = ?,
      filters_json = ?,
      signal_keys_json = ?,
      chart_type = ?,
      date_range_start = ?,
      date_range_end = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      input.name.trim(),
      serializeTrendFilters(input.filters ?? parseTrendFilters('{}')),
      JSON.stringify(input.signalKeys),
      input.chartType ?? 'line',
      input.dateRangeStart ?? null,
      input.dateRangeEnd ?? null,
      nowIso(),
      id,
    ],
  );
}

export async function deleteTrendView(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`DELETE FROM trend_views WHERE id = ?`, [id]);
}

/** All signal rows for the given observation ids (or all if empty). */
export async function listSignalsForObservations(
  db: SQLiteDatabase,
  observationIds: string[],
): Promise<Signal[]> {
  if (observationIds.length === 0) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM signals ORDER BY created_at ASC`,
    );
    return rows.map(rowToSignal);
  }

  const placeholders = observationIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM signals WHERE observation_id IN (${placeholders}) ORDER BY created_at ASC`,
    observationIds,
  );
  return rows.map(rowToSignal);
}

function rowToSignal(row: Record<string, unknown>): Signal {
  return {
    id: String(row.id),
    observationId: String(row.observation_id),
    key: String(row.key),
    source: row.source as Signal['source'],
    value: (row.value as string | null) ?? null,
    unit: (row.unit as string | null) ?? null,
    confidence: (row.confidence as number | null) ?? null,
    createdAt: String(row.created_at),
  };
}

/** Distinct signal keys present in the local store (excludes enrichment meta). */
export async function listDistinctSignalKeys(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ key: string }>(
    `SELECT DISTINCT key FROM signals
     WHERE key NOT LIKE 'enrichment.%'
     ORDER BY key ASC`,
  );
  return rows.map((r) => r.key);
}

/** Distinct tags across observations (lowercased). */
export async function listDistinctTags(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ tags_json: string }>(
    `SELECT tags_json FROM observations`,
  );
  const set = new Set<string>();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.tags_json) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const tag of parsed) {
        if (typeof tag === 'string' && tag.trim()) {
          set.add(tag.trim().toLowerCase());
        }
      }
    } catch {
      // ignore bad JSON
    }
  }
  return [...set].sort();
}

/** Observations that have coordinates — for place-radius center picks. */
export async function listObservationsWithCoords(
  db: SQLiteDatabase,
): Promise<Observation[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM observations
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY captured_at DESC`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    photoUri: (row.photo_uri as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    capturedAt: String(row.captured_at),
    placeLabel: (row.place_label as string | null) ?? null,
    placeSource: (row.place_source as Observation['placeSource']) ?? null,
    timeSource: (row.time_source as Observation['timeSource']) ?? null,
    tagsJson: String(row.tags_json ?? '[]'),
    outcomeRating: (row.outcome_rating as number | null) ?? null,
    outcomeNotes: (row.outcome_notes as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    syncedAt: (row.synced_at as string | null) ?? null,
  }));
}
