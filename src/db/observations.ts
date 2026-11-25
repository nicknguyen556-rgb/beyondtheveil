import type { SQLiteDatabase } from 'expo-sqlite';

import type { NewObservationInput, NewSignalInput, Observation, Signal } from '@/types/models';

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
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    capturedAt: String(row.captured_at),
    placeLabel: (row.place_label as string | null) ?? null,
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
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    capturedAt: input.capturedAt ?? ts,
    placeLabel: input.placeLabel ?? null,
    tagsJson: JSON.stringify(input.tags ?? []),
    outcomeRating: input.outcomeRating ?? null,
    outcomeNotes: input.outcomeNotes ?? null,
    createdAt: ts,
    updatedAt: ts,
    syncedAt: null,
  };

  await db.runAsync(
    `INSERT INTO observations (
      id, photo_uri, latitude, longitude, captured_at, place_label,
      tags_json, outcome_rating, outcome_notes, created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      observation.id,
      observation.photoUri,
      observation.latitude,
      observation.longitude,
      observation.capturedAt,
      observation.placeLabel,
      observation.tagsJson,
      observation.outcomeRating,
      observation.outcomeNotes,
      observation.createdAt,
      observation.updatedAt,
      observation.syncedAt,
    ],
  );

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
      updated_at = ?
     WHERE id = ?`,
    [
      fields.latitude !== undefined ? fields.latitude : existing.latitude,
      fields.longitude !== undefined ? fields.longitude : existing.longitude,
      fields.capturedAt ?? existing.capturedAt,
      fields.placeLabel !== undefined ? fields.placeLabel : existing.placeLabel,
      nowIso(),
      id,
    ],
  );
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

  return signal;
}

export async function countObservations(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM observations`,
  );
  return row?.count ?? 0;
}
