/**
 * Shared cap for suggestions + custom source lists (both hard-capped at 5).
 */

import { CUSTOM_SOURCE_CAP, type SourceId } from './types';

export { CUSTOM_SOURCE_CAP };

export interface CapCustomSourcesResult {
  sourceIds: SourceId[];
  truncated: boolean;
  dropped: SourceId[];
  /** Clear message when extras were dropped; null when within cap. */
  message: string | null;
}

/**
 * Truncate a custom source list to CUSTOM_SOURCE_CAP, keeping first-seen order.
 * Duplicates are removed before applying the cap.
 */
export function capCustomSourceIds(
  sourceIds: readonly SourceId[],
): CapCustomSourcesResult {
  const seen = new Set<SourceId>();
  const unique: SourceId[] = [];
  for (const id of sourceIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  if (unique.length <= CUSTOM_SOURCE_CAP) {
    return {
      sourceIds: unique,
      truncated: false,
      dropped: [],
      message: null,
    };
  }

  const kept = unique.slice(0, CUSTOM_SOURCE_CAP);
  const dropped = unique.slice(CUSTOM_SOURCE_CAP);
  return {
    sourceIds: kept,
    truncated: true,
    dropped,
    message: `Custom source selection is capped at ${CUSTOM_SOURCE_CAP}. Kept ${kept.join(', ')}; dropped ${dropped.join(', ')}.`,
  };
}
