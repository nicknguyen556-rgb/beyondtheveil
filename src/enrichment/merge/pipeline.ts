/**
 * Shared multi-source merge pipeline for every enrichment dataset.
 * Fetch N sources → average numeric fields → keep per-source samples for std-dev.
 */

import {
  circularMeanDegrees,
  circularStdDevDegrees,
  mean,
  sampleStdDev,
} from './stats';

export interface SourceSample {
  sourceId: string;
  value: number;
  confidence: number;
  /** Optional endpoint / model label for provenance. */
  endpointLabel?: string;
  sampledAt?: string | null;
}

export type MergeMethod = 'average' | 'single' | 'none';

export interface MergedNumericResult {
  /** Single averaged (or sole) value for the signal row. */
  value: number | null;
  /** Sample std-dev across contributing sources; null if &lt; 2 samples. */
  stdDev: number | null;
  /** Chart-ready per-source samples (same order as contributions). */
  samples: SourceSample[];
  confidence: number;
  method: MergeMethod;
}

export interface MergeNumericOptions {
  /** Use circular statistics (wind direction). */
  circular?: boolean;
}

function mergeConfidence(samples: SourceSample[]): number {
  if (samples.length === 0) return 0;
  const base =
    samples.reduce((sum, s) => sum + s.confidence, 0) / samples.length;
  const bump = Math.min(0.08, 0.04 * (samples.length - 1));
  return Math.min(0.98, Number((base + bump).toFixed(3)));
}

/**
 * Average numeric samples from multiple sources into one value.
 * Failed / missing sources are simply absent from `samples`.
 */
export function mergeNumericSamples(
  samples: SourceSample[],
  options: MergeNumericOptions = {},
): MergedNumericResult {
  const finite = samples.filter(
    (s) => typeof s.value === 'number' && Number.isFinite(s.value),
  );

  if (finite.length === 0) {
    return {
      value: null,
      stdDev: null,
      samples: [],
      confidence: 0,
      method: 'none',
    };
  }

  if (finite.length === 1) {
    return {
      value: finite[0]!.value,
      stdDev: null,
      samples: finite,
      confidence: mergeConfidence(finite),
      method: 'single',
    };
  }

  const values = finite.map((s) => s.value);
  if (options.circular) {
    return {
      value: circularMeanDegrees(values),
      stdDev: circularStdDevDegrees(values),
      samples: finite,
      confidence: mergeConfidence(finite),
      method: 'average',
    };
  }

  return {
    value: mean(values),
    stdDev: sampleStdDev(values),
    samples: finite,
    confidence: mergeConfidence(finite),
    method: 'average',
  };
}

/** Free-text / unavailable fallback when no source succeeds for a signal. */
export function freeTextFallbackValue(
  note = 'unavailable',
): { value: string; source: 'manual'; confidence: 0 } {
  return { value: note, source: 'manual', confidence: 0 };
}

/** Serialize a merged numeric result for enrichment.sources / chart series. */
export function serializeMergedNumeric(result: MergedNumericResult): {
  value: number | null;
  stdDev: number | null;
  method: MergeMethod;
  confidence: number;
  samples: Array<{
    sourceId: string;
    value: number;
    confidence: number;
    endpointLabel?: string;
    sampledAt?: string | null;
  }>;
} {
  return {
    value: result.value,
    stdDev: result.stdDev,
    method: result.method,
    confidence: result.confidence,
    samples: result.samples.map((s) => ({
      sourceId: s.sourceId,
      value: Number(s.value.toFixed(4)),
      confidence: s.confidence,
      endpointLabel: s.endpointLabel,
      sampledAt: s.sampledAt ?? null,
    })),
  };
}
