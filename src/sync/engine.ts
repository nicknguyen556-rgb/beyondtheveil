import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  listObservations,
  listSignalsForObservation,
  replaceAllSignalsForObservation,
  upsertObservationFromSync,
} from '@/db/observations';
import type { Observation, Signal } from '@/types/models';

import { getCurrentUser } from './auth';
import { canSync, resolveEntitlement } from './entitlement';
import { decideObservationWinner, shouldPull, shouldPush } from './merge';
import {
  downloadObservationPhoto,
  setLocalPhotoStoragePath,
  uploadObservationPhoto,
} from './photos';
import { getSupabase } from './supabase';
import type {
  ObservationMergeResult,
  RemoteObservation,
  RemoteSignal,
  SyncSummary,
} from './types';

const LAST_SYNC_KEY = 'last_sync_at';

function nowIso(): string {
  return new Date().toISOString();
}

function emptySummary(partial: Partial<SyncSummary> & { skippedReason: string | null }): SyncSummary {
  const ts = nowIso();
  return {
    startedAt: ts,
    finishedAt: ts,
    pushed: 0,
    pulled: 0,
    keptLocal: 0,
    identical: 0,
    photosUploaded: 0,
    photosDownloaded: 0,
    offline: false,
    merges: [],
    ...partial,
  };
}

async function markSynced(db: SQLiteDatabase, observationId: string): Promise<void> {
  await db.runAsync(`UPDATE observations SET synced_at = ? WHERE id = ?`, [
    nowIso(),
    observationId,
  ]);
}

async function setLastSyncAt(db: SQLiteDatabase, iso: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LAST_SYNC_KEY, iso],
  );
}

