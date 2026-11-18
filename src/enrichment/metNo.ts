/**
 * MET Norway Locationforecast client — free, no API key.
 * Requires an identifying User-Agent per https://api.met.no/doc/
 * Overlaps Open-Meteo on temp, humidity, pressure, wind, precip, cloud, UV, dew point.
 * Forecast/near-term timeseries only; older captures fail closed so Open-Meteo can fill.
 */

import type { WeatherProviderSnapshot } from './types';

const FORECAST_URL =
  'https://api.met.no/weatherapi/locationforecast/2.0/complete';

/** Identify the app; MET Norway rejects anonymous / generic clients. */
const USER_AGENT =
  'GeocatchDatalink/0.1 github.com/nicknguyen556-rgb/beyondtheveil';

/** Reject samples farther than this from the observation time. */
const MAX_SAMPLE_DELTA_MS = 90 * 60_000;

interface MetNoDetails {
  air_pressure_at_sea_level?: number;
  air_temperature?: number;
  apparent_air_temperature?: number;
  cloud_area_fraction?: number;
  dew_point_temperature?: number;
  fog_area_fraction?: number;
  relative_humidity?: number;
  ultraviolet_index_clear_sky?: number;
  wind_from_direction?: number;
  wind_speed?: number;
  wind_speed_of_gust?: number;
  precipitation_amount?: number;
}

interface MetNoTimeseriesEntry {
  time: string;
  data: {
    instant?: { details?: MetNoDetails };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: MetNoDetails;
    };
  };
}

interface MetNoResponse {
  properties?: {
    timeseries?: MetNoTimeseriesEntry[];
  };
}

const SYMBOL_LABELS: Record<string, string> = {
  clearsky_day: 'Clear sky',
  clearsky_night: 'Clear sky',
  clearsky_polartwilight: 'Clear sky',
  fair_day: 'Fair',
  fair_night: 'Fair',
  fair_polartwilight: 'Fair',
  partlycloudy_day: 'Partly cloudy',
  partlycloudy_night: 'Partly cloudy',
  partlycloudy_polartwilight: 'Partly cloudy',
  cloudy: 'Cloudy',
  rainshowers_day: 'Rain showers',
  rainshowers_night: 'Rain showers',
  rainshowers_polartwilight: 'Rain showers',
  rainshowersandthunder_day: 'Rain showers and thunder',
  rainshowersandthunder_night: 'Rain showers and thunder',
  rainshowersandthunder_polartwilight: 'Rain showers and thunder',
  sleetshowers_day: 'Sleet showers',
  sleetshowers_night: 'Sleet showers',
  sleetshowers_polartwilight: 'Sleet showers',
  snowshowers_day: 'Snow showers',
  snowshowers_night: 'Snow showers',
  snowshowers_polartwilight: 'Snow showers',
  rain: 'Rain',
  heavyrain: 'Heavy rain',
  heavyrainandthunder: 'Heavy rain and thunder',
  sleet: 'Sleet',
  snow: 'Snow',
  snowandthunder: 'Snow and thunder',
  fog: 'Fog',
  sleetshowersandthunder_day: 'Sleet showers and thunder',
  sleetshowersandthunder_night: 'Sleet showers and thunder',
  sleetshowersandthunder_polartwilight: 'Sleet showers and thunder',
  snowshowersandthunder_day: 'Snow showers and thunder',
  snowshowersandthunder_night: 'Snow showers and thunder',
  snowshowersandthunder_polartwilight: 'Snow showers and thunder',
  rainandthunder: 'Rain and thunder',
  sleetandthunder: 'Sleet and thunder',
  lightrainshowers_day: 'Light rain showers',
  lightrainshowers_night: 'Light rain showers',
  lightrainshowers_polartwilight: 'Light rain showers',
  lightrainshowersandthunder_day: 'Light rain showers and thunder',
  lightrainshowersandthunder_night: 'Light rain showers and thunder',
  lightrainshowersandthunder_polartwilight: 'Light rain showers and thunder',
  lightsleetshowers_day: 'Light sleet showers',
  lightsleetshowers_night: 'Light sleet showers',
  lightsleetshowers_polartwilight: 'Light sleet showers',
  lightsnowshowers_day: 'Light snow showers',
  lightsnowshowers_night: 'Light snow showers',
  lightsnowshowers_polartwilight: 'Light snow showers',
  lightssleetshowersandthunder_day: 'Light sleet showers and thunder',
  lightssleetshowersandthunder_night: 'Light sleet showers and thunder',
  lightssleetshowersandthunder_polartwilight: 'Light sleet showers and thunder',
  lightssnowshowersandthunder_day: 'Light snow showers and thunder',
  lightssnowshowersandthunder_night: 'Light snow showers and thunder',
  lightssnowshowersandthunder_polartwilight: 'Light snow showers and thunder',
  lightrain: 'Light rain',
  lightsleet: 'Light sleet',
  lightsnow: 'Light snow',
  lightrainandthunder: 'Light rain and thunder',
  lightsleetandthunder: 'Light sleet and thunder',
  lightsnowandthunder: 'Light snow and thunder',
};

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mpsToKmh(mps: number | null): number | null {
  return mps == null ? null : mps * 3.6;
}

