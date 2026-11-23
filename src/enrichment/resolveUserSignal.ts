/**
 * Resolve a user-requested signal through the shared multi-source pipeline (GD-6).
 * Catalog / provider keys use the same top3 / suggestions / custom selection (cap 5).
 * When no source succeeds — or the key is unknown — store free-text-ready `unavailable`
 * (manual) so the observation screen can collect a typed value + optional unit.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  addSignal,
  getObservation,
  replaceSignalsForKeys,
} from '@/db/observations';
import type { NewSignalInput, Signal } from '@/types/models';

import {
  catalogUnit,
  isCatalogSignalKey,
  normalizeSignalKey,
  parseChartableNumber,
} from './catalog';
import { fetchSelectedProviders } from './fetchProviders';
import {
  freeTextFallbackValue,
  serializeMergedNumeric,
  type SourceSample,
} from './merge/pipeline';
import { mergeProviderSnapshots } from './mergeSnapshots';
import { datasetForSignalKey } from './sources/registry';
import { getDatasetPrefs } from './sources/prefs';
import { selectSources } from './sources/selection';
import { recordSourceUsage, listUsageForDataset } from './sources/usage';
import { deriveSolarContext } from './solar';
import {
  FIELD_TO_SIGNAL_KEY,
  NUMERIC_SNAPSHOT_FIELDS,
  type NumericSnapshotField,
  type WeatherProviderSnapshot,
} from './types';

export interface ResolveUserSignalResult {
  signal: Signal;
  status: 'ok' | 'unavailable';
  message: string;
  stdDev: number | null;
  samples: SourceSample[];
  /** True when the key was not in the catalog and providers could not fill it. */
  usedFreeTextFallback: boolean;
  chartable: boolean;
}

export interface SetFreeTextSignalOptions {
  /** Optional unit override so free-text values can still chart. */
  unit?: string | null;
  /**
   * When true (default), replace `unavailable` / prior manual rows for this key.
   * Chartability is inferred from a parseable leading number.
   */
  markChartable?: boolean;
}

const SIGNAL_TO_FIELD: Partial<Record<string, NumericSnapshotField>> = Object
  .fromEntries(
    NUMERIC_SNAPSHOT_FIELDS.map((field) => [FIELD_TO_SIGNAL_KEY[field], field]),
  ) as Partial<Record<string, NumericSnapshotField>>;

const DERIVED_SOLAR_KEYS = new Set([
  'solar.moon_phase',
  'solar.time_of_day',
  'solar.daylight_remaining_min',
]);

function textFromSnapshots(
  key: string,
  snapshots: WeatherProviderSnapshot[],
): string | null {
  if (key === 'weather.conditions') {
    return snapshots.map((s) => s.conditions).find((v) => v != null) ?? null;
  }
  if (key === 'solar.sunrise') {
    return snapshots.map((s) => s.sunriseIso).find((v) => v != null) ?? null;
  }
  if (key === 'solar.sunset') {
    return snapshots.map((s) => s.sunsetIso).find((v) => v != null) ?? null;
  }
  return null;
}

function derivedSolarValue(
  key: string,
  capturedAt: Date,
  snapshots: WeatherProviderSnapshot[],
): { value: string; confidence: number } | null {
  if (!DERIVED_SOLAR_KEYS.has(key)) return null;
  const sunrise =
    snapshots.map((s) => s.sunriseIso).find((v) => v != null) ?? null;
  const sunset =
    snapshots.map((s) => s.sunsetIso).find((v) => v != null) ?? null;
  const solar = deriveSolarContext(capturedAt, sunrise, sunset);

  if (key === 'solar.moon_phase') {
    return {
      value: `${solar.moonPhaseFraction} (${solar.moonPhaseName})`,
      confidence: 0.8,
    };
  }
  if (key === 'solar.time_of_day') {
    return {
      value: solar.timeOfDay,
      confidence: sunrise && sunset ? 0.9 : 0.4,
    };
  }
  if (key === 'solar.daylight_remaining_min') {
    return {
      value: String(solar.daylightRemainingMin),
      confidence: sunrise && sunset ? 0.9 : 0.4,
    };
  }
  return null;
}

function freeTextConfidence(text: string): number {
  return parseChartableNumber(text) != null ? 0.6 : 0.5;
}

/**
 * Fetch + merge a single user-requested signal key for an observation.
 * Applies the dataset's source selection mode (top3 / suggestions / custom, cap 5).
 */
