import * as FileSystem from 'expo-file-system/legacy';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { PHOTO_BUCKET } from './types';

async function ensurePhotosDir(): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('Document directory unavailable');
  }
  const dir = `${root}observations/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

function extensionFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes('.png')) return 'png';
  if (lower.includes('.webp')) return 'webp';
  return 'jpg';
}

function contentTypeForExt(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export function cloudPhotoPath(userId: string, observationId: string, ext = 'jpg'): string {
  return `${userId}/${observationId}.${ext}`;
}

/**
 * Upload a local photo file to Supabase Storage. Returns the storage path,
 * or null when there is no local file / upload is skipped gracefully.
 */
export async function uploadObservationPhoto(
  supabase: SupabaseClient,
  userId: string,
  observationId: string,
  localPhotoUri: string | null,
  existingPath: string | null,
): Promise<string | null> {
  if (!localPhotoUri) return existingPath;

  // Already a remote path marker (no local file).
  if (localPhotoUri.startsWith('supabase://')) {
    return existingPath ?? localPhotoUri.replace('supabase://', '');
  }

  const info = await FileSystem.getInfoAsync(localPhotoUri);
  if (!info.exists) return existingPath;

  const ext = extensionFromUri(localPhotoUri);
  const path = existingPath ?? cloudPhotoPath(userId, observationId, ext);

  const base64 = await FileSystem.readAsStringAsync(localPhotoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 → ArrayBuffer for supabase-js upload.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, {
    contentType: contentTypeForExt(ext),
    upsert: true,
  });

  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }
  return path;
}

/**
 * Download a cloud photo into durable app storage and return the local URI.
 */
export async function downloadObservationPhoto(
  supabase: SupabaseClient,
  observationId: string,
  storagePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Photo download failed: ${error?.message ?? 'empty'}`);
  }

  const ext = extensionFromUri(storagePath);
  const dir = await ensurePhotosDir();
  const dest = `${dir}${observationId}.${ext}`;

  const buffer = await data.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = btoa(binary);

  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

export async function setLocalPhotoStoragePath(
  db: SQLiteDatabase,
  observationId: string,
  photoStoragePath: string | null,
): Promise<void> {
  await db.runAsync(
    `UPDATE observations SET photo_storage_path = ?, updated_at = updated_at WHERE id = ?`,
    [photoStoragePath, observationId],
  );
}
