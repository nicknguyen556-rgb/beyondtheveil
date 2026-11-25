import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getObservation,
  replaceSignalsForKeys,
} from '@/db/observations';
import type { NewSignalInput, Observation } from '@/types/models';

import { catalogUnit, ENRICHMENT_SIGNAL_KEYS } from './catalog';
import { fetchSelectedProviders } from './fetchProviders';
import {
  buildSourcesMetadata,
  mergeProviderSnapshots,
  providerSummaryLabel,
} from './mergeSnapshots';
import { getDatasetPrefs } from './sources/prefs';
import { selectSources } from './sources/selection';
import type { SourceId, SourceSelectionMode } from './sources/types';
import { listUsageForDataset, recordSourceUsage } from './sources/usage';
import { deriveSolarContext } from './solar';
import type {
  AveragedNumericField,
  MergedWeatherSnapshot,
  NumericSnapshotField,
} from './types';
import { FIELD_TO_SIGNAL_KEY, NUMERIC_SNAPSHOT_FIELDS } from './types';

export type EnrichmentStatus = 'ok' | 'partial' | 'failed' | 'skipped';

export interface EnrichmentResult {
  status: EnrichmentStatus;
  message: string;
  signalCount: number;
}

export interface EnrichObservationOptions {
  signal?: AbortSignal;
  /** Override per-dataset selection mode for this run. */
  modeOverrides?: Partial<Record<'weather' | 'solar' | 'water', SourceSelectionMode>>;
  /** Override custom source ids when mode is custom. */
  customSourceIds?: Partial<Record<'weather' | 'solar' | 'water', SourceId[]>>;
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

function fieldValue(
  fields: MergedWeatherSnapshot['fields'],
  key: NumericSnapshotField,
  digits = 1,
): string | null {
  return num(fields[key].value, digits);
}

function fieldConfidence(
  fields: MergedWeatherSnapshot['fields'],
  key: NumericSnapshotField,
  emptyFallback = 0.2,
): number {
  const averaged: AveragedNumericField = fields[key];
  if (averaged.method === 'none') return emptyFallback;
  return averaged.confidence;
}

async function resolveSourceIds(
  db: SQLiteDatabase,
  options?: EnrichObservationOptions,
): Promise<{ sourceIds: SourceId[]; notes: string[] }> {
  const notes: string[] = [];
  const selected = new Set<SourceId>();

  for (const datasetId of ['weather', 'solar', 'water'] as const) {
    const prefs = await getDatasetPrefs(db, datasetId);
    const usage = await listUsageForDataset(db, datasetId);
    const mode = options?.modeOverrides?.[datasetId] ?? prefs.mode;
    const customSourceIds =
      options?.customSourceIds?.[datasetId] ?? prefs.customSourceIds;
    const selection = selectSources({
      datasetId,
      mode,
      customSourceIds,
      usage,
    });
    notes.push(
      `${datasetId}/${mode}: ${selection.sources.map((s) => s.id).join(',') || 'none'}`,
    );
    notes.push(...selection.notes.map((n) => `${datasetId}: ${n}`));
    for (const source of selection.sources) selected.add(source.id);
  }

  return { sourceIds: [...selected], notes };
}

function buildStdDevSignals(
  observationId: string,
  merged: MergedWeatherSnapshot,
): NewSignalInput[] {
  const rows: NewSignalInput[] = [];
  for (const field of NUMERIC_SNAPSHOT_FIELDS) {
    const averaged = merged.fields[field];
    const signalKey = FIELD_TO_SIGNAL_KEY[field];
    const stdKey = `${signalKey}.std_dev`;
    if (averaged.stdDev != null && averaged.value != null) {
      rows.push({
        observationId,
        key: stdKey,
        source: 'derived',
        value: Number(averaged.stdDev.toFixed(3)).toString(),
        unit: catalogUnit(signalKey),
        confidence: averaged.confidence,
      });
    }
  }
  return rows;
}

function buildSignals(
  observationId: string,
  merged: MergedWeatherSnapshot,
  capturedAt: Date,
  status: EnrichmentStatus,
  error: string | null,
): NewSignalInput[] {
  const solar = deriveSolarContext(
    capturedAt,
    merged.sunriseIso,
    merged.sunsetIso,
  );
  const { fields } = merged;

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
      confidence: merged.sunriseIso && merged.sunsetIso ? 0.9 : 0.4,
    },
    {
      key: 'solar.daylight_remaining_min',
      value: String(solar.daylightRemainingMin),
      source: 'derived',
      confidence: merged.sunriseIso && merged.sunsetIso ? 0.9 : 0.4,
    },
    {
      key: 'solar.sunrise',
      value: merged.sunriseIso,
      source: 'api',
      confidence: merged.sunriseIso ? 0.95 : 0.2,
    },
    {
      key: 'solar.sunset',
      value: merged.sunsetIso,
      source: 'api',
      confidence: merged.sunsetIso ? 0.95 : 0.2,
    },
    {
      key: 'solar.moon_phase',
      value: `${solar.moonPhaseFraction} (${solar.moonPhaseName})`,
      source: 'derived',
      confidence: 0.8,
    },
    {
      key: 'weather.pressure_msl',
      value: fieldValue(fields, 'pressureHpa', 1),
      source: 'api',
      confidence: fieldConfidence(fields, 'pressureHpa'),
    },
    {
      key: 'weather.wind_speed',
      value: fieldValue(fields, 'windSpeedKmh', 1),
      source: 'api',
      confidence: fieldConfidence(fields, 'windSpeedKmh'),
    },
    {
      key: 'weather.wind_direction',
      value: fieldValue(fields, 'windDirectionDeg', 0),
      source: 'api',
      confidence: fieldConfidence(fields, 'windDirectionDeg'),
    },
    {
      key: 'weather.humidity',
      value: fieldValue(fields, 'humidityPct', 0),
      source: 'api',
      confidence: fieldConfidence(fields, 'humidityPct'),
    },
    {
      key: 'weather.uv_index',
      value: fieldValue(fields, 'uvIndex', 1),
      source: 'api',
      confidence: fieldConfidence(fields, 'uvIndex'),
    },
    {
      key: 'weather.precipitation',
      value: fieldValue(fields, 'precipitationMm', 2),
      source: 'api',
      confidence: fieldConfidence(fields, 'precipitationMm'),
    },
    {
      key: 'weather.temperature',
      value: fieldValue(fields, 'temperatureC', 1),
      source: 'api',
      confidence: fieldConfidence(fields, 'temperatureC'),
    },
    {
      key: 'weather.feels_like',
      value: fieldValue(fields, 'feelsLikeC', 1),
      source: 'api',
      confidence: fieldConfidence(fields, 'feelsLikeC'),
    },
    {
      key: 'weather.cloud_cover',
      value: fieldValue(fields, 'cloudCoverPct', 0),
      source: 'api',
      confidence: fieldConfidence(fields, 'cloudCoverPct'),
    },
    {
      key: 'weather.visibility',
      value: fieldValue(fields, 'visibilityM', 0),
      source: 'api',
      confidence: fieldConfidence(fields, 'visibilityM'),
    },
    {
      key: 'weather.dew_point',
      value: fieldValue(fields, 'dewPointC', 1),
      source: 'api',
      confidence: fieldConfidence(fields, 'dewPointC'),
    },
    {
      key: 'weather.wind_gusts',
      value: fieldValue(fields, 'windGustsKmh', 1),
      source: 'api',
      confidence: fieldConfidence(fields, 'windGustsKmh'),
    },
    {
      key: 'weather.conditions',
      value: merged.conditions,
      source: 'api',
      confidence: merged.conditions ? 0.85 : 0.2,
    },
    {
      key: 'water.temperature',
      value:
        fields.waterTempC.value != null
          ? num(fields.waterTempC.value, 1)
          : 'unavailable',
      source: fields.waterTempC.value != null ? 'api' : 'manual',
      confidence:
        fields.waterTempC.value != null ? fields.waterTempC.confidence : 0,
    },
    {
      key: 'enrichment.provider',
      value: providerSummaryLabel(merged),
      source: 'derived',
    },
    {
      key: 'enrichment.sources',
      value: buildSourcesMetadata(merged),
      source: 'derived',
      confidence: merged.succeeded.length
        ? Math.min(0.98, 0.8 + 0.08 * merged.succeeded.length)
        : 0,
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
  } else if (
    fields.waterTempC.value == null &&
    merged.waterUnavailableReason
  ) {
    rows.push({
      key: 'enrichment.error',
      value: `Water temp: ${merged.waterUnavailableReason}`,
      source: 'derived',
    });
  }

