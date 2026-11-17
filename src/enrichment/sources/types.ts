/**
 * Multi-source enrichment: datasets, sources, and selection modes.
 */

export type DatasetId = 'weather' | 'solar' | 'water' | 'custom';

/**
 * Source selection mode per dataset:
 * - top3: three most reliable (usage-biased when we have counts; else ranking)
 * - suggestions: our curated most-reliable list (capped at 5)
 * - custom: user-picked sources (no hard cap)
 */
export type SourceSelectionMode = 'top3' | 'suggestions' | 'custom';

export type SourceId =
  | 'open-meteo'
  | 'met-no'
  | 'openweather'
  | 'weatherapi'
  | 'nws';

export interface SourceDefinition {
  id: SourceId;
  label: string;
  /** 0–100 curated reliability; higher is preferred. */
  reliability: number;
  /** Datasets this source can contribute to. */
  datasets: readonly DatasetId[];
  /** Free/keyless vs requires env key. */
  auth: 'keyless' | 'env-key';
  /** Env var name when auth is env-key. */
  envKey?: string;
  /** Signal keys this source can supply (prefix or exact). */
  signalKeys: readonly string[];
  description: string;
}

export interface DatasetDefinition {
  id: DatasetId;
  label: string;
  description: string;
  /** Default selection mode for this dataset. */
  defaultMode: SourceSelectionMode;
  /** Signal keys belonging to this dataset (defaults). */
  signalKeys: readonly string[];
}

export interface EnrichmentDatasetPrefs {
  datasetId: DatasetId;
  mode: SourceSelectionMode;
  /** Used when mode === 'custom'; no hard cap. */
  customSourceIds: SourceId[];
  updatedAt: string;
}

export interface SourceUsageRow {
  datasetId: DatasetId;
  sourceId: SourceId;
  useCount: number;
  lastUsedAt: string | null;
}

/** Caps for curated lists. Custom mode has no hard cap. */
export const SUGGESTIONS_CAP = 5;
export const TOP3_COUNT = 3;
