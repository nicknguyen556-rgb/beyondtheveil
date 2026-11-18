import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getObservation,
  replaceSignalsForKeys,
} from '@/db/observations';
import type { NewSignalInput, Observation } from '@/types/models';

import { catalogUnit, ENRICHMENT_SIGNAL_KEYS } from './catalog';
import { fetchOpenMeteoSnapshot, type OpenMeteoSnapshot } from './openMeteo';
import { deriveSolarContext } from './solar';

export type EnrichmentStatus = 'ok' | 'partial' | 'failed' | 'skipped';

export interface EnrichmentResult {
  status: EnrichmentStatus;
  message: string;
  signalCount: number;
}

function hasPlaceAndTime(observation: Observation): boolean {
  return (
    observation.latitude != null &&
    observation.longitude != null &&
    Number.isFinite(observation.latitude) &&
    Number.isFinite(observation.longitude) &&
    Boolean(observation.capturedAt) &&
    !Number.isNaN(new Date(observation.capturedAt).getTime())
  );
}

function num(value: number | null | undefined, digits = 1): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits)).toString();
}

function buildSignals(
  observationId: string,
  snapshot: OpenMeteoSnapshot,
  capturedAt: Date,
  status: EnrichmentStatus,
  error: string | null,
): NewSignalInput[] {
  const solar = deriveSolarContext(
    capturedAt,
    snapshot.sunriseIso,
    snapshot.sunsetIso,
  );

  const rows: Array<{
    key: string;
    value: string | null;
    source: NewSignalInput['source'];
    confidence?: number | null;
  }> = [
    {
      key: 'solar.time_of_day',
      value: solar.timeOfDay,
      source: 'derived',
      confidence: 0.9,
    },
    {
      key: 'solar.daylight_remaining_min',
      value: String(solar.daylightRemainingMin),
      source: 'derived',
      confidence: 0.9,
    },
    {
      key: 'solar.sunrise',
      value: snapshot.sunriseIso,
      source: 'api',
      confidence: 0.95,
    },
    {
      key: 'solar.sunset',
      value: snapshot.sunsetIso,
      source: 'api',
      confidence: 0.95,
    },
    {
      key: 'solar.moon_phase',
      value: `${solar.moonPhaseFraction} (${solar.moonPhaseName})`,
      source: 'derived',
      confidence: 0.8,
    },
    {
      key: 'weather.pressure_msl',
      value: num(snapshot.pressureHpa, 1),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.wind_speed',
      value: num(snapshot.windSpeedKmh, 1),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.wind_direction',
      value: num(snapshot.windDirectionDeg, 0),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.humidity',
      value: num(snapshot.humidityPct, 0),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.uv_index',
      value: num(snapshot.uvIndex, 1),
      source: 'api',
      confidence: snapshot.uvIndex == null ? 0.2 : 0.85,
    },
    {
      key: 'weather.precipitation',
      value: num(snapshot.precipitationMm, 2),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.temperature',
      value: num(snapshot.temperatureC, 1),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.feels_like',
      value: num(snapshot.feelsLikeC, 1),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.cloud_cover',
      value: num(snapshot.cloudCoverPct, 0),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.visibility',
      value: num(snapshot.visibilityM, 0),
      source: 'api',
      confidence: snapshot.visibilityM == null ? 0.2 : 0.85,
    },
    {
      key: 'weather.dew_point',
      value: num(snapshot.dewPointC, 1),
      source: 'api',
      confidence: 0.9,
    },
    {
      key: 'weather.wind_gusts',
      value: num(snapshot.windGustsKmh, 1),
      source: 'api',
      confidence: snapshot.windGustsKmh == null ? 0.2 : 0.85,
    },
    {
      key: 'weather.conditions',
      value: snapshot.conditions,
      source: 'api',
      confidence: 0.85,
    },
    {
      key: 'water.temperature',
      value:
        snapshot.waterTempC != null
          ? num(snapshot.waterTempC, 1)
          : 'unavailable',
      source: snapshot.waterTempC != null ? 'api' : 'manual',
      confidence: snapshot.waterTempC != null ? 0.75 : 0,
    },
    {
      key: 'enrichment.provider',
      value: `open-meteo:${snapshot.weatherEndpoint}`,
      source: 'derived',
    },
    {
      key: 'enrichment.fetched_at',
      value: new Date().toISOString(),
      source: 'derived',
    },
    {
      key: 'enrichment.status',
      value: status,
      source: 'derived',
    },
  ];

  if (error) {
    rows.push({
      key: 'enrichment.error',
      value: error,
      source: 'derived',
    });
  }

  if (snapshot.waterTempC == null && snapshot.waterUnavailableReason) {
    // Keep water.temperature as unavailable; surface reason in enrichment.error when otherwise ok.
    if (!error) {
      rows.push({
        key: 'enrichment.error',
        value: `Water temp: ${snapshot.waterUnavailableReason}`,
        source: 'derived',
      });
    }
  }

  return rows.map((row) => ({
    observationId,
    key: row.key,
    source: row.source,
    value: row.value,
    unit: catalogUnit(row.key),
    confidence: row.confidence ?? null,
  }));
}

