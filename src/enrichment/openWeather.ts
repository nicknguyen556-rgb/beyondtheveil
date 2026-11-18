/**
 * OpenWeatherMap 2.5 forecast — env-keyed (EXPO_PUBLIC_OPENWEATHER_API_KEY).
 * Overlaps core weather numerics for near-term observations.
 */

import { readEnvKey, getSource } from './sources/registry';
import type { WeatherProviderSnapshot } from './types';

const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const MAX_SAMPLE_DELTA_MS = 3 * 60 * 60_000;

interface OwMain {
  temp?: number;
  feels_like?: number;
  pressure?: number;
  humidity?: number;
  temp_kf?: number;
}

interface OwWind {
  speed?: number;
  deg?: number;
  gust?: number;
}

interface OwItem {
  dt: number;
  main?: OwMain;
  weather?: Array<{ description?: string }>;
  clouds?: { all?: number };
  wind?: OwWind;
  visibility?: number;
  pop?: number;
  rain?: { '3h'?: number };
  snow?: { '3h'?: number };
}

interface OwResponse {
  list?: OwItem[];
  message?: string | number;
  cod?: string | number;
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** m/s → km/h */
function mpsToKmh(mps: number | null): number | null {
  return mps == null ? null : mps * 3.6;
}

export async function fetchOpenWeatherSnapshot(
  latitude: number,
  longitude: number,
  capturedAt: Date,
  options?: { signal?: AbortSignal },
): Promise<WeatherProviderSnapshot> {
  const source = getSource('openweather');
  const apiKey = source ? readEnvKey(source) : null;
  if (!apiKey) {
    throw new Error('OpenWeather skipped: EXPO_PUBLIC_OPENWEATHER_API_KEY not set');
  }

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    appid: apiKey,
    units: 'metric',
  });
  const response = await fetch(`${FORECAST_URL}?${params.toString()}`, {
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new Error(`OpenWeather HTTP ${response.status}`);
  }
  const data = (await response.json()) as OwResponse;
  const list = data.list;
  if (!list?.length) {
    throw new Error(
      typeof data.message === 'string'
        ? data.message
        : 'OpenWeather returned no forecast rows',
    );
  }

  let best = list[0]!;
  let bestDelta = Math.abs(best.dt * 1000 - capturedAt.getTime());
  for (let i = 1; i < list.length; i += 1) {
    const item = list[i]!;
    const delta = Math.abs(item.dt * 1000 - capturedAt.getTime());
    if (delta < bestDelta) {
      best = item;
      bestDelta = delta;
    }
  }

  if (bestDelta > MAX_SAMPLE_DELTA_MS) {
    throw new Error(
      'OpenWeather has no forecast step near this observation time',
    );
  }

  const rain = finiteOrNull(best.rain?.['3h']);
  const snow = finiteOrNull(best.snow?.['3h']);
  const precip =
    rain != null || snow != null ? (rain ?? 0) + (snow ?? 0) : null;

  return {
    providerId: 'openweather',
    endpointLabel: 'openweather:forecast25',
    temperatureC: finiteOrNull(best.main?.temp),
    feelsLikeC: finiteOrNull(best.main?.feels_like),
    humidityPct: finiteOrNull(best.main?.humidity),
    dewPointC: null,
    precipitationMm: precip,
    pressureHpa: finiteOrNull(best.main?.pressure),
    cloudCoverPct: finiteOrNull(best.clouds?.all),
    visibilityM: finiteOrNull(best.visibility),
    windSpeedKmh: mpsToKmh(finiteOrNull(best.wind?.speed)),
    windDirectionDeg: finiteOrNull(best.wind?.deg),
    windGustsKmh: mpsToKmh(finiteOrNull(best.wind?.gust)),
    uvIndex: null,
    conditions: best.weather?.[0]?.description
      ? best.weather[0].description.replace(/\b\w/g, (c) => c.toUpperCase())
      : null,
    sunriseIso: null,
    sunsetIso: null,
    waterTempC: null,
    waterUnavailableReason: 'OpenWeather forecast has no marine SST',
    sampleTimeIso: new Date(best.dt * 1000).toISOString(),
    confidence: 0.82,
  };
}
