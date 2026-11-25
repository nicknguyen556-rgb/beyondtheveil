import type { SQLiteDatabase } from 'expo-sqlite';

import { capCustomSourceIds } from './cap';
import { getDataset } from './registry';
import type {
  DatasetId,
  EnrichmentDatasetPrefs,
  SourceId,
  SourceSelectionMode,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function parseMode(raw: string): SourceSelectionMode {
  if (raw === 'suggestions' || raw === 'custom' || raw === 'top3') return raw;
  return 'top3';
}

function rowToPrefs(row: Record<string, unknown>): EnrichmentDatasetPrefs {
  let custom: SourceId[] = [];
  try {
    const parsed = JSON.parse(String(row.custom_source_ids_json ?? '[]'));
    if (Array.isArray(parsed)) {
      custom = parsed.filter((id): id is SourceId => typeof id === 'string') as SourceId[];
    }
  } catch {
    custom = [];
  }
  // Normalize legacy uncapped rows on read.
  const capped = capCustomSourceIds(custom);
  return {
    datasetId: String(row.dataset_id) as DatasetId,
    mode: parseMode(String(row.mode)),
    customSourceIds: capped.sourceIds,
    updatedAt: String(row.updated_at),
  };
}

export async function getDatasetPrefs(
  db: SQLiteDatabase,
  datasetId: DatasetId,
): Promise<EnrichmentDatasetPrefs> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM enrichment_prefs WHERE dataset_id = ?`,
    [datasetId],
  );
  if (row) return rowToPrefs(row);

  const dataset = getDataset(datasetId);
  return {
    datasetId,
    mode: dataset?.defaultMode ?? 'top3',
    customSourceIds: [],
    updatedAt: nowIso(),
  };
}

export interface SetDatasetPrefsResult {
  prefs: EnrichmentDatasetPrefs;
  /** Present when customSourceIds were truncated to the cap. */
  truncationMessage: string | null;
}

/**
 * Persist dataset source prefs. Custom source lists are hard-capped at 5;
 * extras are truncated and surfaced via `truncationMessage`.
 */
export async function setDatasetPrefs(
  db: SQLiteDatabase,
  prefs: Omit<EnrichmentDatasetPrefs, 'updatedAt'> & { updatedAt?: string },
): Promise<SetDatasetPrefsResult> {
  const capped = capCustomSourceIds(prefs.customSourceIds);
  const updatedAt = prefs.updatedAt ?? nowIso();
  const next: EnrichmentDatasetPrefs = {
    datasetId: prefs.datasetId,
    mode: prefs.mode,
    customSourceIds: capped.sourceIds,
    updatedAt,
  };
  await db.runAsync(
    `INSERT INTO enrichment_prefs (dataset_id, mode, custom_source_ids_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(dataset_id) DO UPDATE SET
       mode = excluded.mode,
       custom_source_ids_json = excluded.custom_source_ids_json,
       updated_at = excluded.updated_at`,
    [
      next.datasetId,
      next.mode,
      JSON.stringify(next.customSourceIds),
      next.updatedAt,
    ],
  );
  return {
    prefs: next,
    truncationMessage: capped.message,
  };
}

export async function listAllDatasetPrefs(
  db: SQLiteDatabase,
): Promise<EnrichmentDatasetPrefs[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM enrichment_prefs`,
  );
  return rows.map(rowToPrefs);
}
