import {
  catalogLabel,
  catalogUnit,
  parseChartableNumber,
} from '@/enrichment/catalog';
import type { Observation, Signal } from '@/types/models';

import { isWithinRadiusKm } from './geo';
import {
  OUTCOME_RATING_KEY,
  type TrendBuildResult,
  type TrendFilters,
  type TrendSeries,
  type TrendSeriesPoint,
} from './types';

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function observationPassesFilters(
  observation: Observation,
  filters: TrendFilters,
  dateRangeStart: string | null,
  dateRangeEnd: string | null,
): boolean {
  const captured = observation.capturedAt;
  if (dateRangeStart && captured < dateRangeStart) return false;
  if (dateRangeEnd && captured > dateRangeEnd) return false;

  if (filters.tags.length > 0) {
    const tags = new Set(parseTags(observation.tagsJson));
    for (const required of filters.tags) {
      if (!tags.has(required.trim().toLowerCase())) return false;
    }
  }

  if (filters.place) {
    if (observation.latitude == null || observation.longitude == null) return false;
    if (
      !isWithinRadiusKm(
        observation.latitude,
        observation.longitude,
        filters.place.latitude,
        filters.place.longitude,
        filters.place.radiusKm,
      )
    ) {
      return false;
    }
  }

  return true;
}

function signalMapForObservation(
  signals: Signal[],
  observationId: string,
): Map<string, Signal> {
  const map = new Map<string, Signal>();
  for (const signal of signals) {
    if (signal.observationId === observationId) {
      map.set(signal.key, signal);
    }
  }
  return map;
}

function pointFromSignal(
  observation: Observation,
  signal: Signal | undefined,
  stdSignal: Signal | undefined,
): TrendSeriesPoint | null {
  const value = parseChartableNumber(signal?.value ?? null);
  if (value == null) return null;
  const stdDev = parseChartableNumber(stdSignal?.value ?? null);
  return {
    observationId: observation.id,
    capturedAt: observation.capturedAt,
    x: Date.parse(observation.capturedAt),
    value,
    stdDev,
    placeLabel: observation.placeLabel,
    outcomeRating: observation.outcomeRating,
  };
}

function pointFromOutcomeRating(observation: Observation): TrendSeriesPoint | null {
  if (observation.outcomeRating == null || !Number.isFinite(observation.outcomeRating)) {
    return null;
  }
  return {
    observationId: observation.id,
    capturedAt: observation.capturedAt,
    x: Date.parse(observation.capturedAt),
    value: observation.outcomeRating,
    stdDev: null,
    placeLabel: observation.placeLabel,
    outcomeRating: observation.outcomeRating,
  };
}

function seriesLabel(key: string): string {
  if (key === OUTCOME_RATING_KEY) return 'Outcome rating';
  return catalogLabel(key);
}

function seriesUnit(key: string): string | null {
  if (key === OUTCOME_RATING_KEY) return null;
  return catalogUnit(key);
}

/**
 * Build multi-series chart data from local observations + signals.
 * Averaged multi-source values live on the primary signal key; optional
 * `{key}.std_dev` companions supply spread when `filters.showStdDev` is used
 * by the chart (points always carry stdDev when present).
 */
export function buildTrendSeries(input: {
  observations: Observation[];
  signals: Signal[];
  signalKeys: string[];
  filters: TrendFilters;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
}): TrendBuildResult {
  const keys = [...new Set(input.signalKeys.map((k) => k.trim()).filter(Boolean))];
  const matched = input.observations
    .filter((o) =>
      observationPassesFilters(
        o,
        input.filters,
        input.dateRangeStart,
        input.dateRangeEnd,
      ),
    )
    .slice()
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  const series: TrendSeries[] = keys.map((key) => {
    const points: TrendSeriesPoint[] = [];
    let skippedCount = 0;

    for (const observation of matched) {
      let point: TrendSeriesPoint | null = null;
      if (key === OUTCOME_RATING_KEY) {
        point = pointFromOutcomeRating(observation);
      } else {
        const byKey = signalMapForObservation(input.signals, observation.id);
        point = pointFromSignal(
          observation,
          byKey.get(key),
          byKey.get(`${key}.std_dev`),
        );
      }
      if (point && Number.isFinite(point.x)) {
        points.push(point);
      } else {
        skippedCount += 1;
      }
    }

    // Prefer unit from first plotted signal row when catalog has none (free-text).
    let unit = seriesUnit(key);
    if (unit == null && key !== OUTCOME_RATING_KEY) {
      for (const observation of matched) {
        const byKey = signalMapForObservation(input.signals, observation.id);
        const row = byKey.get(key);
        if (row?.unit) {
          unit = row.unit;
          break;
        }
      }
    }

    return {
      key,
      label: seriesLabel(key),
      unit,
      points,
      skippedCount,
    };
  });

  const units = series
    .filter((s) => s.points.length > 0)
    .map((s) => s.unit)
    .filter((u): u is string => u != null && u.length > 0);
  const sharedUnit =
    units.length > 0 && units.every((u) => u === units[0]) ? units[0]! : null;

  return {
    series,
    matchedObservationCount: matched.length,
    sharedUnit,
  };
}

/** Inclusive end-of-day ISO when the user enters a YYYY-MM-DD date. */
export function endOfDayIso(dateOnly: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return `${dateOnly}T23:59:59.999Z`;
  }
  return dateOnly;
}

/** Start-of-day ISO when the user enters a YYYY-MM-DD date. */
export function startOfDayIso(dateOnly: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return `${dateOnly}T00:00:00.000Z`;
  }
  return dateOnly;
}
