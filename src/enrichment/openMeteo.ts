/**
 * Open-Meteo client — free, no API key.
 * Weather: archive (historical) or forecast (near-term).
 * Marine: sea-surface temperature when coverage exists.
 */

import { wmoWeatherCodeLabel } from './wmo';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

/** Prefer forecast API for the last ~90 days (better UV / visibility coverage). */
const FORECAST_LOOKBACK_MS = 90 * 86_400_000;

const HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'precipitation',
  'pressure_msl',
  'cloud_cover',
  'visibility',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'weather_code',
  'uv_index',
].join(',');

const ARCHIVE_HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'precipitation',
  'pressure_msl',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'weather_code',
].join(',');

const DAILY_VARS = 'sunrise,sunset';

export interface OpenMeteoSnapshot {
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  dewPointC: number | null;
  precipitationMm: number | null;
  pressureHpa: number | null;
  cloudCoverPct: number | null;
  visibilityM: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windGustsKmh: number | null;
  uvIndex: number | null;
  conditions: string | null;
  sunriseIso: string | null;
  sunsetIso: string | null;
  waterTempC: number | null;
  waterUnavailableReason: string | null;
  sampleTimeIso: string | null;
  weatherEndpoint: 'forecast' | 'archive';
}

interface HourlyBlock {
  time: string[];
  temperature_2m?: Array<number | null>;
  relative_humidity_2m?: Array<number | null>;
  dew_point_2m?: Array<number | null>;
  apparent_temperature?: Array<number | null>;
  precipitation?: Array<number | null>;
  pressure_msl?: Array<number | null>;
  cloud_cover?: Array<number | null>;
  visibility?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
  weather_code?: Array<number | null>;
  uv_index?: Array<number | null>;
  sea_surface_temperature?: Array<number | null>;
}

interface DailyBlock {
  sunrise?: string[];
  sunset?: string[];
}

