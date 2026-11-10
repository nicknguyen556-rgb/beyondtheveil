/**
 * Default enrichment signal catalog (GD-5).
 * Keys are stored on `signals.key`; values are always text in SQLite.
 */

export type SignalAvailability = 'default' | 'when_available' | 'derived';

export interface SignalCatalogEntry {
  key: string;
  label: string;
  unit: string | null;
  availability: SignalAvailability;
  description: string;
  trendable: boolean;
}

/** Canonical keys used by Open-Meteo + solar enrichment. */
export const SIGNAL_CATALOG: readonly SignalCatalogEntry[] = [
  {
    key: 'solar.time_of_day',
    label: 'Time of day',
    unit: null,
    availability: 'derived',
    description: 'Solar context bucket from sunrise/sunset (night, dawn, morning, midday, afternoon, dusk).',
    trendable: true,
  },
  {
    key: 'solar.daylight_remaining_min',
    label: 'Daylight remaining',
    unit: 'min',
    availability: 'derived',
    description: 'Minutes until sunset at the observation time; 0 after sunset / before sunrise night.',
    trendable: true,
  },
  {
    key: 'solar.sunrise',
    label: 'Sunrise',
    unit: null,
    availability: 'default',
    description: 'Local sunrise timestamp for the observation date (ISO).',
    trendable: false,
  },
  {
    key: 'solar.sunset',
    label: 'Sunset',
    unit: null,
    availability: 'default',
    description: 'Local sunset timestamp for the observation date (ISO).',
    trendable: false,
  },
  {
    key: 'solar.moon_phase',
    label: 'Moon phase',
    unit: null,
    availability: 'derived',
    description: 'Illuminated fraction 0–1 plus phase name (new, waxing crescent, …).',
    trendable: true,
  },
  {
    key: 'weather.pressure_msl',
    label: 'Barometric pressure',
    unit: 'hPa',
    availability: 'default',
    description: 'Mean sea-level pressure at the nearest hourly sample.',
    trendable: true,
  },
  {
    key: 'weather.wind_speed',
    label: 'Wind speed',
    unit: 'km/h',
    availability: 'default',
    description: '10 m wind speed.',
    trendable: true,
  },
  {
    key: 'weather.wind_direction',
    label: 'Wind direction',
    unit: 'deg',
    availability: 'default',
    description: '10 m wind direction (degrees, meteorological).',
    trendable: true,
  },
  {
    key: 'weather.humidity',
    label: 'Humidity',
    unit: '%',
    availability: 'default',
    description: 'Relative humidity at 2 m.',
    trendable: true,
  },
  {
    key: 'weather.uv_index',
    label: 'UV index',
    unit: null,
    availability: 'default',
    description: 'UV index at the nearest hourly sample when the model provides it.',
    trendable: true,
  },
  {
    key: 'weather.precipitation',
    label: 'Precipitation',
    unit: 'mm',
    availability: 'default',
    description: 'Hourly precipitation total.',
    trendable: true,
  },
  {
    key: 'weather.temperature',
    label: 'Air temperature',
    unit: '°C',
    availability: 'default',
    description: '2 m air temperature.',
    trendable: true,
  },
  {
    key: 'weather.feels_like',
    label: 'Feels like',
    unit: '°C',
    availability: 'default',
    description: 'Apparent temperature.',
    trendable: true,
  },
  {
    key: 'weather.cloud_cover',
    label: 'Cloud cover',
    unit: '%',
    availability: 'default',
    description: 'Total cloud cover.',
    trendable: true,
  },
  {
    key: 'weather.visibility',
    label: 'Visibility',
    unit: 'm',
    availability: 'when_available',
    description: 'Horizontal visibility when the model returns it.',
    trendable: true,
  },
  {
    key: 'weather.dew_point',
    label: 'Dew point',
    unit: '°C',
    availability: 'default',
    description: '2 m dew point temperature.',
    trendable: true,
  },
  {
    key: 'weather.wind_gusts',
    label: 'Wind gusts',
    unit: 'km/h',
    availability: 'when_available',
    description: 'Peak wind gusts when available.',
    trendable: true,
  },
  {
    key: 'weather.conditions',
    label: 'Conditions',
    unit: null,
    availability: 'default',
    description: 'WMO weather-code summary text for the hour.',
    trendable: true,
  },
  {
    key: 'water.temperature',
    label: 'Water temperature',
    unit: '°C',
    availability: 'when_available',
    description:
      'Sea-surface temperature from Open-Meteo Marine when the location has coverage; otherwise unavailable (free-text ready).',
    trendable: true,
  },
  {
    key: 'enrichment.provider',
    label: 'Provider',
    unit: null,
    availability: 'derived',
    description: 'Data source label (open-meteo).',
    trendable: false,
  },
  {
    key: 'enrichment.fetched_at',
    label: 'Fetched at',
    unit: null,
    availability: 'derived',
    description: 'ISO timestamp of the last successful enrichment attempt.',
    trendable: false,
  },
  {
    key: 'enrichment.status',
    label: 'Status',
    unit: null,
    availability: 'derived',
    description: 'ok | partial | failed | skipped.',
    trendable: false,
  },
  {
    key: 'enrichment.error',
    label: 'Error',
    unit: null,
    availability: 'derived',
    description: 'Human-readable failure note when status is partial/failed.',
    trendable: false,
  },
] as const;

export const ENRICHMENT_SIGNAL_KEYS: readonly string[] = SIGNAL_CATALOG.map(
  (entry) => entry.key,
);

export function catalogLabel(key: string): string {
  return SIGNAL_CATALOG.find((entry) => entry.key === key)?.label ?? key;
}

export function catalogUnit(key: string): string | null {
  return SIGNAL_CATALOG.find((entry) => entry.key === key)?.unit ?? null;
}
