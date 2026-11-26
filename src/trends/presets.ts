import type { ChartType } from '@/types/models';

import { emptyFilters, type TrendFilters, type TrendQuery } from './types';

export interface BuiltinTrendPreset {
  /** Stable id used for “built-in” rows before the user saves a copy. */
  id: string;
  name: string;
  signalKeys: string[];
  chartType: ChartType;
  filters: TrendFilters;
  description: string;
}

/** Default packs — clarity over novelty; cover weather, solar, and σ display. */
export const BUILTIN_TREND_PRESETS: readonly BuiltinTrendPreset[] = [
  {
    id: 'builtin-weather-basics',
    name: 'Weather basics',
    signalKeys: [
      'weather.temperature',
      'weather.pressure_msl',
      'weather.humidity',
      'weather.wind_speed',
    ],
    chartType: 'line',
    filters: emptyFilters(),
    description: 'Averaged multi-source temp, pressure, humidity, and wind.',
  },
  {
    id: 'builtin-solar-context',
    name: 'Solar context',
    signalKeys: ['solar.daylight_remaining_min', 'weather.uv_index', 'solar.moon_phase'],
    chartType: 'line',
    filters: emptyFilters(),
    description: 'Daylight remaining, UV, and moon illuminated fraction.',
  },
  {
    id: 'builtin-temp-with-spread',
    name: 'Temperature ± σ',
    signalKeys: ['weather.temperature'],
    chartType: 'line',
    filters: { ...emptyFilters(), showStdDev: true },
    description: 'Air temperature with optional std-dev band from per-source samples.',
  },
  {
    id: 'builtin-outcome-vs-weather',
    name: 'Outcome vs weather',
    signalKeys: ['outcome.rating', 'weather.temperature', 'weather.pressure_msl'],
    chartType: 'line',
    filters: emptyFilters(),
    description: 'Compare light outcome ratings against temperature and pressure.',
  },
] as const;

export function builtinToQuery(preset: BuiltinTrendPreset): TrendQuery {
  return {
    signalKeys: [...preset.signalKeys],
    chartType: preset.chartType,
    dateRangeStart: null,
    dateRangeEnd: null,
    filters: {
      tags: [...preset.filters.tags],
      place: preset.filters.place
        ? { ...preset.filters.place }
        : null,
      showStdDev: preset.filters.showStdDev,
      minRating: preset.filters.minRating,
    },
  };
}
