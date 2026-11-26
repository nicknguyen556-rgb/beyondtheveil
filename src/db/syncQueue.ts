import type { SQLiteDatabase } from 'expo-sqlite';

/** Local change kinds queued for premium cloud push. */
export type SyncChangeType = 'observation' | 'signals' | 'photo';

export interface SyncQueueItem {
  observationId: string;
  changeType: SyncChangeType;
  enqueuedAt: string;
  attempts: number;
  lastError: string | null;
}

const LAST_ERROR_KEY = 'sync_last_error';
const OFFLINE_FLAG_KEY = 'sync_offline';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Mark an observation dirty for LWW push: bump `updated_at`, clear `synced_at`.
 * Used whenever local observation / signal / photo content changes.
 */
export async function markObservationDirty(
  db: SQLiteDatabase,
  observationId: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE observations SET updated_at = ?, synced_at = NULL WHERE id = ?`,
    [nowIso(), observationId],
  );
}

/**
 * Enqueue a local change for premium sync. Idempotent per (observation, type).
 * Also marks the observation dirty so the existing LWW engine will push it.
 */
export async function enqueueSyncChange(
  db: SQLiteDatabase,
  observationId: string,
  changeType: SyncChangeType,
): Promise<void> {
  const ts = nowIso();
  await markObservationDirty(db, observationId);
  await db.runAsync(
    `INSERT INTO sync_queue (observation_id, change_type, enqueued_at, attempts, last_error)
     VALUES (?, ?, ?, 0, NULL)
     ON CONFLICT(observation_id, change_type) DO UPDATE SET
       enqueued_at = excluded.enqueued_at,
       last_error = NULL`,
    [observationId, changeType, ts],
  );
}

export async function listSyncQueue(db: SQLiteDatabase): Promise<SyncQueueItem[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT observation_id, change_type, enqueued_at, attempts, last_error
     FROM sync_queue
     ORDER BY enqueued_at ASC`,
  );
  return rows.map((row) => ({
    observationId: String(row.observation_id),
    changeType: row.change_type as SyncChangeType,
    enqueuedAt: String(row.enqueued_at),
    attempts: Number(row.attempts ?? 0),
    lastError: (row.last_error as string | null) ?? null,
  }));
}

/** Distinct observations with any pending queue row. */
export async function countPendingObservations(
  db: SQLiteDatabase,
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(DISTINCT observation_id) AS count FROM sync_queue`,
  );
  return row?.count ?? 0;
}

export async function countPendingChanges(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sync_queue`,
  );
  return row?.count ?? 0;
}

/** Clear all queue rows for an observation after a successful push. */
export async function clearQueueForObservation(
  db: SQLiteDatabase,
  observationId: string,
): Promise<void> {
  await db.runAsync(`DELETE FROM sync_queue WHERE observation_id = ?`, [
    observationId,
  ]);
}

/** Record a failed push attempt against every pending row for an observation. */
export async function recordQueueFailure(
  db: SQLiteDatabase,
  observationId: string,
  error: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_queue
     SET attempts = attempts + 1, last_error = ?
     WHERE observation_id = ?`,
    [error, observationId],
  );
}

/** Mark every pending row as failed (e.g. whole sync offline). */
export async function recordQueueFailureAll(
  db: SQLiteDatabase,
  error: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_queue SET attempts = attempts + 1, last_error = ?`,
    [error],
  );
}

export async function setSyncOfflineFlag(
  db: SQLiteDatabase,
  offline: boolean,
  lastError: string | null = null,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [OFFLINE_FLAG_KEY, offline ? '1' : '0'],
  );
  if (lastError != null) {
    await db.runAsync(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [LAST_ERROR_KEY, lastError],
    );
  } else if (!offline) {
    await db.runAsync(`DELETE FROM meta WHERE key = ?`, [LAST_ERROR_KEY]);
  }
}

export async function getSyncOfflineFlag(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = ?`,
    [OFFLINE_FLAG_KEY],
  );
  return row?.value === '1';
}

export async function getSyncLastError(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = ?`,
    [LAST_ERROR_KEY],
  );
  return row?.value ?? null;
}

/**
 * Seed queue rows for observations that look dirty but have no queue entry
 * (e.g. upgrades from pre-queue schema).
 */
export async function backfillDirtyIntoQueue(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM observations
     WHERE synced_at IS NULL
        OR (synced_at IS NOT NULL AND updated_at > synced_at)`,
  );
  for (const row of rows) {
    await db.runAsync(
      `INSERT INTO sync_queue (observation_id, change_type, enqueued_at, attempts, last_error)
       VALUES (?, 'observation', ?, 0, NULL)
       ON CONFLICT(observation_id, change_type) DO NOTHING`,
      [row.id, nowIso()],
    );
  }
}
