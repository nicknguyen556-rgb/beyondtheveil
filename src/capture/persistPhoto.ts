import type { ImagePickerAsset } from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createObservation } from '@/db/observations';
import type { Observation, PlaceSource, TimeSource } from '@/types/models';

import { resolvePlaceTime } from './placeTime';

export type IngestResult = {
  observation: Observation;
  placeSource: PlaceSource | null;
  timeSource: TimeSource;
};

function extensionForAsset(asset: ImagePickerAsset): string {
  if (asset.mimeType?.includes('png')) return 'png';
  if (asset.uri.toLowerCase().includes('.png')) return 'png';
  return 'jpg';
}

async function ensurePhotosDir(): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('Document directory is unavailable on this platform');
  }
  const dir = `${root}observations/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

/** Copy picker URI into durable app storage and return the local file URI. */
export async function persistPhotoFile(
  asset: ImagePickerAsset,
  observationId: string,
): Promise<string> {
  const dir = await ensurePhotosDir();
  const dest = `${dir}${observationId}.${extensionForAsset(asset)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  return dest;
}

/**
 * Ingest a camera/gallery asset: resolve EXIF place/time (with fallbacks),
 * create the observation row, then copy the photo beside a stable id.
 */
export async function ingestPhotoAsset(
  db: SQLiteDatabase,
  asset: ImagePickerAsset,
): Promise<IngestResult> {
  const resolved = await resolvePlaceTime({
    exif: (asset.exif as Record<string, unknown> | null | undefined) ?? null,
    allowDeviceGps: true,
  });

  const draft = await createObservation(db, {
    photoUri: asset.uri,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    capturedAt: resolved.capturedAt,
    placeLabel: resolved.placeSource ? 'Captured spot' : 'Place pending',
    placeSource: resolved.placeSource,
    timeSource: resolved.timeSource,
  });

  let photoUri = asset.uri;
  try {
    photoUri = await persistPhotoFile(asset, draft.id);
    await db.runAsync(
      `UPDATE observations SET photo_uri = ?, updated_at = ? WHERE id = ?`,
      [photoUri, new Date().toISOString(), draft.id],
    );
  } catch {
    // Keep the picker URI if durable copy fails (still usable in-session).
  }

  return {
    observation: { ...draft, photoUri },
    placeSource: resolved.placeSource,
    timeSource: resolved.timeSource,
  };
}
