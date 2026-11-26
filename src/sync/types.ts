import type { Entitlement, PlaceSource, SignalSource, TimeSource } from '@/types/models';

/** Remote observation row mirrored in Supabase Postgres. */
export interface RemoteObservation {
  id: string;
  user_id: string;
  photo_storage_path: string | null;
  latitude: number | null;
  longitude: number | null;
  captured_at: string;
  place_label: string | null;
  place_source: PlaceSource | null;
  time_source: TimeSource | null;
  tags_json: string;
  outcome_rating: number | null;
  outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Remote signal row mirrored in Supabase Postgres. */
export interface RemoteSignal {
  id: string;
  user_id: string;
  observation_id: string;
  key: string;
  source: SignalSource;
  value: string | null;
  unit: string | null;
  confidence: number | null;
  created_at: string;
}

export interface RemoteProfile {
  user_id: string;
  entitlement: Entitlement;
  updated_at: string;
}

export type MergeDecision = 'keep_local' | 'take_remote' | 'push_local' | 'identical';

export interface ObservationMergeResult {
  observationId: string;
  decision: MergeDecision;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  pushed: number;
  pulled: number;
  keptLocal: number;
  identical: number;
  photosUploaded: number;
  photosDownloaded: number;
  offline: boolean;
  skippedReason: string | null;
  merges: ObservationMergeResult[];
  /** Distinct observations still waiting in the local offline queue after this run. */
  pendingCount: number;
}

/**
 * Simple Account-facing sync status. Free / unconfigured stay `local_only`.
 * Premium surfaces pending queue + offline / syncing states.
 */
export type SyncStatusKind =
  | 'local_only'
  | 'signed_out'
  | 'idle'
  | 'pending'
  | 'syncing'
  | 'offline'
  | 'error';

export interface SyncStatus {
  kind: SyncStatusKind;
  /** Human-readable one-liner for Account. */
  message: string;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  offline: boolean;
}

export const PHOTO_BUCKET = 'observation-photos';