export async function resolveUserSignal(
  db: SQLiteDatabase,
  observationId: string,
  rawSignalKey: string,
  context: {
    latitude: number;
    longitude: number;
    capturedAt: Date;
    signal?: AbortSignal;
  },
): Promise<ResolveUserSignalResult> {
  const signalKey = normalizeSignalKey(rawSignalKey);
  if (!signalKey) {
    throw new Error('Signal key is required (e.g. weather.pressure_msl or tide.height).');
  }
  if (signalKey.startsWith('enrichment.')) {
    throw new Error('enrichment.* keys are reserved for system metadata.');
  }

  const datasetId = datasetForSignalKey(signalKey);
  const prefs = await getDatasetPrefs(db, datasetId);
  const usage = await listUsageForDataset(db, datasetId);
  const selection = selectSources({
    datasetId,
    mode: prefs.mode,
    customSourceIds: prefs.customSourceIds,
    usage,
    signalKey,
  });

  const { succeeded, failed } = selection.sources.length
    ? await fetchSelectedProviders(
        selection.sources.map((s) => s.id),
        context.latitude,
        context.longitude,
        context.capturedAt,
        context.signal,
      )
    : { succeeded: [] as WeatherProviderSnapshot[], failed: [] };

  if (succeeded.length) {
    await recordSourceUsage(
      db,
      datasetId,
      succeeded.map((s) => s.providerId),
    );
  }

  const field = SIGNAL_TO_FIELD[signalKey];
  let value: string | null = null;
  let confidence: number | null = 0;
  let source: NewSignalInput['source'] = 'manual';
  let stdDev: number | null = null;
  let samples: SourceSample[] = [];
  let status: ResolveUserSignalResult['status'] = 'unavailable';
  let message: string;
  let usedFreeTextFallback = false;

  if (field) {
    const merged = mergeProviderSnapshots(succeeded, failed, selection.notes);
    const averaged = merged.fields[field];
    samples = averaged.samples;
    stdDev = averaged.stdDev;
    if (averaged.value != null) {
      value = Number(
        averaged.value.toFixed(field === 'precipitationMm' ? 2 : 1),
      ).toString();
      confidence = averaged.confidence;
      source = 'api';
      status = 'ok';
      message = `Resolved ${signalKey} from ${averaged.samples.map((s) => s.sourceId).join('+')}`;
    } else {
      const fallback = freeTextFallbackValue('unavailable');
      value = fallback.value;
      confidence = fallback.confidence;
      source = fallback.source;
      usedFreeTextFallback = true;
      message = `No sources returned ${signalKey}; free-text fallback ready.${
        failed.length ? ` ${failed.map((f) => f.error).join('; ')}` : ''
      }`;
    }

    const metaKey = `enrichment.sources.${signalKey}`;
    await replaceSignalsForKeys(db, observationId, [metaKey], [
      {
        observationId,
        key: metaKey,
        source: 'derived',
        value: JSON.stringify({
          selection: selection.notes,
          field: serializeMergedNumeric(averaged),
          providers: {
            ok: succeeded.map((s) => s.providerId),
            failed,
          },
        }),
        unit: null,
        confidence: averaged.confidence,
      },
    ]);
  } else {
    const derived = derivedSolarValue(
      signalKey,
      context.capturedAt,
      succeeded,
    );
    const text = derived?.value ?? textFromSnapshots(signalKey, succeeded);
    if (text != null) {
      value = text;
      confidence = derived?.confidence ?? 0.85;
      source = derived ? 'derived' : 'api';
      status = 'ok';
      message = derived
        ? `Derived ${signalKey} from solar-capable sources`
        : `Resolved ${signalKey} from text-capable sources`;
    } else {
      const fallback = freeTextFallbackValue('unavailable');
      value = fallback.value;
      confidence = fallback.confidence;
      source = fallback.source;
      usedFreeTextFallback = true;
      const catalogHint = isCatalogSignalKey(signalKey)
        ? 'Catalog key had no provider coverage'
        : 'Custom key has no provider mapping';
      message = `${catalogHint} for ${signalKey}; free-text fallback ready.${
        selection.sources.length === 0
          ? ' No sources selected for this key.'
          : failed.length
            ? ` ${failed.map((f) => f.error).join('; ')}`
            : ''
      }`;
    }
  }

  await replaceSignalsForKeys(db, observationId, [signalKey], []);
  const signal = await addSignal(db, {
    observationId,
    key: signalKey,
    source,
    value,
    unit: catalogUnit(signalKey),
    confidence,
  });

  const stdKey = `${signalKey}.std_dev`;
  if (stdDev != null && status === 'ok') {
    await replaceSignalsForKeys(db, observationId, [stdKey], [
      {
        observationId,
        key: stdKey,
        source: 'derived',
        value: Number(stdDev.toFixed(3)).toString(),
        unit: catalogUnit(signalKey),
        confidence,
      },
    ]);
  } else {
    await replaceSignalsForKeys(db, observationId, [stdKey], []);
  }

  return {
    signal,
    status,
    message,
    stdDev,
    samples,
    usedFreeTextFallback,
    chartable: parseChartableNumber(value) != null,
  };
}

