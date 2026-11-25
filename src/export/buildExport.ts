import type { SQLiteDatabase } from 'expo-sqlite';

import { listObservations, listSignalsForObservation } from '@/db/observations';

import type {
  BuildExportOptions,
  ExportObservation,
  GeocatchExportPayload,
} from './types';

function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    return [];
  }
}

/** Build a JSON-serializable dump of every local observation + its signals. */
export async function buildExportPayload(
  db: SQLiteDatabase,
  options: BuildExportOptions = {},
): Promise<GeocatchExportPayload> {
  const stripCoordinates = options.stripCoordinates === true;
  const rows = await listObservations(db);
  const observations: ExportObservation[] = [];

  for (const row of rows) {
    const signals = await listSignalsForObservation(db, row.id);
    observations.push({
      id: row.id,
      latitude: stripCoordinates ? null : row.latitude,
      longitude: stripCoordinates ? null : row.longitude,
      capturedAt: row.capturedAt,
      placeLabel: row.placeLabel,
      placeSource: row.placeSource,
      timeSource: row.timeSource,
      tags: parseTags(row.tagsJson),
      outcomeRating: row.outcomeRating,
      outcomeNotes: row.outcomeNotes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      hasLocalPhoto: Boolean(row.photoUri),
      signals: signals.map((s) => ({
        id: s.id,
        key: s.key,
        source: s.source,
        value: s.value,
        unit: s.unit,
        confidence: s.confidence,
        createdAt: s.createdAt,
      })),
    });
  }

  return {
    format: 'geocatch-datalink-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    stripCoordinates,
    observationCount: observations.length,
    observations,
  };
}

/** Flat CSV (one row per signal; observations without signals get a blank signal row). */
export function exportPayloadToCsv(payload: GeocatchExportPayload): string {
  const header = [
    'observation_id',
    'captured_at',
    'place_label',
    'latitude',
    'longitude',
    'tags',
    'outcome_rating',
    'outcome_notes',
    'signal_key',
    'signal_source',
    'signal_value',
    'signal_unit',
  ].join(',');

  const escape = (value: string | number | null | undefined): string => {
    if (value == null) return '';
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines: string[] = [header];
  for (const obs of payload.observations) {
    const tags = obs.tags.join(';');
    if (obs.signals.length === 0) {
      lines.push(
        [
          escape(obs.id),
          escape(obs.capturedAt),
          escape(obs.placeLabel),
          escape(obs.latitude),
          escape(obs.longitude),
          escape(tags),
          escape(obs.outcomeRating),
          escape(obs.outcomeNotes),
          '',
          '',
          '',
          '',
        ].join(','),
      );
      continue;
    }
    for (const signal of obs.signals) {
      lines.push(
        [
          escape(obs.id),
          escape(obs.capturedAt),
          escape(obs.placeLabel),
          escape(obs.latitude),
          escape(obs.longitude),
          escape(tags),
          escape(obs.outcomeRating),
          escape(obs.outcomeNotes),
          escape(signal.key),
          escape(signal.source),
          escape(signal.value),
          escape(signal.unit),
        ].join(','),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
