/**
 * Weather-specific adapter over the shared multi-source merge pipeline.
 * Numeric values are averaged; per-source samples feed std-dev / charts.
 */

import {
  mergeNumericSamples,
  serializeMergedNumeric,
  type SourceSample,
} from './merge/pipeline';
import {
  FIELD_TO_SIGNAL_KEY,
  NUMERIC_SNAPSHOT_FIELDS,
  type AveragedNumericField,
  type MergedWeatherSnapshot,
  type NumericSnapshotField,
  type WeatherProviderId,
  type WeatherProviderSnapshot,
  type ProviderAttemptFailure,
} from './types';

function averageField(
  field: NumericSnapshotField,
  snapshots: WeatherProviderSnapshot[],
): AveragedNumericField {
  const samples: SourceSample[] = [];
  for (const snap of snapshots) {
    const raw = snap[field];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      samples.push({
        sourceId: snap.providerId,
        value: raw,
        confidence: snap.confidence,
        endpointLabel: snap.endpointLabel,
        sampledAt: snap.sampleTimeIso,
      });
    }
  }
  return mergeNumericSamples(samples, {
    circular: field === 'windDirectionDeg',
  });
}

function pickFirstNonNull<T>(
  snapshots: WeatherProviderSnapshot[],
  read: (s: WeatherProviderSnapshot) => T | null | undefined,
): { value: T | null; providerId: WeatherProviderId | null } {
  for (const snap of snapshots) {
    const value = read(snap);
    if (value != null && value !== '') {
      return { value, providerId: snap.providerId };
    }
  }
  return { value: null, providerId: null };
}

/**
 * Merge successful provider snapshots. Failed attempts are recorded but do
 * not block fields that other providers returned.
 */
export function mergeProviderSnapshots(
  succeeded: WeatherProviderSnapshot[],
  failed: ProviderAttemptFailure[] = [],
  selectionNotes: string[] = [],
): MergedWeatherSnapshot {
  const fields = {} as Record<NumericSnapshotField, AveragedNumericField>;
  for (const field of NUMERIC_SNAPSHOT_FIELDS) {
    fields[field] = averageField(field, succeeded);
  }

  const conditions = pickFirstNonNull(succeeded, (s) => s.conditions);
  const sunrise = pickFirstNonNull(succeeded, (s) => s.sunriseIso);
  const sunset = pickFirstNonNull(succeeded, (s) => s.sunsetIso);

  let waterUnavailableReason: string | null = null;
  if (fields.waterTempC.value == null) {
    waterUnavailableReason =
      succeeded
        .map((s) => s.waterUnavailableReason)
        .find((r) => r != null && r.length > 0) ??
      (succeeded.length
        ? 'Sea-surface temperature unavailable from all providers'
        : null);
  }

  return {
    fields,
    conditions: conditions.value,
    conditionsProviderId: conditions.providerId,
    sunriseIso: sunrise.value,
    sunsetIso: sunset.value,
    solarProviderId: sunrise.providerId ?? sunset.providerId,
    waterUnavailableReason,
    succeeded,
    failed,
    selectionNotes,
  };
}

/** Compact JSON for enrichment.sources — avg, std-dev, chart-ready samples. */
export function buildSourcesMetadata(merged: MergedWeatherSnapshot): string {
  const numeric: Record<string, ReturnType<typeof serializeMergedNumeric>> = {};

  for (const field of NUMERIC_SNAPSHOT_FIELDS) {
    const averaged = merged.fields[field];
    const key = FIELD_TO_SIGNAL_KEY[field];
    const serialized = serializeMergedNumeric(averaged);
    if (serialized.value != null) {
      const digits =
        field === 'windDirectionDeg' ||
        field === 'humidityPct' ||
        field === 'cloudCoverPct' ||
        field === 'visibilityM'
          ? 0
          : field === 'precipitationMm'
            ? 2
            : 1;
      serialized.value = Number(serialized.value.toFixed(digits));
      if (serialized.stdDev != null) {
        serialized.stdDev = Number(serialized.stdDev.toFixed(digits + 1));
      }
    }
    numeric[key] = serialized;
  }

  return JSON.stringify({
    selection: merged.selectionNotes,
    providers: {
      ok: merged.succeeded.map((s) => ({
        id: s.providerId,
        endpoint: s.endpointLabel,
        sampleTime: s.sampleTimeIso,
      })),
      failed: merged.failed.map((f) => ({
        id: f.providerId,
        error: f.error,
      })),
    },
    fields: numeric,
    text: {
      conditions: merged.conditions
        ? {
            value: merged.conditions,
            providerId: merged.conditionsProviderId,
          }
        : null,
      sunrise: merged.sunriseIso
        ? { value: merged.sunriseIso, providerId: merged.solarProviderId }
        : null,
      sunset: merged.sunsetIso
        ? { value: merged.sunsetIso, providerId: merged.solarProviderId }
        : null,
    },
  });
}

export function providerSummaryLabel(merged: MergedWeatherSnapshot): string {
  if (!merged.succeeded.length) {
    return merged.failed.map((f) => f.providerId).join('+') || 'none';
  }
  return merged.succeeded.map((s) => s.endpointLabel).join('+');
}

/** Re-export wind helper for tests / callers that imported the old name. */
export { circularMeanDegrees as averageWindDirectionDeg } from './merge/stats';
