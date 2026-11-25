import type { SQLiteDatabase } from 'expo-sqlite';

import type { DatasetId, SourceId, SourceUsageRow } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function rowToUsage(row: Record<string, unknown>): SourceUsageRow {
  return {
    datasetId: String(row.dataset_id) as DatasetId,
    sourceId: String(row.source_id) as SourceId,
    useCount: Number(row.use_count ?? 0),
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  };
}

export async function listUsageForDataset(
  db: SQLiteDatabase,
  datasetId: DatasetId,
): Promise<SourceUsageRow[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM source_usage WHERE dataset_id = ?`,
    [datasetId],
  );
  return rows.map(rowToUsage);
}

/** Increment use_count for sources that successfully contributed to a dataset. */
export async function recordSourceUsage(
  db: SQLiteDatabase,
  datasetId: DatasetId,
  sourceIds: readonly SourceId[],
): Promise<void> {
  const ts = nowIso();
  for (const sourceId of sourceIds) {
    await db.runAsync(
      `INSERT INTO source_usage (dataset_id, source_id, use_count, last_used_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(dataset_id, source_id) DO UPDATE SET
         use_count = use_count + 1,
         last_used_at = excluded.last_used_at`,
      [datasetId, sourceId, ts],
    );
  }
}