export async function getLastSyncAt(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = ?`,
    [LAST_SYNC_KEY],
  );
  return row?.value ?? null;
}

function observationToRemote(
  obs: Observation,
  userId: string,
  photoStoragePath: string | null,
): RemoteObservation {
  return {
    id: obs.id,
    user_id: userId,
    photo_storage_path: photoStoragePath,
    latitude: obs.latitude,
    longitude: obs.longitude,
    captured_at: obs.capturedAt,
    place_label: obs.placeLabel,
    place_source: obs.placeSource,
    time_source: obs.timeSource,
    tags_json: obs.tagsJson,
    outcome_rating: obs.outcomeRating,
    outcome_notes: obs.outcomeNotes,
    created_at: obs.createdAt,
    updated_at: obs.updatedAt,
  };
}

function signalToRemote(signal: Signal, userId: string): RemoteSignal {
  return {
    id: signal.id,
    user_id: userId,
    observation_id: signal.observationId,
    key: signal.key,
    source: signal.source,
    value: signal.value,
    unit: signal.unit,
    confidence: signal.confidence,
    created_at: signal.createdAt,
  };
}

function remoteToLocalObservation(
  remote: RemoteObservation,
  localPhotoUri: string | null,
): Observation {
  return {
    id: remote.id,
    photoUri: localPhotoUri,
    photoStoragePath: remote.photo_storage_path,
    latitude: remote.latitude,
    longitude: remote.longitude,
    capturedAt: remote.captured_at,
    placeLabel: remote.place_label,
    placeSource: remote.place_source,
    timeSource: remote.time_source,
    tagsJson: remote.tags_json,
    outcomeRating: remote.outcome_rating,
    outcomeNotes: remote.outcome_notes,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
    syncedAt: nowIso(),
  };
}

async function pushObservationBundle(
  supabase: SupabaseClient,
  db: SQLiteDatabase,
  userId: string,
  obs: Observation,
  summary: SyncSummary,
): Promise<void> {
  let photoPath = obs.photoStoragePath;
  try {
    const uploaded = await uploadObservationPhoto(
      supabase,
      userId,
      obs.id,
      obs.photoUri,
      obs.photoStoragePath,
    );
    if (uploaded && uploaded !== obs.photoStoragePath) {
      photoPath = uploaded;
      await setLocalPhotoStoragePath(db, obs.id, uploaded);
      summary.photosUploaded += 1;
    } else if (uploaded && !obs.photoStoragePath) {
      photoPath = uploaded;
      await setLocalPhotoStoragePath(db, obs.id, uploaded);
      summary.photosUploaded += 1;
    }
  } catch {
    // Graceful offline / storage errors — still push metadata without photo.
  }

  const remote = observationToRemote(obs, userId, photoPath);
  const { error: obsError } = await supabase.from('observations').upsert(remote, {
    onConflict: 'id',
  });
  if (obsError) {
    throw new Error(`Push observation failed: ${obsError.message}`);
  }

  const signals = await listSignalsForObservation(db, obs.id);
  const { error: delError } = await supabase
    .from('signals')
    .delete()
    .eq('observation_id', obs.id)
    .eq('user_id', userId);
  if (delError) {
    throw new Error(`Clear remote signals failed: ${delError.message}`);
  }

  if (signals.length > 0) {
    const rows = signals.map((s) => signalToRemote(s, userId));
    const { error: sigError } = await supabase.from('signals').insert(rows);
    if (sigError) {
      throw new Error(`Push signals failed: ${sigError.message}`);
    }
  }

  await markSynced(db, obs.id);
}

async function pullObservationBundle(
  supabase: SupabaseClient,
  db: SQLiteDatabase,
  remote: RemoteObservation,
  existingLocal: Observation | null,
  summary: SyncSummary,
): Promise<void> {
  let localPhotoUri = existingLocal?.photoUri ?? null;

  if (remote.photo_storage_path) {
    const needsDownload =
      !localPhotoUri ||
      localPhotoUri.startsWith('supabase://') ||
      existingLocal?.photoStoragePath !== remote.photo_storage_path;
    if (needsDownload) {
      try {
        localPhotoUri = await downloadObservationPhoto(
          supabase,
          remote.id,
          remote.photo_storage_path,
        );
        summary.photosDownloaded += 1;
      } catch {
        // Keep prior local URI if download fails (offline).
        localPhotoUri = existingLocal?.photoUri ?? null;
      }
    }
  }

  const localObs = remoteToLocalObservation(remote, localPhotoUri);
  await upsertObservationFromSync(db, localObs);

  const { data: remoteSignals, error } = await supabase
    .from('signals')
    .select('*')
    .eq('observation_id', remote.id);

  if (error) {
    throw new Error(`Pull signals failed: ${error.message}`);
  }

  const signals: Signal[] = (remoteSignals as RemoteSignal[] | null)?.map((row) => ({
    id: row.id,
    observationId: row.observation_id,
    key: row.key,
    source: row.source,
    value: row.value,
    unit: row.unit,
    confidence: row.confidence,
    createdAt: row.created_at,
  })) ?? [];

  await replaceAllSignalsForObservation(db, remote.id, signals);
}

/**
 * Bidirectional premium sync: LWW per observation by `updated_at`.
 * Free entitlement, missing auth, or unconfigured Supabase → no-op with reason.
 * Network failures set `offline` and return without throwing.
 */
export async function runCloudSync(db: SQLiteDatabase): Promise<SyncSummary> {
  const startedAt = nowIso();
  const supabase = getSupabase();
  if (!supabase) {
    return emptySummary({
      startedAt,
      finishedAt: nowIso(),
      skippedReason:
        'Supabase not configured — local-only mode. Add EXPO_PUBLIC_SUPABASE_URL / ANON_KEY to enable premium sync.',
    });
  }

  const user = await getCurrentUser();
  if (!user) {
    return emptySummary({
      startedAt,
      finishedAt: nowIso(),
      skippedReason: 'Sign in to sync across devices.',
    });
  }

  const entitlement = await resolveEntitlement(db, user.id);
  if (!canSync(entitlement)) {
    return emptySummary({
      startedAt,
      finishedAt: nowIso(),
      skippedReason:
        'Free plan stays local-only. Upgrade to premium to enable cloud sync.',
    });
  }

  const summary: SyncSummary = {
    startedAt,
    finishedAt: startedAt,
    pushed: 0,
    pulled: 0,
    keptLocal: 0,
    identical: 0,
    photosUploaded: 0,
    photosDownloaded: 0,
    offline: false,
    skippedReason: null,
    merges: [],
  };

  let remoteRows: RemoteObservation[] = [];
  try {
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
    remoteRows = (data as RemoteObservation[] | null) ?? [];
  } catch (err) {
    summary.offline = true;
    summary.skippedReason =
      err instanceof Error
        ? `Offline or unreachable: ${err.message}`
        : 'Offline or unreachable';
    summary.finishedAt = nowIso();
    return summary;
  }

  const localRows = await listObservations(db);
  const localById = new Map(localRows.map((o) => [o.id, o]));
  const remoteById = new Map(remoteRows.map((o) => [o.id, o]));
  const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

  try {
    for (const id of allIds) {
      const local = localById.get(id) ?? null;
      const remote = remoteById.get(id) ?? null;
      const merge = decideObservationWinner(
        id,
        local?.updatedAt ?? null,
        remote?.updated_at ?? null,
      );
      summary.merges.push(merge);

      if (merge.decision === 'identical') {
        summary.identical += 1;
        continue;
      }

      if (shouldPush(merge.decision) && local) {
        await pushObservationBundle(supabase, db, user.id, local, summary);
        if (merge.decision === 'keep_local') summary.keptLocal += 1;
        else summary.pushed += 1;
        continue;
      }

      if (shouldPull(merge.decision) && remote) {
        await pullObservationBundle(supabase, db, remote, local, summary);
        summary.pulled += 1;
      }
    }

    await setLastSyncAt(db, nowIso());
  } catch (err) {
    summary.offline = true;
    summary.skippedReason =
      err instanceof Error
        ? `Sync interrupted: ${err.message}`
        : 'Sync interrupted';
  }

  summary.finishedAt = nowIso();
  return summary;
}

/** Format merge decisions for Account UI (clear timestamps). */
export function formatMergeLine(merge: ObservationMergeResult): string {
  const short = merge.observationId.slice(0, 8);
  const local = merge.localUpdatedAt ?? '—';
  const remote = merge.remoteUpdatedAt ?? '—';
  switch (merge.decision) {
    case 'keep_local':
    case 'push_local':
      return `${short}: local wins (${local} > ${remote})`;
    case 'take_remote':
      return `${short}: remote wins (${remote} > ${local})`;
    case 'identical':
      return `${short}: identical (${local})`;
    default:
      return `${short}: ${merge.decision}`;
  }
}
