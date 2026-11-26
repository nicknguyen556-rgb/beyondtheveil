import type { SQLiteDatabase } from 'expo-sqlite';

import {
  countPendingObservations,
  getSyncLastError,
  getSyncOfflineFlag,
} from '@/db/syncQueue';
import type { Entitlement } from '@/types/models';

import { canSync } from './entitlement';
import { getLastSyncAt } from './engine';
import { isSupabaseConfigured } from './config';
import type { SyncStatus, SyncStatusKind } from './types';

function messageFor(
  kind: SyncStatusKind,
  pendingCount: number,
  lastError: string | null,
): string {
  switch (kind) {
    case 'local_only':
      return 'Local-only — changes stay on this device.';
    case 'signed_out':
      return pendingCount > 0
        ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} queued locally. Sign in to sync.`
        : 'Sign in to sync across devices.';
    case 'syncing':
      return pendingCount > 0
        ? `Syncing… ${pendingCount} pending`
        : 'Syncing…';
    case 'offline':
      return pendingCount > 0
        ? `Offline — ${pendingCount} change${pendingCount === 1 ? '' : 's'} queued. Will retry on reconnect.`
        : 'Offline — will retry on reconnect.';
    case 'pending':
      return `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync.`;
    case 'error':
      return lastError
        ? `Sync issue — ${lastError}`
        : 'Sync issue — tap Sync now to retry.';
    case 'idle':
    default:
      return 'Up to date.';
  }
}

/**
 * Build a simple sync status snapshot for Account (and auto-retry decisions).
 * Free / unconfigured never claim cloud pending work as active sync.
 */
export async function buildSyncStatus(
  db: SQLiteDatabase,
  options: {
    entitlement: Entitlement;
    signedIn: boolean;
    syncing?: boolean;
  },
): Promise<SyncStatus> {
  const pendingCount = await countPendingObservations(db);
  const lastSyncAt = await getLastSyncAt(db);
  const offline = await getSyncOfflineFlag(db);
  const lastError = await getSyncLastError(db);
  const configured = isSupabaseConfigured();

  let kind: SyncStatusKind;

  if (!configured || !canSync(options.entitlement)) {
    kind = 'local_only';
  } else if (!options.signedIn) {
    kind = 'signed_out';
  } else if (options.syncing) {
    kind = 'syncing';
  } else if (offline && pendingCount > 0) {
    kind = 'offline';
  } else if (offline && lastError) {
    kind = 'error';
  } else if (pendingCount > 0) {
    kind = 'pending';
  } else {
    kind = 'idle';
  }

  return {
    kind,
    message: messageFor(kind, pendingCount, lastError),
    pendingCount: canSync(options.entitlement) ? pendingCount : 0,
    lastSyncAt,
    lastError: canSync(options.entitlement) ? lastError : null,
    offline: canSync(options.entitlement) ? offline : false,
  };
}