  const base = rows.map((row) => ({
    observationId,
    key: row.key,
    source: row.source,
    value: row.value,
    unit: catalogUnit(row.key),
    confidence: row.confidence ?? null,
  }));

  return [...base, ...buildStdDevSignals(observationId, merged)];
}

function buildFailureSignals(
  observationId: string,
  message: string,
  providerLabel = 'multi-source',
): NewSignalInput[] {
  return [
    {
      observationId,
      key: 'enrichment.provider',
      source: 'derived',
      value: providerLabel,
      unit: null,
    },
    {
      observationId,
      key: 'enrichment.sources',
      source: 'derived',
      value: JSON.stringify({
        providers: { ok: [], failed: [{ error: message }] },
        fields: {},
        text: {},
      }),
      unit: null,
      confidence: 0,
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
 * Multi-source weather/solar/water enrichment for an observation with place + time.
 * Selects sources per dataset mode (top3 / suggestions / custom), averages
 * numeric fields, stores std-dev companions + chart-ready samples metadata.
 */
export async function enrichObservation(
  db: SQLiteDatabase,
  observationId: string,
  options?: EnrichObservationOptions,
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
    const { sourceIds, notes: selectionNotes } = await resolveSourceIds(
      db,
      options,
    );

    if (sourceIds.length === 0) {
      const message = 'No enrichment sources selected or configured';
      const signals = buildFailureSignals(observationId, message, 'none');
      await replaceSignalsForKeys(
        db,
        observationId,
        ENRICHMENT_SIGNAL_KEYS,
        signals,
      );
      return { status: 'failed', message, signalCount: signals.length };
    }

    const { succeeded, failed } = await fetchSelectedProviders(
      sourceIds,
      observation.latitude!,
      observation.longitude!,
      capturedAt,
      options?.signal,
    );

    if (!succeeded.length) {
      const message = failed.length
        ? failed.map((f) => `${f.providerId}: ${f.error}`).join('; ')
        : 'All weather providers failed';
      const signals = buildFailureSignals(
        observationId,
        message,
        failed.map((f) => f.providerId).join('+') || 'none',
      );
      await replaceSignalsForKeys(
        db,
        observationId,
        ENRICHMENT_SIGNAL_KEYS,
        signals,
      );
      return { status: 'failed', message, signalCount: signals.length };
    }

    // Record usage for successful sources across weather (primary dataset).
    await recordSourceUsage(
      db,
      'weather',
      succeeded.map((s) => s.providerId),
    );
    if (succeeded.some((s) => s.sunriseIso || s.sunsetIso)) {
      await recordSourceUsage(
        db,
        'solar',
        succeeded
          .filter((s) => s.sunriseIso || s.sunsetIso)
          .map((s) => s.providerId),
      );
    }
    if (succeeded.some((s) => s.waterTempC != null)) {
      await recordSourceUsage(
        db,
        'water',
        succeeded
          .filter((s) => s.waterTempC != null)
          .map((s) => s.providerId),
      );
    }

    const merged = mergeProviderSnapshots(succeeded, failed, selectionNotes);

    const missingRequired: string[] = [];
    if (merged.fields.pressureHpa.value == null) missingRequired.push('pressure');
    if (merged.fields.windSpeedKmh.value == null) {
      missingRequired.push('wind speed');
    }
    if (merged.fields.windDirectionDeg.value == null) {
      missingRequired.push('wind direction');
    }
    if (merged.fields.humidityPct.value == null) missingRequired.push('humidity');
    if (merged.fields.precipitationMm.value == null) {
      missingRequired.push('precipitation');
    }
    if (!merged.sunriseIso || !merged.sunsetIso) {
      missingRequired.push('sunrise/sunset');
    }

    const partialNotes: string[] = [];
    if (missingRequired.length) {
      partialNotes.push(`Missing: ${missingRequired.join(', ')}`);
    }
    if (merged.fields.uvIndex.value == null) {
      partialNotes.push('UV index unavailable for this sample');
    }
    if (
      merged.fields.waterTempC.value == null &&
      merged.waterUnavailableReason
    ) {
      partialNotes.push(merged.waterUnavailableReason);
    }
    if (failed.length) {
      partialNotes.push(
        `Provider gaps: ${failed.map((f) => `${f.providerId} (${f.error})`).join('; ')}`,
      );
    }

    const status: EnrichmentStatus = partialNotes.length ? 'partial' : 'ok';
    const error = partialNotes.length ? partialNotes.join('; ') : null;
    const signals = buildSignals(
      observationId,
      merged,
      capturedAt,
      status,
      error,
    );

    // Include dynamic std_dev companion keys in the replace set.
    const stdKeys = signals
      .map((s) => s.key)
      .filter((key) => key.endsWith('.std_dev'));
    const replaceKeys = [
      ...ENRICHMENT_SIGNAL_KEYS,
      ...stdKeys,
      ...NUMERIC_SNAPSHOT_FIELDS.map(
        (field) => `${FIELD_TO_SIGNAL_KEY[field]}.std_dev`,
      ),
    ];

    await replaceSignalsForKeys(
      db,
      observationId,
      [...new Set(replaceKeys)],
      signals,
    );

    return {
      status,
      message:
        status === 'ok'
          ? `Weather and solar context saved (${providerSummaryLabel(merged)}).`
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
