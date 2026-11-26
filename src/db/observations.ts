import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  NewObservationInput,
  NewSignalInput,
  Observation,
  PlaceSource,
  Signal,
  TimeSource,
} from '@/types/models';

import { enqueueSyncChange } from './syncQueue';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowToObservation(row: Record<string, unknown>): Observation {
  return {
    id: String(row.id),
    photoUri: (row.photo_uri as string | null) ?? null,
    photoStoragePath: (row.photo_storage_path as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    capturedAt: String(row.captured_at),
    placeLabel: (row.place_label as string | null) ?? null,
    placeSource: (row.place_source as PlaceSource | null) ?? null,
    timeSource: (row.time_source as TimeSource | null) ?? null,
    tagsJson: String(row.tags_json ?? '[]'),
    outcomeRating: (row.outcome_rating as number | null) ?? null,
    outcomeNotes: (row.outcome_notes as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    syncedAt: (row.synced_at as string | null) ?? null,
  };
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

/** Local observation repository — shell CRUD for foundation. */
export async function listObservations(db: SQLiteDatabase): Promise<Observation[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM observations ORDER BY captured_at DESC`,
  );
  return rows.map(rowToObservation);
}

export async function getObservation(
  db: SQLiteDatabase,
  id: string,
): Promise<Observation | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM observations WHERE id = ?`,
    [id],
  );
  return row ? rowToObservation(row) : null;
}

export async function createObservation(
  db: SQLiteDatabase,
  input: NewObservationInput = {},
): Promise<Observation> {
  const id = newId();
  const ts = nowIso();
  const observation: Observation = {
    id,
    photoUri: input.photoUri ?? null,
    photoStoragePath: null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    capturedAt: input.capturedAt ?? ts,
    placeLabel: input.placeLabel ?? null,
    placeSource: input.placeSource ?? null,
    timeSource: input.timeSource ?? (input.capturedAt ? 'manual' : 'device'),
    tagsJson: JSON.stringify(normalizeTags(input.tags ?? [])),
    outcomeRating: normalizeOutcomeRating(input.outcomeRating ?? null),
    outcomeNotes: input.outcomeNotes?.trim() || null,
    createdAt: ts,
    updatedAt: ts,
    syncedAt: null,
  };

  await db.runAsync(
    `INSERT INTO observations (
      id, photo_uri, photo_storage_path, latitude, longitude, captured_at, place_label,
      place_source, time_source,
      tags_json, outcome_rating, outcome_notes, created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      observation.id,
      observation.photoUri,
      observation.photoStoragePath,
      observation.latitude,
      observation.longitude,
      observation.capturedAt,
      observation.placeLabel,
      observation.placeSource,
      observation.timeSource,
      observation.tagsJson,
      observation.outcomeRating,
      observation.outcomeNotes,
      observation.createdAt,
      observation.updatedAt,
      observation.syncedAt,
    ],
  );

  // Local create is pending for premium push (free never flushes the queue).
  await enqueueSyncChange(db, observation.id, 'observation');
  if (observation.photoUri) {
    await enqueueSyncChange(db, observation.id, 'photo');
  }

  return observation;
}

export async function updateObservationPlaceTime(
  db: SQLiteDatabase,
  id: string,
  fields: {
    latitude?: number | null;
    longitude?: number | null;
    capturedAt?: string;
    placeLabel?: string | null;
    placeSource?: PlaceSource | null;
    timeSource?: TimeSource | null;
  },
): Promise<void> {
  const existing = await getObservation(db, id);
  if (!existing) {
    throw new Error(`Observation not found: ${id}`);
  }

  await db.runAsync(
    `UPDATE observations SET
      latitude = ?,
      longitude = ?,
      captured_at = ?,
      place_label = ?,
      place_source = ?,
      time_source = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      fields.latitude !== undefined ? fields.latitude : existing.latitude,
      fields.longitude !== undefined ? fields.longitude : existing.longitude,
      fields.capturedAt ?? existing.capturedAt,
      fields.placeLabel !== undefined ? fields.placeLabel : existing.placeLabel,
      fields.placeSource !== undefined ? fields.placeSource : existing.placeSource,
      fields.timeSource !== undefined ? fields.timeSource : existing.timeSource,
      nowIso(),
      id,
    ],
  );

  await enqueueSyncChange(db, id, 'observation');
}

/** Normalize tags: trim, lowercase, dedupe, drop empties. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function parseObservationTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeTags(
      parsed.filter((t): t is string => typeof t === 'string'),
    );
  } catch {
    return [];
  }
}

/** Clamp light outcome rating to 1–5, or null when cleared. */
export function normalizeOutcomeRating(
  rating: number | null | undefined,
): number | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  const rounded = Math.round(rating);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

/**
 * Light outcome logging: rating (1–5), free-text notes, and tags for trend filters.
 * Bumps `updated_at` so premium sync LWW picks up the change.
 */
export async function updateObservationOutcome(
  db: SQLiteDatabase,
  id: string,
  fields: {
    outcomeRating?: number | null;
    outcomeNotes?: string | null;
    tags?: string[];
  },
): Promise<void> {
  const existing = await getObservation(db, id);
  if (!existing) {
    throw new Error(`Observation not found: ${id}`);
  }

  const nextRating =
    fields.outcomeRating !== undefined
      ? normalizeOutcomeRating(fields.outcomeRating)
      : existing.outcomeRating;
  const nextNotes =
    fields.outcomeNotes !== undefined
      ? fields.outcomeNotes?.trim() || null
      : existing.outcomeNotes;
  const nextTagsJson =
    fields.tags !== undefined
      ? JSON.stringify(normalizeTags(fields.tags))
      : existing.tagsJson;

  await db.runAsync(
    `UPDATE observations SET
      tags_json = ?,
      outcome_rating = ?,
      outcome_notes = ?,
      updated_at = ?
     WHERE id = ?`,
    [nextTagsJson, nextRating, nextNotes, nowIso(), id],
  );

  await enqueueSyncChange(db, id, 'observation');
}

export async function listSignalsForObservation(
  db: SQLiteDatabase,
  observationId: string,
): Promise<Signal[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM signals WHERE observation_id = ? ORDER BY created_at ASC`,
    [observationId],
  );
  return rows.map(rowToSignal);
}

export async function addSignal(
  db: SQLiteDatabase,
  input: NewSignalInput,
): Promise<Signal> {
  const signal: Signal = {
    id: newId(),
    observationId: input.observationId,
    key: input.key,
    source: input.source,
    value: input.value ?? null,
    unit: input.unit ?? null,
    confidence: input.confidence ?? null,
    createdAt: nowIso(),
  };

  await db.runAsync(
    `INSERT INTO signals (
      id, observation_id, key, source, value, unit, confidence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      signal.id,
      signal.observationId,
      signal.key,
      signal.source,
      signal.value,
      signal.unit,
      signal.confidence,
      signal.createdAt,
    ],
  );

  await enqueueSyncChange(db, signal.observationId, 'signals');

  return signal;
}