/**
 * Resolve a signal for an observation by loading place/time from SQLite.
 * Throws when latitude/longitude/time are missing.
 */
export async function requestUserSignal(
  db: SQLiteDatabase,
  observationId: string,
  rawSignalKey: string,
  options?: { signal?: AbortSignal },
): Promise<ResolveUserSignalResult> {
  const observation = await getObservation(db, observationId);
  if (!observation) {
    throw new Error(`Observation not found: ${observationId}`);
  }
  if (
    observation.latitude == null ||
    observation.longitude == null ||
    !Number.isFinite(observation.latitude) ||
    !Number.isFinite(observation.longitude)
  ) {
    throw new Error('Add latitude and longitude before requesting signals.');
  }
  const capturedAt = new Date(observation.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) {
    throw new Error('Observation captured time is invalid.');
  }

  return resolveUserSignal(db, observationId, rawSignalKey, {
    latitude: observation.latitude,
    longitude: observation.longitude,
    capturedAt,
    signal: options?.signal,
  });
}

/**
 * Store a free-text (or numeric-as-text) value for any signal key.
 * Optional units keep the row chartable when the value parses as a number.
 */
export async function setFreeTextSignal(
  db: SQLiteDatabase,
  observationId: string,
  rawSignalKey: string,
  text: string,
  options?: SetFreeTextSignalOptions | string | null,
): Promise<Signal> {
  const signalKey = normalizeSignalKey(rawSignalKey);
  if (!signalKey) {
    throw new Error('Signal key is required.');
  }
  if (signalKey.startsWith('enrichment.')) {
    throw new Error('enrichment.* keys are reserved for system metadata.');
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Enter a value (number or note) for free-text fallback.');
  }

  const opts: SetFreeTextSignalOptions =
    typeof options === 'string' || options == null
      ? { unit: options ?? null }
      : options;

  const unit =
    opts.unit !== undefined
      ? opts.unit?.trim() || null
      : catalogUnit(signalKey);
  const chartable = parseChartableNumber(trimmed) != null;
  const confidence =
    opts.markChartable === false
      ? 0.5
      : freeTextConfidence(trimmed);

  await replaceSignalsForKeys(db, observationId, [signalKey], []);
  const signal = await addSignal(db, {
    observationId,
    key: signalKey,
    source: 'manual',
    value: trimmed,
    unit,
    confidence,
  });

  // Drop stale std-dev companions — free-text has no multi-source spread.
  await replaceSignalsForKeys(db, observationId, [`${signalKey}.std_dev`], []);

  // Provenance note for charts / debugging.
  const metaKey = `enrichment.sources.${signalKey}`;
  await replaceSignalsForKeys(db, observationId, [metaKey], [
    {
      observationId,
      key: metaKey,
      source: 'derived',
      value: JSON.stringify({
        selection: ['free-text fallback (GD-6)'],
        freeText: true,
        chartable,
        parsedNumber: parseChartableNumber(trimmed),
        unit,
      }),
      unit: null,
      confidence,
    },
  ]);

  return signal;
}

/** Seed an `unavailable` placeholder so the UI can collect free-text without fetching. */
export async function ensureFreeTextPlaceholder(
  db: SQLiteDatabase,
  observationId: string,
  rawSignalKey: string,
): Promise<Signal> {
  const signalKey = normalizeSignalKey(rawSignalKey);
  if (!signalKey) {
    throw new Error('Signal key is required.');
  }
  const fallback = freeTextFallbackValue('unavailable');
  await replaceSignalsForKeys(db, observationId, [signalKey], []);
  return addSignal(db, {
    observationId,
    key: signalKey,
    source: fallback.source,
    value: fallback.value,
    unit: catalogUnit(signalKey),
    confidence: fallback.confidence,
  });
}
