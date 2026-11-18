/**
 * Resolve a user-requested signal through the shared multi-source pipeline.
 * When no source succeeds, store free-text-ready `unavailable` (manual).
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { addSignal, replaceSignalsForKeys } from '@/db/observations';
import type { NewSignalInput, Signal } from '@/types/models';

import { catalogUnit } from './catalog';
import { fetchSelectedProviders } from './fetchProviders';
import {
  freeTextFallbackValue,
  mergeNumericSamples,
  serializeMergedNumeric,
  type SourceSample,
} from './merge/pipeline';
import {
  buildSourcesMetadata,
  mergeProviderSnapshots,
} from './mergeSnapshots';
import { datasetForSignalKey } from './sources/registry';
import { getDatasetPrefs } from './sources/prefs';
import { selectSources } from './sources/selection';
import { recordSourceUsage, listUsageForDataset } from './sources/usage';
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
}

const SIGNAL_TO_FIELD: Partial<Record<string, NumericSnapshotField>> = Object
  .fromEntries(
    NUMERIC_SNAPSHOT_FIELDS.map((field) => [FIELD_TO_SIGNAL_KEY[field], field]),
  ) as Partial<Record<string, NumericSnapshotField>>;

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

/**
 * Fetch + merge a single user-requested signal key for an observation.
 * Applies the dataset's source selection mode (top3 / suggestions / custom).
 */
export async function resolveUserSignal(
  db: SQLiteDatabase,
  observationId: string,
  signalKey: string,
  context: {
    latitude: number;
    longitude: number;
    capturedAt: Date;
    signal?: AbortSignal;
  },
): Promise<ResolveUserSignalResult> {
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

  const { succeeded, failed } = await fetchSelectedProviders(
    selection.sources.map((s) => s.id),
    context.latitude,
    context.longitude,
    context.capturedAt,
    context.signal,
  );

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
      message = `No sources returned ${signalKey}; free-text fallback ready. ${failed.map((f) => f.error).join('; ')}`;
    }

    // Attach chart-ready provenance on a sibling meta key for this request.
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
    const text = textFromSnapshots(signalKey, succeeded);
    if (text != null) {
      value = text;
      confidence = 0.85;
      source = 'api';
      status = 'ok';
      message = `Resolved ${signalKey} from text-capable sources`;
    } else {
      const fallback = freeTextFallbackValue('unavailable');
      value = fallback.value;
      confidence = fallback.confidence;
      source = fallback.source;
      message = `No sources returned ${signalKey}; free-text fallback ready.`;
    }
  }

  // Replace any prior row for this user-requested key.
  await replaceSignalsForKeys(db, observationId, [signalKey], []);
  const signal = await addSignal(db, {
    observationId,
    key: signalKey,
    source,
    value,
    unit: catalogUnit(signalKey),
    confidence,
  });

  // Keep std-dev as an optional companion signal for charts when we have spread.
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

  return { signal, status, message, stdDev, samples };
}

/** Build free-text placeholder without calling providers (GD-6 entry point). */
export async function setFreeTextSignal(
  db: SQLiteDatabase,
  observationId: string,
  signalKey: string,
  text: string,
  unit?: string | null,
): Promise<Signal> {
  await replaceSignalsForKeys(db, observationId, [signalKey], []);
  return addSignal(db, {
    observationId,
    key: signalKey,
    source: 'manual',
    value: text,
    unit: unit ?? catalogUnit(signalKey),
    confidence: 0.5,
  });
}
