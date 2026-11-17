/**
 * Resolve which sources to call for a dataset given selection mode + usage.
 */

import {
  suggestedSourcesForDataset,
  sourcesForDataset,
  sourcesForSignalKey,
  isSourceConfigured,
} from './registry';
import type {
  DatasetId,
  SourceDefinition,
  SourceId,
  SourceSelectionMode,
  SourceUsageRow,
} from './types';
import { TOP3_COUNT } from './types';

export interface SourceSelectionInput {
  datasetId: DatasetId;
  mode: SourceSelectionMode;
  /** Required when mode is custom; ignored otherwise. No hard cap. */
  customSourceIds?: readonly SourceId[];
  /** Local usage rows for this dataset (usage-bias for top3). */
  usage?: readonly SourceUsageRow[];
  /**
   * When resolving a single user-requested signal, restrict candidates
   * to sources that declare that key.
   */
  signalKey?: string;
  /** Drop env-keyed sources without a configured key (default true). */
  requireConfigured?: boolean;
}

export interface SourceSelectionResult {
  mode: SourceSelectionMode;
  sources: SourceDefinition[];
  /** Why each candidate was kept or dropped — useful in enrichment.sources. */
  notes: string[];
}

function usageCount(
  usage: readonly SourceUsageRow[] | undefined,
  sourceId: SourceId,
): number {
  return usage?.find((u) => u.sourceId === sourceId)?.useCount ?? 0;
}

/**
 * Rank sources: reliability first; when usage exists, blend so frequently
 * used sources for this dataset rise (cold-start = pure reliability).
 */
export function rankSources(
  candidates: SourceDefinition[],
  usage?: readonly SourceUsageRow[],
): SourceDefinition[] {
  const hasUsage = Boolean(usage?.some((u) => u.useCount > 0));
  return [...candidates].sort((a, b) => {
    if (!hasUsage) return b.reliability - a.reliability;
    const score = (s: SourceDefinition) =>
      s.reliability + Math.min(20, usageCount(usage, s.id) * 2);
    return score(b) - score(a);
  });
}

/**
 * Select sources for a dataset (or a single signal key) under the given mode.
 * - top3 → up to 3 after ranking (usage-biased)
 * - suggestions → curated list capped at 5
 * - custom → user list, no hard cap (configured filter still applies)
 */
export function selectSources(
  input: SourceSelectionInput,
): SourceSelectionResult {
  const requireConfigured = input.requireConfigured !== false;
  const notes: string[] = [];

  let pool: SourceDefinition[] = input.signalKey
    ? sourcesForSignalKey(input.signalKey)
    : sourcesForDataset(input.datasetId);

  if (input.signalKey && pool.length === 0) {
    // Fall back to dataset pool for unknown custom keys.
    pool = sourcesForDataset(input.datasetId);
    notes.push(
      `No source declares ${input.signalKey}; using dataset pool for ${input.datasetId}`,
    );
  }

  if (requireConfigured) {
    const before = pool.length;
    pool = pool.filter((s) => {
      const ok = isSourceConfigured(s);
      if (!ok) {
        notes.push(`${s.id} skipped (missing ${s.envKey ?? 'config'})`);
      }
      return ok;
    });
    if (pool.length < before) {
      notes.push(`Configured filter: ${pool.length}/${before} sources ready`);
    }
  }

  if (input.mode === 'custom') {
    const wanted = input.customSourceIds ?? [];
    if (wanted.length === 0) {
      notes.push('Custom mode with empty selection — no sources');
      return { mode: 'custom', sources: [], notes };
    }
    const byId = new Map(pool.map((s) => [s.id, s]));
    const selected: SourceDefinition[] = [];
    for (const id of wanted) {
      const source = byId.get(id);
      if (source) selected.push(source);
      else notes.push(`Custom source ${id} unavailable for this dataset/key`);
    }
    // No hard cap — keep user order.
    return { mode: 'custom', sources: selected, notes };
  }

  if (input.mode === 'suggestions') {
    // Curated reliability order, already capped in registry helper.
    const suggestedIds = new Set(
      suggestedSourcesForDataset(input.datasetId).map((s) => s.id),
    );
    const selected = rankSources(
      pool.filter((s) => suggestedIds.has(s.id)),
      input.usage,
    );
    // Re-apply cap after configured filter.
    const capped = selected.slice(0, 5);
    notes.push(`Suggestions mode: ${capped.length} source(s) (cap 5)`);
    return { mode: 'suggestions', sources: capped, notes };
  }

  // top3 — usage-biased reliability ranking, take 3.
  const ranked = rankSources(pool, input.usage);
  const top = ranked.slice(0, TOP3_COUNT);
  notes.push(
    `Top3 mode: ${top.map((s) => s.id).join(', ') || 'none'} (cold-start=${!(input.usage?.some((u) => u.useCount > 0) ?? false)})`,
  );
  return { mode: 'top3', sources: top, notes };
}
