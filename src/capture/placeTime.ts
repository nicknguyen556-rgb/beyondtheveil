import * as Location from 'expo-location';

import type { PlaceSource, TimeSource } from '@/types/models';

import { parseExifDateTime, parseExifGps } from './exif';

export type { PlaceSource, TimeSource };

export type ResolvedPlaceTime = {
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  placeSource: PlaceSource | null;
  timeSource: TimeSource;
};

export type ResolvePlaceTimeOptions = {
  exif?: Record<string, unknown> | null;
  /** When true, request current GPS if EXIF has no coordinates. */
  allowDeviceGps?: boolean;
  /** Optional overrides from a prior manual pin / time edit. */
  manualLatitude?: number | null;
  manualLongitude?: number | null;
  manualCapturedAt?: string | null;
};

export async function getCurrentDeviceGps(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/**
 * Resolve place + time for a newly ingested photo.
 * Priority — place: EXIF → device GPS → manual (caller). Time: EXIF → now → manual.
 */
export async function resolvePlaceTime(
  options: ResolvePlaceTimeOptions = {},
): Promise<ResolvedPlaceTime> {
  const exif = options.exif ?? null;

  let latitude: number | null = null;
  let longitude: number | null = null;
  let placeSource: PlaceSource | null = null;

  if (options.manualLatitude != null && options.manualLongitude != null) {
    latitude = options.manualLatitude;
    longitude = options.manualLongitude;
    placeSource = 'manual';
  } else {
    const gps = parseExifGps(exif);
    if (gps) {
      latitude = gps.latitude;
      longitude = gps.longitude;
      placeSource = 'exif';
    } else if (options.allowDeviceGps !== false) {
      const device = await getCurrentDeviceGps();
      if (device) {
        latitude = device.latitude;
        longitude = device.longitude;
        placeSource = 'device';
      }
    }
  }

  let capturedAt: string;
  let timeSource: TimeSource;

  if (options.manualCapturedAt) {
    capturedAt = options.manualCapturedAt;
    timeSource = 'manual';
  } else {
    const exifTime = parseExifDateTime(exif);
    if (exifTime) {
      capturedAt = exifTime;
      timeSource = 'exif';
    } else {
      capturedAt = new Date().toISOString();
      timeSource = 'device';
    }
  }

  return {
    latitude,
    longitude,
    capturedAt,
    placeSource,
    timeSource,
  };
}
