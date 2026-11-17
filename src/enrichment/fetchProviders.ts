/**
 * Dispatch weather/solar/water fetches for the selected source set.
 */

import { fetchMetNoSnapshot } from './metNo';
import { fetchNwsSnapshot } from './nws';
import { fetchOpenMeteoProviderSnapshot } from './openMeteo';
import { fetchOpenWeatherSnapshot } from './openWeather';
import type { SourceId } from './sources/types';
import type {
  ProviderAttemptFailure,
  WeatherProviderSnapshot,
} from './types';
import { fetchWeatherApiSnapshot } from './weatherApi';

type ProviderFetcher = (
  latitude: number,
  longitude: number,
  capturedAt: Date,
  options?: { signal?: AbortSignal },
) => Promise<WeatherProviderSnapshot>;

const FETCHERS: Partial<Record<SourceId, ProviderFetcher>> = {
  'open-meteo': fetchOpenMeteoProviderSnapshot,
  'met-no': fetchMetNoSnapshot,
  openweather: fetchOpenWeatherSnapshot,
  weatherapi: fetchWeatherApiSnapshot,
  nws: fetchNwsSnapshot,
};

export async function fetchSelectedProviders(
  sourceIds: readonly SourceId[],
  latitude: number,
  longitude: number,
  capturedAt: Date,
  signal?: AbortSignal,
): Promise<{
  succeeded: WeatherProviderSnapshot[];
  failed: ProviderAttemptFailure[];
}> {
  const unique = [...new Set(sourceIds)];
  const attempts = await Promise.all(
    unique.map(async (id) => {
      const fetch = FETCHERS[id];
      if (!fetch) {
        return {
          ok: false as const,
          providerId: id,
          error: `No fetch adapter registered for ${id}`,
        };
      }
      try {
        const snapshot = await fetch(latitude, longitude, capturedAt, {
          signal,
        });
        return { ok: true as const, snapshot };
      } catch (err) {
        return {
          ok: false as const,
          providerId: id,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const succeeded: WeatherProviderSnapshot[] = [];
  const failed: ProviderAttemptFailure[] = [];
  for (const attempt of attempts) {
    if (attempt.ok) succeeded.push(attempt.snapshot);
    else failed.push({ providerId: attempt.providerId, error: attempt.error });
  }
  return { succeeded, failed };
}
