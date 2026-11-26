import type { ChartType } from '@/types/models';

/** Circle filter around a map point (km). */
export interface PlaceRadiusFilter {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

/**
 * Persisted in `trend_views.filters_json`.
 * Tags use AND semantics (observation must include every listed tag).
 * `minRating` keeps only observations with outcome_rating ≥ that value (1–5).
 */
export interface TrendFilters {
  tags: string[];
  place: PlaceRadiusFilter | null;
  /** Plot ±σ bands from `{signalKey}.std_dev` companions when present. */
  showStdDev: boolean;
  /** Inclusive floor on light outcome rating; null = no rating filter. */
  minRating: number | null;
}

/** In-memory editor state for the Trends tab (maps 1:1 to a saved preset). */
export interface TrendQuery {
  signalKeys: string[];
  chartType: ChartType;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  filters: TrendFilters;
}

export interface TrendSeriesPoint {
  observationId: string;
  capturedAt: string;
  /** Epoch ms for chart X. */
  x: number;
  value: number;
  /** Sample std-dev from companion signal when available. */
  stdDev: number | null;
  placeLabel: string | null;
  outcomeRating: number | null;
}

export interface TrendSeries {
  key: string;
  label: string;
  unit: string | null;
  points: TrendSeriesPoint[];
  /** Observations matched by filters that lacked a chartable value for this key. */
  skippedCount: number;
}

export interface TrendBuildResult {
  series: TrendSeries[];
  /** Observations that passed place/tag/date filters. */
  matchedObservationCount: number;
  sharedUnit: string | null;
}

export const OUTCOME_RATING_KEY = 'outcome.rating';

export function emptyFilters(): TrendFilters {
  return { tags: [], place: null, showStdDev: false, minRating: null };
}

export function defaultTrendQuery(): TrendQuery {
  return {
    signalKeys: ['weather.temperature', 'weather.pressure_msl', 'weather.humidity'],
    chartType: 'line',
    dateRangeStart: null,
    dateRangeEnd: null,
    filters: emptyFilters(),
  };
}

export function parseTrendFilters(raw: string | null | undefined): TrendFilters {
  const base = emptyFilters();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<TrendFilters>;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [];
    let place: PlaceRadiusFilter | null = null;
    if (
      parsed.place &&
      typeof parsed.place === 'object' &&
      typeof parsed.place.latitude === 'number' &&
      typeof parsed.place.longitude === 'number' &&
      typeof parsed.place.radiusKm === 'number' &&
      Number.isFinite(parsed.place.latitude) &&
      Number.isFinite(parsed.place.longitude) &&
      Number.isFinite(parsed.place.radiusKm) &&
      parsed.place.radiusKm > 0
    ) {
      place = {
        latitude: parsed.place.latitude,
        longitude: parsed.place.longitude,
        radiusKm: parsed.place.radiusKm,
      };
    }
    let minRating: number | null = null;
    if (
      typeof parsed.minRating === 'number' &&
      Number.isFinite(parsed.minRating) &&
      parsed.minRating >= 1 &&
      parsed.minRating <= 5
    ) {
      minRating = Math.round(parsed.minRating);
    }
    return {
      tags,
      place,
      showStdDev: Boolean(parsed.showStdDev),
      minRating,
    };
  } catch {
    return base;
  }
}

export function serializeTrendFilters(filters: TrendFilters): string {
  return JSON.stringify({
    tags: filters.tags,
    place: filters.place,
    showStdDev: filters.showStdDev,
    minRating: filters.minRating,
  });
}
