/**
 * Weather provider snapshot shapes used by the multi-source merge pipeline.
 */

import type { SourceId } from './sources/types';
import type { MergedNumericResult } from './merge/pipeline';

/** Numeric fields that can be averaged across providers. */
export const NUMERIC_SNAPSHOT_FIELDS = [
  'temperatureC',
  'feelsLikeC',
  'humidityPct',
  'dewPointC',
  'precipitationMm',
  'pressureHpa',
  'cloudCoverPct',
  'visibilityM',
  'windSpeedKmh',
  'windDirectionDeg',
  'windGustsKmh',
  'uvIndex',
  'waterTempC',
] as const;

export type NumericSnapshotField = (typeof NUMERIC_SNAPSHOT_FIELDS)[number];

/** Map internal snapshot fields → stored signal keys. */
export const FIELD_TO_SIGNAL_KEY: Record<NumericSnapshotField, string> = {
  temperatureC: 'weather.temperature',
  feelsLikeC: 'weather.feels_like',
  humidityPct: 'weather.humidity',
  dewPointC: 'weather.dew_point',
  precipitationMm: 'weather.precipitation',
  pressureHpa: 'weather.pressure_msl',
  cloudCoverPct: 'weather.cloud_cover',
  visibilityM: 'weather.visibility',
  windSpeedKmh: 'weather.wind_speed',
  windDirectionDeg: 'weather.wind_direction',
  windGustsKmh: 'weather.wind_gusts',
  uvIndex: 'weather.uv_index',
  waterTempC: 'water.temperature',
};

export type WeatherProviderId = SourceId;

export interface WeatherProviderSnapshot {
  providerId: WeatherProviderId;
  /** Short label for enrichment.provider (e.g. open-meteo:forecast). */
  endpointLabel: string;
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
  /** Per-provider baseline confidence for numeric fields it returned. */
  confidence: number;
}

export interface ProviderAttemptFailure {
  providerId: WeatherProviderId;
  error: string;
}

export type AveragedNumericField = MergedNumericResult;

export interface MergedWeatherSnapshot {
  fields: Record<NumericSnapshotField, AveragedNumericField>;
  conditions: string | null;
  conditionsProviderId: WeatherProviderId | null;
  sunriseIso: string | null;
  sunsetIso: string | null;
  solarProviderId: WeatherProviderId | null;
  waterUnavailableReason: string | null;
  succeeded: WeatherProviderSnapshot[];
  failed: ProviderAttemptFailure[];
  selectionNotes: string[];
}