function buildFailureSignals(
  observationId: string,
  message: string,
): NewSignalInput[] {
  return [
    {
      observationId,
      key: 'enrichment.provider',
      source: 'derived',
      value: 'open-meteo',
      unit: null,
    },
    {
      observationId,
      key: 'enrichment.fetched_at',
      source: 'derived',
      value: new Date().toISOString(),
      unit: null,
    },
    {
      observationId,
      key: 'enrichment.status',
      source: 'derived',
      value: 'failed',
      unit: null,
    },
    {
      observationId,
      key: 'enrichment.error',
      source: 'derived',
      value: message,
      unit: null,
    },
    {
      observationId,
      key: 'water.temperature',
      source: 'manual',
      value: 'unavailable',
      unit: catalogUnit('water.temperature'),
      confidence: 0,
    },
  ];
}

/**
 * Fetch Open-Meteo weather/solar context for an observation with place + time
 * and replace prior enrichment signal rows. API failures are stored gracefully.
 */
export async function enrichObservation(
  db: SQLiteDatabase,
  observationId: string,
  options?: { signal?: AbortSignal },
): Promise<EnrichmentResult> {
  const observation = await getObservation(db, observationId);
  if (!observation) {
    return { status: 'failed', message: 'Observation not found', signalCount: 0 };
  }

  if (!hasPlaceAndTime(observation)) {
    await replaceSignalsForKeys(db, observationId, ENRICHMENT_SIGNAL_KEYS, [
      {
        observationId,
        key: 'enrichment.status',
        source: 'derived',
        value: 'skipped',
        unit: null,
      },
      {
        observationId,
        key: 'enrichment.error',
        source: 'derived',
        value: 'Need latitude, longitude, and captured time before enrichment.',
        unit: null,
      },
    ]);
    return {
      status: 'skipped',
      message: 'Set place and time first, then enrich.',
      signalCount: 2,
    };
  }

  const capturedAt = new Date(observation.capturedAt);

  try {
    const snapshot = await fetchOpenMeteoSnapshot(
      observation.latitude!,
      observation.longitude!,
      capturedAt,
      options,
    );

    const missingRequired: string[] = [];
    if (snapshot.pressureHpa == null) missingRequired.push('pressure');
    if (snapshot.windSpeedKmh == null) missingRequired.push('wind speed');
    if (snapshot.windDirectionDeg == null) missingRequired.push('wind direction');
    if (snapshot.humidityPct == null) missingRequired.push('humidity');
    if (snapshot.precipitationMm == null) missingRequired.push('precipitation');
    if (!snapshot.sunriseIso || !snapshot.sunsetIso) missingRequired.push('sunrise/sunset');

    const partialNotes: string[] = [];
    if (missingRequired.length) {
      partialNotes.push(`Missing: ${missingRequired.join(', ')}`);
    }
    if (snapshot.uvIndex == null) {
      partialNotes.push('UV index unavailable for this sample');
    }
    if (snapshot.waterTempC == null && snapshot.waterUnavailableReason) {
      partialNotes.push(snapshot.waterUnavailableReason);
    }

    const status: EnrichmentStatus = partialNotes.length ? 'partial' : 'ok';
    const error = partialNotes.length ? partialNotes.join('; ') : null;
    const signals = buildSignals(
      observationId,
      snapshot,
      capturedAt,
      status,
      error,
    );

    await replaceSignalsForKeys(
      db,
      observationId,
      ENRICHMENT_SIGNAL_KEYS,
      signals,
    );

    return {
      status,
      message:
        status === 'ok'
          ? 'Weather and solar context saved.'
          : `Saved with gaps: ${error}`,
      signalCount: signals.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Enrichment request failed';
    const signals = buildFailureSignals(observationId, message);
    try {
      await replaceSignalsForKeys(
        db,
        observationId,
        ENRICHMENT_SIGNAL_KEYS,
        signals,
      );
    } catch {
      // Still report the API failure even if persistence of the error row fails.
    }
    return {
      status: 'failed',
      message,
      signalCount: signals.length,
    };
  }
}
