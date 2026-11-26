export { authUnavailableReason, getCurrentUser, getSession, signInWithEmail, signOut, signUpWithEmail } from './auth';
export { getSupabaseConfig, isSupabaseConfigured } from './config';
export {
  canSync,
  canUseAiSuggestions,
  getLocalEntitlement,
  resolveEntitlement,
  setLocalEntitlement,
} from './entitlement';
export { decideObservationWinner, shouldPull, shouldPush } from './merge';
export { formatMergeLine, getLastSyncAt, runCloudSync } from './engine';
export { SyncProvider, useSync } from './SyncProvider';
export { buildSyncStatus } from './status';
export { getSupabase, resetSupabaseClient } from './supabase';
export type {
  MergeDecision,
  ObservationMergeResult,
  SyncStatus,
  SyncStatusKind,
  SyncSummary,
} from './types';
