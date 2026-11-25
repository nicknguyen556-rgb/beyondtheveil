/**
 * Premium AI trend suggestions — on-device analysis of stored observations only.
 * Never invents observation IDs, signal values, or date windows outside the data.
 */

import {
  catalogLabel,
  parseChartableNumber,
} from '@/enrichment/catalog';
import type { Observation, Signal } from '@/types/models';
import { OUTCOME_RATING_KEY } from '@/trends/types';

import type { SuggestionDraft } from './types';

const MIN_CORRELATION_SAMPLES = 4;
const MIN_PERIOD_SAMPLES = 3;
const MIN_ABS_CORRELATION = 0.45;
const MAX_SUGGESTIONS = 8;
const HIGH_RATING_THRESHOLD = 4;

interface PairedPoint {
  observationId: string;
  capturedAt: string;
  x: number;
  y: number;
}

function isAnalyzableSignalKey(key: string): boolean {
  if (!key || key.startsWith('enrichment.')) return false;
  if (key.endsWith('.std_dev')) return false;
  return true;
}

function signalValueMap(
  signals: Signal[],
): Map<string, Map<string, number>> {
  /** observationId → (signalKey → numeric value) */
  const byObs = new Map<string, Map<string, number>>();
  for (const signal of signals) {
    if (!isAnalyzableSignalKey(signal.key)) continue;
    const num = parseChartableNumber(signal.value);
    if (num == null) continue;
    let inner = byObs.get(signal.observationId);
    if (!inner) {
      inner = new Map();
      byObs.set(signal.observationId, inner);
    }
    // First chartable value wins (primary averaged key preferred over duplicates).
    if (!inner.has(signal.key)) {
      inner.set(signal.key, num);
    }
  }
  return byObs;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || n !== ys.length) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i]!;
    const y = ys[i]!;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  if (den === 0 || !Number.isFinite(den)) return null;
  const r = num / den;
  return Number.isFinite(r) ? r : null;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function startOfDay(iso: string): string {
  const d = dateOnly(iso);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00.000Z` : iso;
}

function endOfDay(iso: string): string {
  const d = dateOnly(iso);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T23:59:59.999Z` : iso;
}

function pairSignalVsOutcome(
  observations: Observation[],
  byObs: Map<string, Map<string, number>>,
  signalKey: string,
): PairedPoint[] {
  const points: PairedPoint[] = [];
  for (const obs of observations) {
    if (obs.outcomeRating == null || !Number.isFinite(obs.outcomeRating)) continue;
    const signals = byObs.get(obs.id);
    const x = signals?.get(signalKey);
    if (x == null) continue;
    points.push({
      observationId: obs.id,
      capturedAt: obs.capturedAt,
      x,
      y: obs.outcomeRating,
    });
  }
  return points;
}

function pairTwoSignals(
  observations: Observation[],
  byObs: Map<string, Map<string, number>>,
  keyA: string,
  keyB: string,
): PairedPoint[] {
  const points: PairedPoint[] = [];
  for (const obs of observations) {
    const signals = byObs.get(obs.id);
    if (!signals) continue;
    const x = signals.get(keyA);
    const y = signals.get(keyB);
    if (x == null || y == null) continue;
    points.push({
      observationId: obs.id,
      capturedAt: obs.capturedAt,
      x,
      y,
    });
  }
  return points;
}