interface WeatherResponse {
  hourly?: HourlyBlock;
  daily?: DailyBlock;
  reason?: string;
  error?: boolean;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nearestHourIndex(times: string[], target: Date): number {
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  const targetMs = target.getTime();
  for (let i = 0; i < times.length; i += 1) {
    const ms = new Date(times[i]!).getTime();
    const delta = Math.abs(ms - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

function pickNumber(
  series: Array<number | null> | undefined,
  index: number,
): number | null {
  if (!series || index < 0 || index >= series.length) return null;
  const value = series[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Open-Meteo HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function weatherUrl(
  lat: number,
  lon: number,
  day: string,
  endpoint: 'forecast' | 'archive',
): string {
  const base = endpoint === 'forecast' ? FORECAST_URL : ARCHIVE_URL;
  const hourly = endpoint === 'forecast' ? HOURLY_VARS : ARCHIVE_HOURLY_VARS;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: day,
    end_date: day,
    hourly,
    daily: DAILY_VARS,
    timezone: 'auto',
    wind_speed_unit: 'kmh',
  });
  return `${base}?${params.toString()}`;
}

function marineUrl(lat: number, lon: number, day: string): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: day,
    end_date: day,
    hourly: 'sea_surface_temperature',
    timezone: 'auto',
  });
  return `${MARINE_URL}?${params.toString()}`;
}

function chooseEndpoint(capturedAt: Date, now = new Date()): 'forecast' | 'archive' {
  const age = now.getTime() - capturedAt.getTime();
  if (age <= FORECAST_LOOKBACK_MS && age >= -7 * 86_400_000) {
    return 'forecast';
  }
  return 'archive';
}

function mapWeather(
  data: WeatherResponse,
  capturedAt: Date,
  endpoint: 'forecast' | 'archive',
): Omit<OpenMeteoSnapshot, 'waterTempC' | 'waterUnavailableReason'> {
  const hourly = data.hourly;
  if (!hourly?.time?.length) {
    throw new Error(data.reason ?? 'Open-Meteo returned no hourly weather');
  }

  const index = nearestHourIndex(hourly.time, capturedAt);
  const code = pickNumber(hourly.weather_code, index);

  return {
    temperatureC: pickNumber(hourly.temperature_2m, index),
    feelsLikeC: pickNumber(hourly.apparent_temperature, index),
    humidityPct: pickNumber(hourly.relative_humidity_2m, index),
    dewPointC: pickNumber(hourly.dew_point_2m, index),
    precipitationMm: pickNumber(hourly.precipitation, index),
    pressureHpa: pickNumber(hourly.pressure_msl, index),
    cloudCoverPct: pickNumber(hourly.cloud_cover, index),
    visibilityM: pickNumber(hourly.visibility, index),
    windSpeedKmh: pickNumber(hourly.wind_speed_10m, index),
    windDirectionDeg: pickNumber(hourly.wind_direction_10m, index),
    windGustsKmh: pickNumber(hourly.wind_gusts_10m, index),
    uvIndex: pickNumber(hourly.uv_index, index),
    conditions: code == null ? null : wmoWeatherCodeLabel(code),
    sunriseIso: data.daily?.sunrise?.[0] ?? null,
    sunsetIso: data.daily?.sunset?.[0] ?? null,
    sampleTimeIso: hourly.time[index] ?? null,
    weatherEndpoint: endpoint,
  };
}

async function fetchWaterTemp(
  lat: number,
  lon: number,
  day: string,
  capturedAt: Date,
  signal?: AbortSignal,
): Promise<{ value: number | null; reason: string | null }> {
  try {
    const data = await fetchJson<WeatherResponse>(marineUrl(lat, lon, day), signal);
    if (data.error) {
      return {
        value: null,
        reason: data.reason ?? 'Marine model unavailable for this location',
      };
    }
    const hourly = data.hourly;
    if (!hourly?.time?.length) {
      return { value: null, reason: 'No marine coverage at this location' };
    }
    const index = nearestHourIndex(hourly.time, capturedAt);
    const value = pickNumber(hourly.sea_surface_temperature, index);
    if (value == null) {
      return { value: null, reason: 'Sea-surface temperature unavailable' };
    }
    return { value, reason: null };
  } catch (err) {
    return {
      value: null,
      reason: err instanceof Error ? err.message : 'Marine request failed',
    };
  }
}

async function fetchWeatherPayload(
  latitude: number,
  longitude: number,
  day: string,
  capturedAt: Date,
  signal?: AbortSignal,
): Promise<{
  mapped: Omit<OpenMeteoSnapshot, 'waterTempC' | 'waterUnavailableReason'>;
}> {
  const preferred = chooseEndpoint(capturedAt);
  const order: Array<'forecast' | 'archive'> =
    preferred === 'forecast' ? ['forecast', 'archive'] : ['archive', 'forecast'];

  let lastError: Error | null = null;
  for (const endpoint of order) {
    try {
      const weather = await fetchJson<WeatherResponse>(
        weatherUrl(latitude, longitude, day, endpoint),
        signal,
      );
      if (weather.error) {
        throw new Error(weather.reason ?? 'Open-Meteo weather error');
      }
      return { mapped: mapWeather(weather, capturedAt, endpoint) };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Open-Meteo weather unavailable');
}

/** Fetch weather + optional marine SST for a place/time. Throws only if weather fails hard. */
export async function fetchOpenMeteoSnapshot(
  latitude: number,
  longitude: number,
  capturedAt: Date,
  options?: { signal?: AbortSignal },
): Promise<OpenMeteoSnapshot> {
  const day = ymd(capturedAt);
  const { mapped } = await fetchWeatherPayload(
    latitude,
    longitude,
    day,
    capturedAt,
    options?.signal,
  );
  const water = await fetchWaterTemp(
    latitude,
    longitude,
    day,
    capturedAt,
    options?.signal,
  );

  return {
    ...mapped,
    waterTempC: water.value,
    waterUnavailableReason: water.reason,
  };
}
