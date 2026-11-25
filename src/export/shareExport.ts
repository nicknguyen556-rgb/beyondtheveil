import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { buildExportPayload, exportPayloadToCsv } from './buildExport';
import type { BuildExportOptions } from './types';

export type ExportFormat = 'json' | 'csv';

export interface ShareExportResult {
  ok: boolean;
  path?: string;
  error?: string;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureExportDir(): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('Document directory unavailable');
  }
  const dir = `${root}exports/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

/**
 * Write a local export file and open the system share sheet.
 * Photos are not bundled — payload flags `hasLocalPhoto` only.
 */
export async function shareObservationsExport(
  db: SQLiteDatabase,
  format: ExportFormat,
  options: BuildExportOptions = {},
): Promise<ShareExportResult> {
  try {
    const payload = await buildExportPayload(db, options);
    const dir = await ensureExportDir();
    const base = `geocatch-export-${stamp()}`;
    const path =
      format === 'csv' ? `${dir}${base}.csv` : `${dir}${base}.json`;
    const body =
      format === 'csv'
        ? exportPayloadToCsv(payload)
        : `${JSON.stringify(payload, null, 2)}\n`;

    await FileSystem.writeAsStringAsync(path, body, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return {
        ok: true,
        path,
        error: 'Share sheet unavailable — file saved under app documents/exports.',
      };
    }

    await Sharing.shareAsync(path, {
      mimeType: format === 'csv' ? 'text/csv' : 'application/json',
      dialogTitle: 'Export Geocatch data',
      UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
    });

    return { ok: true, path };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Export failed',
    };
  }
}
