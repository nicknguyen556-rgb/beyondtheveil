/**
 * WeatherAPI.com — env-keyed (EXPO_PUBLIC_WEATHERAPI_KEY).
 * Supplies overlapping weather numerics + astronomy (sunrise/sunset).
 */

import { getSource, readEnvKey } from './sources/registry';
import type { WeatherProviderSnapshot } from './types';

const HISTORY_URL = 'https://api.weatherapi.com/v1/history.json';
const FORECAST_URL = 'https://api.weatherapi.com/v1/forecast.json';
const MAX_SAMPLE_DELTA_MS = 90 * 60_000;

interface WaHour {
  time_epoch?: number;
  time?: string;
  temp_c?: number;
  feelslike_c?: number;
  humidity?: number;
  dewpoint_c?: number;
  precip_mm?: number;
  pressure_mb?: number;
  cloud?: number;
  vis_km?: number;
  wind_kph?: number;
  wind_degree?: number;
  gust_kph?: number;
  uv?: number;
  condition?: { text?: string };
}

interface WaAstro {
  sunrise?: string;
  sunset?: string;
}

interface WaDayBlock {
  hour?: WaHour[];
  astro?: WaAstro;
  date?: string;
}

interface WaResponse {
  forecast?: { forecastday?: WaDayBlock[] };
  error?: { message?: string };
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parse WeatherAPI "06:12 AM" on a given YMD into ISO (best-effort local). */
function parseAstroClock(day: string, clock: string | undefined): string | null {
  if (!clock) return null;
  const match = clock.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3]!.toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  const iso = `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

async function fetchDay(
  urlBase: string,
  apiKey: string,
  latitude: number,
  longitude: number,
  day: string,
  signal?: AbortSignal,
): Promise<WaResponse> {
  const params = new URLSearchParams({
    key: apiKey,
    q: `${latitude},${longitude}`,
    dt: day,
  });
  const response = await fetch(`${urlBase}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`WeatherAPI HTTP ${response.status}`);
  }
  return (await response.json()) as WaResponse;
}

export async function fetchWeatherApiSnapshot(
  latitude: number,
  longitude: number,
  capturedAt: Date,
  options?: { signal?: AbortSignal },
): Promise<WeatherProviderSnapshot> {
  const source = getSource('weatherapi');
  const apiKey = source ? readEnvKey(source) : null;
  if (!apiKey) {
    throw new Error('WeatherAPI skipped: EXPO_PUBLIC_WEATHERAPI_KEY not set');
  }

  const day = ymd(capturedAt);
  const ageMs = Date.now() - capturedAt.getTime();
  // History for past days; forecast endpoint for today / near future.
  const preferHistory = ageMs > 12 * 60 * 60_000;
  const order = preferHistory
    ? [HISTORY_URL, FORECAST_URL]
    : [FORECAST_URL, HISTORY_URL];

  let data: WaResponse | null = null;
  let lastError: Error | null = null;
  for (const base of order) {
    try {
      const next = await fetchDay(
        base,
        apiKey,
        latitude,
        longitude,
        day,
        options?.signal,
      );
      if (next.error?.message) {
        throw new Error(next.error.message);
      }
      if (next.forecast?.forecastday?.[0]?.hour?.length) {
        data = next;
        break;
      }
      throw new Error('WeatherAPI returned no hourly rows');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!data) {
    throw lastError ?? new Error('WeatherAPI unavailable');
  }

  const block = data.forecast!.forecastday![0]!;
  const hours = block.hour ?? [];
  let best = hours[0]!;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const hour of hours) {
    const epoch = hour.time_epoch;
    if (epoch == null) continue;
    const delta = Math.abs(epoch * 1000 - capturedAt.getTime());
    if (delta < bestDelta) {
      best = hour;
      bestDelta = delta;
    }
  }

  if (!Number.isFinite(bestDelta) || bestDelta > MAX_SAMPLE_DELTA_MS) {
    throw new Error('WeatherAPI has no hour near this observation time');
  }

  const visKm = finiteOrNull(best.vis_km);
  const dayDate = block.date ?? day;

  return {
    providerId: 'weatherapi',
    endpointLabel: 'weatherapi:history|forecast',
    temperatureC: finiteOrNull(best.temp_c),
    feelsLikeC: finiteOrNull(best.feelslike_c),
    humidityPct: finiteOrNull(best.humidity),
    dewPointC: finiteOrNull(best.dewpoint_c),
    precipitationMm: finiteOrNull(best.precip_mm),
    pressureHpa: finiteOrNull(best.pressure_mb),
    cloudCoverPct: finiteOrNull(best.cloud),
    visibilityM: visKm == null ? null : visKm * 1000,
    windSpeedKmh: finiteOrNull(best.wind_kph),
    windDirectionDeg: finiteOrNull(best.wind_degree),
    windGustsKmh: finiteOrNull(best.gust_kph),
    uvIndex: finiteOrNull(best.uv),
    conditions: best.condition?.text ?? null,
    sunriseIso: parseAstroClock(dayDate, block.astro?.sunrise),
    sunsetIso: parseAstroClock(dayDate, block.astro?.sunset),
    waterTempC: null,
    waterUnavailableReason: 'WeatherAPI has no marine SST in this path',
    sampleTimeIso: best.time
      ? new Date(best.time_epoch ? best.time_epoch * 1000 : best.time).toISOString()
      : null,
    confidence: 0.8,
  };
}