function nearestEntry(
  series: MetNoTimeseriesEntry[],
  target: Date,
): { entry: MetNoTimeseriesEntry; deltaMs: number } | null {
  if (!series.length) return null;
  let best = series[0]!;
  let bestDelta = Math.abs(new Date(best.time).getTime() - target.getTime());
  for (let i = 1; i < series.length; i += 1) {
    const entry = series[i]!;
    const delta = Math.abs(new Date(entry.time).getTime() - target.getTime());
    if (delta < bestDelta) {
      best = entry;
      bestDelta = delta;
    }
  }
  return { entry: best, deltaMs: bestDelta };
}

function symbolLabel(code: string | undefined): string | null {
  if (!code) return null;
  const base = code.replace(/_day$|_night$|_polartwilight$/, '');
  return (
    SYMBOL_LABELS[code] ??
    SYMBOL_LABELS[`${base}_day`] ??
    base.replace(/_/g, ' ')
  );
}

/** Fetch MET Norway locationforecast sample for place/time. */
export async function fetchMetNoSnapshot(
  latitude: number,
  longitude: number,
  capturedAt: Date,
  options?: { signal?: AbortSignal },
): Promise<WeatherProviderSnapshot> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
  });
  const response = await fetch(`${FORECAST_URL}?${params.toString()}`, {
    signal: options?.signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`MET Norway HTTP ${response.status}`);
  }

  const data = (await response.json()) as MetNoResponse;
  const series = data.properties?.timeseries;
  if (!series?.length) {
    throw new Error('MET Norway returned no timeseries');
  }

  const nearest = nearestEntry(series, capturedAt);
  if (!nearest) {
    throw new Error('MET Norway returned no timeseries');
  }
  if (nearest.deltaMs > MAX_SAMPLE_DELTA_MS) {
    throw new Error(
      'MET Norway has no sample near this observation time (forecast window only)',
    );
  }

  const details = nearest.entry.data.instant?.details ?? {};
  const nextHour = nearest.entry.data.next_1_hours;
  const precip = finiteOrNull(nextHour?.details?.precipitation_amount);

  return {
    providerId: 'met-no',
    endpointLabel: 'met-no:locationforecast',
    temperatureC: finiteOrNull(details.air_temperature),
    feelsLikeC: finiteOrNull(details.apparent_air_temperature),
    humidityPct: finiteOrNull(details.relative_humidity),
    dewPointC: finiteOrNull(details.dew_point_temperature),
    precipitationMm: precip,
    pressureHpa: finiteOrNull(details.air_pressure_at_sea_level),
    cloudCoverPct: finiteOrNull(details.cloud_area_fraction),
    visibilityM: null,
    windSpeedKmh: mpsToKmh(finiteOrNull(details.wind_speed)),
    windDirectionDeg: finiteOrNull(details.wind_from_direction),
    windGustsKmh: mpsToKmh(finiteOrNull(details.wind_speed_of_gust)),
    uvIndex: finiteOrNull(details.ultraviolet_index_clear_sky),
    conditions: symbolLabel(nextHour?.summary?.symbol_code),
    sunriseIso: null,
    sunsetIso: null,
    waterTempC: null,
    waterUnavailableReason: 'MET Norway locationforecast has no marine SST',
    sampleTimeIso: nearest.entry.time,
    confidence: 0.88,
  };
}
