/**
 * US National Weather Service (api.weather.gov) — keyless, US coverage only.
 * Uses gridpoint hourly forecast; historical archive is out of scope here.
 */

import type { WeatherProviderSnapshot } from './types';

const POINTS_URL = 'https://api.weather.gov/points';
const USER_AGENT =
  'GeocatchDatalink/0.1 github.com/nicknguyen556-rgb/beyondtheveil';
const MAX_SAMPLE_DELTA_MS = 90 * 60_000;

interface NwsPointsResponse {
  properties?: {
    forecastHourly?: string;
  };
  status?: number;
  title?: string;
  detail?: string;
}

interface NwsPeriod {
  startTime?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
  relativeHumidity?: { value?: number | null };
  dewpoint?: { value?: number | null; unitCode?: string };
  probabilityOfPrecipitation?: { value?: number | null };
}

interface NwsHourlyResponse {
  properties?: {
    periods?: NwsPeriod[];
  };
}

const COMPASS_TO_DEG: Record<string, number> = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSW: 202.5,
  SW: 225,
  WSW: 247.5,
  W: 270,
  WNW: 292.5,
  NW: 315,
  NNW: 337.5,
};

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

function parseWindMph(text: string | undefined): number | null {
  if (!text) return null;
  const nums = text.match(/(\d+(?:\.\d+)?)/g);
  if (!nums?.length) return null;
  const mph = nums.map(Number).reduce((a, b) => a + b, 0) / nums.length;
  return mph * 1.60934; // → km/h
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/geo+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`NWS HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchNwsSnapshot(
  latitude: number,
  longitude: number,
  capturedAt: Date,
  options?: { signal?: AbortSignal },
): Promise<WeatherProviderSnapshot> {
  const points = await fetchJson<NwsPointsResponse>(
    `${POINTS_URL}/${latitude.toFixed(4)},${longitude.toFixed(4)}`,
    options?.signal,
  );

  const hourlyUrl = points.properties?.forecastHourly;
  if (!hourlyUrl) {
    throw new Error(
      points.detail ??
        points.title ??
        'NWS has no hourly forecast for this location (US coverage only)',
    );
  }

  const hourly = await fetchJson<NwsHourlyResponse>(hourlyUrl, options?.signal);
  const periods = hourly.properties?.periods;
  if (!periods?.length) {
    throw new Error('NWS returned no hourly periods');
  }

  let best = periods[0]!;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const period of periods) {
    if (!period.startTime) continue;
    const delta = Math.abs(
      new Date(period.startTime).getTime() - capturedAt.getTime(),
    );
    if (delta < bestDelta) {
      best = period;
      bestDelta = delta;
    }
  }

  if (!Number.isFinite(bestDelta) || bestDelta > MAX_SAMPLE_DELTA_MS) {
    throw new Error('NWS has no hourly period near this observation time');
  }

  let temperatureC: number | null = finiteOrNull(best.temperature);
  if (temperatureC != null && best.temperatureUnit === 'F') {
    temperatureC = fToC(temperatureC);
  }

  let dewPointC: number | null = finiteOrNull(best.dewpoint?.value ?? null);
  if (
    dewPointC != null &&
    best.dewpoint?.unitCode?.toLowerCase().includes('degf')
  ) {
    dewPointC = fToC(dewPointC);
  }

  const windDir =
    best.windDirection && COMPASS_TO_DEG[best.windDirection] != null
      ? COMPASS_TO_DEG[best.windDirection]!
      : null;

  return {
    providerId: 'nws',
    endpointLabel: 'nws:forecastHourly',
    temperatureC,
    feelsLikeC: null,
    humidityPct: finiteOrNull(best.relativeHumidity?.value ?? null),
    dewPointC,
    precipitationMm: null,
    pressureHpa: null,
    cloudCoverPct: null,
    visibilityM: null,
    windSpeedKmh: parseWindMph(best.windSpeed),
    windDirectionDeg: windDir,
    windGustsKmh: null,
    uvIndex: null,
    conditions: best.shortForecast ?? null,
    sunriseIso: null,
    sunsetIso: null,
    waterTempC: null,
    waterUnavailableReason: 'NWS hourly forecast has no marine SST',
    sampleTimeIso: best.startTime ?? null,
    confidence: 0.75,
  };
}