function correlationDrafts(
  observations: Observation[],
  byObs: Map<string, Map<string, number>>,
  signalKeys: string[],
): SuggestionDraft[] {
  const drafts: SuggestionDraft[] = [];
  const hasRatings = observations.some(
    (o) => o.outcomeRating != null && Number.isFinite(o.outcomeRating),
  );

  if (hasRatings) {
    for (const key of signalKeys) {
      const pairs = pairSignalVsOutcome(observations, byObs, key);
      if (pairs.length < MIN_CORRELATION_SAMPLES) continue;
      const r = pearson(
        pairs.map((p) => p.x),
        pairs.map((p) => p.y),
      );
      if (r == null || Math.abs(r) < MIN_ABS_CORRELATION) continue;

      const sorted = pairs.slice().sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      const direction = r > 0 ? 'higher' : 'lower';
      const label = catalogLabel(key);
      drafts.push({
        kind: 'correlation',
        title: `${label} ↔ outcome rating`,
        summary:
          `Across ${pairs.length} stored observations, ${label} shows a ` +
          `${direction === 'higher' ? 'positive' : 'negative'} correlation ` +
          `(r=${r.toFixed(2)}) with outcome rating. ` +
          `${direction === 'higher' ? 'Higher' : 'Lower'} ${label} lined up with better ratings.`,
        signalKeys: [key, OUTCOME_RATING_KEY],
        observationIds: sorted.map((p) => p.observationId),
        dateRangeStart: startOfDay(sorted[0]!.capturedAt),
        dateRangeEnd: endOfDay(sorted[sorted.length - 1]!.capturedAt),
        evidence: {
          correlation: Math.round(r * 1000) / 1000,
          sampleSize: pairs.length,
          signalMean: Math.round(mean(pairs.map((p) => p.x)) * 100) / 100,
          outcomeMean: Math.round(mean(pairs.map((p) => p.y)) * 100) / 100,
          method: 'pearson vs outcome.rating (stored values only)',
        },
        score: Math.abs(r) * Math.log(pairs.length + 1),
      });
    }
  }

  // Signal↔signal when we have enough overlap (and few/no outcome correlations).
  for (let i = 0; i < signalKeys.length; i += 1) {
    for (let j = i + 1; j < signalKeys.length; j += 1) {
      const keyA = signalKeys[i]!;
      const keyB = signalKeys[j]!;
      const pairs = pairTwoSignals(observations, byObs, keyA, keyB);
      if (pairs.length < MIN_CORRELATION_SAMPLES) continue;
      const r = pearson(
        pairs.map((p) => p.x),
        pairs.map((p) => p.y),
      );
      if (r == null || Math.abs(r) < MIN_ABS_CORRELATION + 0.1) continue;

      const sorted = pairs.slice().sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      const labelA = catalogLabel(keyA);
      const labelB = catalogLabel(keyB);
      drafts.push({
        kind: 'correlation',
        title: `${labelA} ↔ ${labelB}`,
        summary:
          `Across ${pairs.length} stored observations, ${labelA} and ${labelB} ` +
          `move together (r=${r.toFixed(2)}). Date window spans the supporting captures only.`,
        signalKeys: [keyA, keyB],
        observationIds: sorted.map((p) => p.observationId),
        dateRangeStart: startOfDay(sorted[0]!.capturedAt),
        dateRangeEnd: endOfDay(sorted[sorted.length - 1]!.capturedAt),
        evidence: {
          correlation: Math.round(r * 1000) / 1000,
          sampleSize: pairs.length,
          signalMean: Math.round(mean(pairs.map((p) => p.x)) * 100) / 100,
          method: 'pearson between stored signal pairs',
        },
        score: Math.abs(r) * Math.log(pairs.length + 1) * 0.85,
      });
    }
  }

  return drafts;
}

/**
 * Find contiguous-ish calendar windows where outcome ratings (or a signal)
 * sit notably above the overall mean — using only real capture timestamps.
 */
function interestingPeriodDrafts(
  observations: Observation[],
  byObs: Map<string, Map<string, number>>,
  signalKeys: string[],
): SuggestionDraft[] {
  const drafts: SuggestionDraft[] = [];
  const rated = observations
    .filter((o) => o.outcomeRating != null && Number.isFinite(o.outcomeRating))
    .slice()
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  if (rated.length >= MIN_PERIOD_SAMPLES) {
    const overallMean = mean(rated.map((o) => o.outcomeRating!));
    const high = rated.filter((o) => o.outcomeRating! >= HIGH_RATING_THRESHOLD);
    if (high.length >= MIN_PERIOD_SAMPLES && overallMean < HIGH_RATING_THRESHOLD) {
      // Cluster high ratings into date-contiguous groups (gap ≤ 14 days).
      const clusters = clusterByDateGap(high, 14);
      for (const cluster of clusters) {
        if (cluster.length < MIN_PERIOD_SAMPLES) continue;
        const clusterMean = mean(cluster.map((o) => o.outcomeRating!));
        if (clusterMean <= overallMean) continue;

        // Prefer signal keys that appear on most cluster observations.
        const topKeys = pickFrequentKeys(cluster, byObs, signalKeys, 3);
        const keysForChart =
          topKeys.length > 0 ? [...topKeys, OUTCOME_RATING_KEY] : [OUTCOME_RATING_KEY];

        drafts.push({
          kind: 'interesting_period',
          title: `Strong outcomes ${dateOnly(cluster[0]!.capturedAt)} → ${dateOnly(cluster[cluster.length - 1]!.capturedAt)}`,
          summary:
            `${cluster.length} stored observations in this window average rating ` +
            `${clusterMean.toFixed(1)} (overall mean ${overallMean.toFixed(1)}). ` +
            `Signals shown are those present on these captures` +
            (topKeys.length ? `: ${topKeys.map(catalogLabel).join(', ')}.` : '.'),
          signalKeys: keysForChart,
          observationIds: cluster.map((o) => o.id),
          dateRangeStart: startOfDay(cluster[0]!.capturedAt),
          dateRangeEnd: endOfDay(cluster[cluster.length - 1]!.capturedAt),
          evidence: {
            sampleSize: cluster.length,
            outcomeMean: Math.round(clusterMean * 100) / 100,
            method: 'high-rating date cluster vs overall mean (stored ratings only)',
          },
          score: (clusterMean - overallMean) * Math.log(cluster.length + 1),
        });
      }
    }
  }

  // Signal spikes: windows where a signal's mean is >1σ above overall.
  for (const key of signalKeys.slice(0, 12)) {
    const points: { obs: Observation; value: number }[] = [];
    for (const obs of observations) {
      const v = byObs.get(obs.id)?.get(key);
      if (v == null) continue;
      points.push({ obs, value: v });
    }
    if (points.length < MIN_PERIOD_SAMPLES + 2) continue;
    points.sort((a, b) => a.obs.capturedAt.localeCompare(b.obs.capturedAt));
    const values = points.map((p) => p.value);
    const m = mean(values);
    const variance = mean(values.map((v) => (v - m) ** 2));
    const std = Math.sqrt(variance);
    if (!Number.isFinite(std) || std === 0) continue;

    const elevated = points.filter((p) => p.value >= m + std);
    if (elevated.length < MIN_PERIOD_SAMPLES) continue;
    const clusters = clusterByDateGap(
      elevated.map((p) => p.obs),
      10,
    );
    for (const cluster of clusters) {
      if (cluster.length < MIN_PERIOD_SAMPLES) continue;
      const clusterValues = cluster
        .map((o) => byObs.get(o.id)?.get(key))
        .filter((v): v is number => v != null);
      const clusterMean = mean(clusterValues);
      if (clusterMean < m + std) continue;
      const label = catalogLabel(key);
      drafts.push({
        kind: 'interesting_period',
        title: `Elevated ${label} ${dateOnly(cluster[0]!.capturedAt)} → ${dateOnly(cluster[cluster.length - 1]!.capturedAt)}`,
        summary:
          `${cluster.length} stored observations show ${label} averaging ` +
          `${clusterMean.toFixed(1)} vs overall ${m.toFixed(1)} (±${std.toFixed(1)}). ` +
          `Window is bounded by the first and last supporting capture.`,
        signalKeys: [key],
        observationIds: cluster.map((o) => o.id),
        dateRangeStart: startOfDay(cluster[0]!.capturedAt),
        dateRangeEnd: endOfDay(cluster[cluster.length - 1]!.capturedAt),
        evidence: {
          sampleSize: cluster.length,
          signalMean: Math.round(clusterMean * 100) / 100,
          method: 'signal mean ≥ overall + 1σ (stored values only)',
        },
        score: ((clusterMean - m) / std) * Math.log(cluster.length + 1) * 0.7,
      });
    }
  }

  return drafts;
}