/** Remove existing rows for the given keys, then insert replacements (enrichment refresh). */
export async function replaceSignalsForKeys(
  db: SQLiteDatabase,
  observationId: string,
  keys: readonly string[],
  next: NewSignalInput[],
): Promise<Signal[]> {
  if (keys.length > 0) {
    const placeholders = keys.map(() => '?').join(', ');
    await db.runAsync(
      `DELETE FROM signals WHERE observation_id = ? AND key IN (${placeholders})`,
      [observationId, ...keys],
    );
  }

  const saved: Signal[] = [];
  for (const input of next) {
    saved.push(await addSignal(db, input));
  }
  if (keys.length > 0 || next.length > 0) {
    await enqueueSyncChange(db, observationId, 'signals');
  }
  return saved;
}

export async function countObservations(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM observations`,
  );
  return row?.count ?? 0;
}

/**
 * Insert or replace a full observation row from cloud sync (preserves remote timestamps).
 */
export async function upsertObservationFromSync(
  db: SQLiteDatabase,
  observation: Observation,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO observations (
      id, photo_uri, photo_storage_path, latitude, longitude, captured_at, place_label,
      place_source, time_source,
      tags_json, outcome_rating, outcome_notes, created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      photo_uri = excluded.photo_uri,
      photo_storage_path = excluded.photo_storage_path,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      captured_at = excluded.captured_at,
      place_label = excluded.place_label,
      place_source = excluded.place_source,
      time_source = excluded.time_source,
      tags_json = excluded.tags_json,
      outcome_rating = excluded.outcome_rating,
      outcome_notes = excluded.outcome_notes,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      synced_at = excluded.synced_at`,
    [
      observation.id,
      observation.photoUri,
      observation.photoStoragePath,
      observation.latitude,
      observation.longitude,
      observation.capturedAt,
      observation.placeLabel,
      observation.placeSource,
      observation.timeSource,
      observation.tagsJson,
      observation.outcomeRating,
      observation.outcomeNotes,
      observation.createdAt,
      observation.updatedAt,
      observation.syncedAt,
    ],
  );
}

/** Replace every signal for an observation (used when remote wins LWW). */
export async function replaceAllSignalsForObservation(
  db: SQLiteDatabase,
  observationId: string,
  signals: Signal[],
): Promise<void> {
  await db.runAsync(`DELETE FROM signals WHERE observation_id = ?`, [observationId]);
  for (const signal of signals) {
    await db.runAsync(
      `INSERT INTO signals (
        id, observation_id, key, source, value, unit, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        signal.id,
        signal.observationId,
        signal.key,
        signal.source,
        signal.value,
        signal.unit,
        signal.confidence,
        signal.createdAt,
      ],
    );
  }
}
