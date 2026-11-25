import type { SQLiteDatabase } from 'expo-sqlite';

import type { SuggestionDraft } from '@/suggestions/types';
import type { AiSuggestion, SuggestionKind } from '@/types/models';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowToSuggestion(row: Record<string, unknown>): AiSuggestion {
  return {
    id: String(row.id),
    kind: row.kind as SuggestionKind,
    title: String(row.title),
    summary: String(row.summary),
    signalKeysJson: String(row.signal_keys_json ?? '[]'),
    observationIdsJson: String(row.observation_ids_json ?? '[]'),
    dateRangeStart: (row.date_range_start as string | null) ?? null,
    dateRangeEnd: (row.date_range_end as string | null) ?? null,
    evidenceJson: String(row.evidence_json ?? '{}'),
    dismissedAt: (row.dismissed_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

/** Active (non-dismissed) suggestions, newest first. */
export async function listActiveSuggestions(
  db: SQLiteDatabase,
): Promise<AiSuggestion[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM ai_suggestions
     WHERE dismissed_at IS NULL
     ORDER BY created_at DESC`,
  );
  return rows.map(rowToSuggestion);
}

export async function listAllSuggestions(
  db: SQLiteDatabase,
): Promise<AiSuggestion[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM ai_suggestions ORDER BY created_at DESC`,
  );
  return rows.map(rowToSuggestion);
}

export async function dismissSuggestion(
  db: SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE ai_suggestions SET dismissed_at = ? WHERE id = ?`,
    [nowIso(), id],
  );
}

export async function clearActiveSuggestions(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`DELETE FROM ai_suggestions WHERE dismissed_at IS NULL`);
}

/**
 * Replace active suggestions with a fresh analysis run.
 * Dismissed rows are kept so the user does not see them again in this session store.
 */
export async function replaceActiveSuggestions(
  db: SQLiteDatabase,
  drafts: SuggestionDraft[],
): Promise<AiSuggestion[]> {
  await clearActiveSuggestions(db);
  const created: AiSuggestion[] = [];
  const ts = nowIso();

  for (const draft of drafts) {
    const id = newId();
    const signalKeysJson = JSON.stringify(draft.signalKeys);
    const observationIdsJson = JSON.stringify(draft.observationIds);
    const evidenceJson = JSON.stringify(draft.evidence);

    await db.runAsync(
      `INSERT INTO ai_suggestions (
        id, kind, title, summary, signal_keys_json, observation_ids_json,
        date_range_start, date_range_end, evidence_json, dismissed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        id,
        draft.kind,
        draft.title,
        draft.summary,
        signalKeysJson,
        observationIdsJson,
        draft.dateRangeStart,
        draft.dateRangeEnd,
        evidenceJson,
        ts,
      ],
    );

    created.push({
      id,
      kind: draft.kind,
      title: draft.title,
      summary: draft.summary,
      signalKeysJson,
      observationIdsJson,
      dateRangeStart: draft.dateRangeStart,
      dateRangeEnd: draft.dateRangeEnd,
      evidenceJson,
      dismissedAt: null,
      createdAt: ts,
    });
  }

  return created;
}
