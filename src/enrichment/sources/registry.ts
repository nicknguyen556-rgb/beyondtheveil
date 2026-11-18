/**
 * Curated source + dataset registry with reliability ranking.
 * Suggestion and custom lists are both capped at SUGGESTIONS_CAP (5).
 */

import {
  SUGGESTIONS_CAP,
  type DatasetDefinition,
  type DatasetId,
  type SourceDefinition,
  type SourceId,
} from './types';

export const SOURCE_REGISTRY: readonly SourceDefinition[] = [
  {
    id: 'open-meteo',
    label: 'Open-Meteo',
    reliability: 95,
    datasets: ['weather', 'solar', 'water'],
    auth: 'keyless',
    signalKeys: [
      'weather.',
      'solar.sunrise',
      'solar.sunset',
      'water.temperature',
    ],
    description:
      'Free forecast + archive weather, daily sunrise/sunset, marine SST when covered.',
  },
  {
    id: 'met-no',
    label: 'MET Norway',
    reliability: 88,
    datasets: ['weather'],
    auth: 'keyless',
    signalKeys: ['weather.'],
    description:
      'Free Locationforecast (no key). Strong near-term overlap; forecast window only.',
  },
  {
    id: 'openweather',
    label: 'OpenWeather',
    reliability: 82,
    datasets: ['weather'],
    auth: 'env-key',
    envKey: 'EXPO_PUBLIC_OPENWEATHER_API_KEY',
    signalKeys: ['weather.'],
    description:
      'Env-keyed OpenWeatherMap 2.5 forecast. Enabled when EXPO_PUBLIC_OPENWEATHER_API_KEY is set.',
  },
  {
    id: 'weatherapi',
    label: 'WeatherAPI',
    reliability: 78,
    datasets: ['weather', 'solar'],
    auth: 'env-key',
    envKey: 'EXPO_PUBLIC_WEATHERAPI_KEY',
    signalKeys: ['weather.', 'solar.sunrise', 'solar.sunset'],
    description:
      'Env-keyed WeatherAPI.com. Enabled when EXPO_PUBLIC_WEATHERAPI_KEY is set.',
  },
  {
    id: 'nws',
    label: 'NWS (api.weather.gov)',
    reliability: 74,
    datasets: ['weather'],
    auth: 'keyless',
    signalKeys: ['weather.'],
    description:
      'US National Weather Service grid forecast. Keyless; US coverage only.',
  },
] as const;

export const DATASET_REGISTRY: readonly DatasetDefinition[] = [
  {
    id: 'weather',
    label: 'Weather',
    description: 'Atmospheric conditions for the observation place/time.',
    defaultMode: 'top3',
    signalKeys: [
      'weather.pressure_msl',
      'weather.wind_speed',
      'weather.wind_direction',
      'weather.humidity',
      'weather.uv_index',
      'weather.precipitation',
      'weather.temperature',
      'weather.feels_like',
      'weather.cloud_cover',
      'weather.visibility',
      'weather.dew_point',
      'weather.wind_gusts',
      'weather.conditions',
    ],
  },
  {
    id: 'solar',
    label: 'Solar',
    description: 'Sunrise/sunset anchors and derived daylight context.',
    defaultMode: 'suggestions',
    signalKeys: [
      'solar.sunrise',
      'solar.sunset',
      'solar.time_of_day',
      'solar.daylight_remaining_min',
      'solar.moon_phase',
    ],
  },
  {
    id: 'water',
    label: 'Water',
    description: 'Water / sea-surface temperature when a marine source covers the point.',
    defaultMode: 'suggestions',
    signalKeys: ['water.temperature'],
  },
  {
    id: 'custom',
    label: 'Custom / user-requested',
    description:
      'User-requested signal keys resolved through known sources or free-text fallback.',
    defaultMode: 'top3',
    signalKeys: [],
  },
] as const;

export function getSource(id: SourceId): SourceDefinition | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

export function getDataset(id: DatasetId): DatasetDefinition | undefined {
  return DATASET_REGISTRY.find((d) => d.id === id);
}

/** Sources that declare support for a dataset, sorted by reliability desc. */
export function sourcesForDataset(datasetId: DatasetId): SourceDefinition[] {
  return SOURCE_REGISTRY.filter((s) => s.datasets.includes(datasetId)).sort(
    (a, b) => b.reliability - a.reliability,
  );
}

/** Our curated suggestion list for a dataset — hard-capped at 5. */
export function suggestedSourcesForDataset(
  datasetId: DatasetId,
): SourceDefinition[] {
  return sourcesForDataset(datasetId).slice(0, SUGGESTIONS_CAP);
}

/** Infer dataset for a signal key (defaults → weather/solar/water; else custom). */
export function datasetForSignalKey(signalKey: string): DatasetId {
  if (signalKey.startsWith('weather.')) return 'weather';
  if (signalKey.startsWith('solar.')) return 'solar';
  if (signalKey.startsWith('water.')) return 'water';
  return 'custom';
}

/** Sources that claim they can supply a given signal key. */
export function sourcesForSignalKey(signalKey: string): SourceDefinition[] {
  return SOURCE_REGISTRY.filter((s) =>
    s.signalKeys.some(
      (pattern) =>
        pattern === signalKey ||
        (pattern.endsWith('.') && signalKey.startsWith(pattern)),
    ),
  ).sort((a, b) => b.reliability - a.reliability);
}

export function isSourceConfigured(source: SourceDefinition): boolean {
  if (source.auth === 'keyless') return true;
  if (!source.envKey) return false;
  const value =
    typeof process !== 'undefined'
      ? process.env?.[source.envKey]
      : undefined;
  return Boolean(value && String(value).trim().length > 0);
}

export function readEnvKey(source: SourceDefinition): string | null {
  if (!source.envKey) return null;
  const value =
    typeof process !== 'undefined'
      ? process.env?.[source.envKey]
      : undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
