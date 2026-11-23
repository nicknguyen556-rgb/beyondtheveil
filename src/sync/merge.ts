import type { MergeDecision, ObservationMergeResult } from './types';

/**
 * Last-write-wins per observation using ISO timestamps.
 * Equal timestamps → treat as identical (no write). Missing side loses.
 */
export function decideObservationWinner(
  observationId: string,
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined,
): ObservationMergeResult {
  if (!localUpdatedAt && !remoteUpdatedAt) {
    return {
      observationId,
      decision: 'identical',
      localUpdatedAt: null,
      remoteUpdatedAt: null,
    };
  }

  if (!localUpdatedAt && remoteUpdatedAt) {
    return {
      observationId,
      decision: 'take_remote',
      localUpdatedAt: null,
      remoteUpdatedAt,
    };
  }

  if (localUpdatedAt && !remoteUpdatedAt) {
    return {
      observationId,
      decision: 'push_local',
      localUpdatedAt,
      remoteUpdatedAt: null,
    };
  }

  const localMs = Date.parse(localUpdatedAt!);
  const remoteMs = Date.parse(remoteUpdatedAt!);

  if (Number.isNaN(localMs) && Number.isNaN(remoteMs)) {
    return {
      observationId,
      decision: 'identical',
      localUpdatedAt: localUpdatedAt!,
      remoteUpdatedAt: remoteUpdatedAt!,
    };
  }
  if (Number.isNaN(localMs)) {
    return {
      observationId,
      decision: 'take_remote',
      localUpdatedAt: localUpdatedAt!,
      remoteUpdatedAt: remoteUpdatedAt!,
    };
  }
  if (Number.isNaN(remoteMs)) {
    return {
      observationId,
      decision: 'push_local',
      localUpdatedAt: localUpdatedAt!,
      remoteUpdatedAt: remoteUpdatedAt!,
    };
  }

  if (localMs > remoteMs) {
    return {
      observationId,
      decision: 'keep_local',
      localUpdatedAt: localUpdatedAt!,
      remoteUpdatedAt: remoteUpdatedAt!,
    };
  }
  if (remoteMs > localMs) {
    return {
      observationId,
      decision: 'take_remote',
      localUpdatedAt: localUpdatedAt!,
      remoteUpdatedAt: remoteUpdatedAt!,
    };
  }

  return {
    observationId,
    decision: 'identical',
    localUpdatedAt: localUpdatedAt!,
    remoteUpdatedAt: remoteUpdatedAt!,
  };
}

/** True when the local side should be written to the cloud. */
export function shouldPush(decision: MergeDecision): boolean {
  return decision === 'push_local' || decision === 'keep_local';
}

/** True when the remote side should overwrite local SQLite. */
export function shouldPull(decision: MergeDecision): boolean {
  return decision === 'take_remote';
}