function clusterByDateGap(observations: Observation[], maxGapDays: number): Observation[][] {
  if (observations.length === 0) return [];
  const sorted = observations
    .slice()
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const clusters: Observation[][] = [[sorted[0]!]];
  const maxGapMs = maxGapDays * 24 * 60 * 60 * 1000;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const gap = Date.parse(curr.capturedAt) - Date.parse(prev.capturedAt);
    if (Number.isFinite(gap) && gap <= maxGapMs) {
      clusters[clusters.length - 1]!.push(curr);
    } else {
      clusters.push([curr]);
    }
  }
  return clusters;
}

function pickFrequentKeys(
  observations: Observation[],
  byObs: Map<string, Map<string, number>>,
  candidates: string[],
  limit: number,
): string[] {
  const counts = new Map<string, number>();
  for (const key of candidates) {
    let n = 0;
    for (const obs of observations) {
      if (byObs.get(obs.id)?.has(key)) n += 1;
    }
    if (n >= Math.ceil(observations.length * 0.5)) {
      counts.set(key, n);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

function fingerprint(draft: SuggestionDraft): string {
  return [
    draft.kind,
    draft.signalKeys.slice().sort().join(','),
    draft.dateRangeStart ?? '',
    draft.dateRangeEnd ?? '',
  ].join('|');
}

/**
 * Analyze local observations + signals and return ranked suggestion drafts.
 * Every observationId and date bound comes from the input rows — nothing invented.
 */
export function analyzeStoredObservations(input: {
  observations: Observation[];
  signals: Signal[];
}): SuggestionDraft[] {
  const observations = input.observations;
  if (observations.length < MIN_PERIOD_SAMPLES) return [];

  const byObs = signalValueMap(input.signals);
  const keySet = new Set<string>();
  for (const map of byObs.values()) {
    for (const key of map.keys()) keySet.add(key);
  }
  const signalKeys = [...keySet].sort();

  const drafts = [
    ...correlationDrafts(observations, byObs, signalKeys),
    ...interestingPeriodDrafts(observations, byObs, signalKeys),
  ];

  // Dedupe similar windows/keys; keep highest score.
  const best = new Map<string, SuggestionDraft>();
  for (const draft of drafts) {
    // Drop drafts whose observation IDs are not all in the input set.
    const known = new Set(observations.map((o) => o.id));
    if (!draft.observationIds.every((id) => known.has(id))) continue;
    if (draft.observationIds.length === 0) continue;

    const fp = fingerprint(draft);
    const prev = best.get(fp);
    if (!prev || draft.score > prev.score) best.set(fp, draft);
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS);
}
