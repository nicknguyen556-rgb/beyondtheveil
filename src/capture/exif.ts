/**
 * EXIF place/time helpers for ImagePicker assets.
 * Platforms differ slightly in key names and GPS encodings — parse defensively.
 */

export type ExifGps = {
  latitude: number;
  longitude: number;
};

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Convert EXIF rational / DMS array to decimal degrees. */
function dmsToDecimal(raw: unknown, ref?: unknown): number | null {
  if (Array.isArray(raw) && raw.length >= 3) {
    const d = asNumber(raw[0]);
    const m = asNumber(raw[1]);
    const s = asNumber(raw[2]);
    if (d == null || m == null || s == null) return null;
    let decimal = Math.abs(d) + m / 60 + s / 3600;
    const refStr = typeof ref === 'string' ? ref.toUpperCase() : '';
    if (refStr === 'S' || refStr === 'W' || d < 0) decimal = -decimal;
    return decimal;
  }

  const direct = asNumber(raw);
  if (direct == null) return null;
  const refStr = typeof ref === 'string' ? ref.toUpperCase() : '';
  if (refStr === 'S' || refStr === 'W') return -Math.abs(direct);
  return direct;
}

function pick(exif: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in exif && exif[key] != null) return exif[key];
  }
  return undefined;
}

export function parseExifGps(exif: Record<string, unknown> | null | undefined): ExifGps | null {
  if (!exif) return null;

  const lat = dmsToDecimal(
    pick(exif, ['GPSLatitude', 'gpsLatitude', '{GPS}', 'Latitude']),
    pick(exif, ['GPSLatitudeRef', 'gpsLatitudeRef']),
  );
  const lon = dmsToDecimal(
    pick(exif, ['GPSLongitude', 'gpsLongitude', 'Longitude']),
    pick(exif, ['GPSLongitudeRef', 'gpsLongitudeRef']),
  );

  // Some iOS payloads nest under GPS
  const nested = exif.GPS ?? exif.gps;
  if ((lat == null || lon == null) && nested && typeof nested === 'object') {
    const gps = nested as Record<string, unknown>;
    const nestedLat = dmsToDecimal(
      pick(gps, ['Latitude', 'GPSLatitude', 'latitude']),
      pick(gps, ['LatitudeRef', 'GPSLatitudeRef', 'latitudeRef']),
    );
    const nestedLon = dmsToDecimal(
      pick(gps, ['Longitude', 'GPSLongitude', 'longitude']),
      pick(gps, ['LongitudeRef', 'GPSLongitudeRef', 'longitudeRef']),
    );
    if (nestedLat != null && nestedLon != null) {
      if (Math.abs(nestedLat) <= 90 && Math.abs(nestedLon) <= 180) {
        return { latitude: nestedLat, longitude: nestedLon };
      }
    }
  }

  if (lat == null || lon == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon };
}

/**
 * Parse EXIF datetime into ISO-8601 UTC-ish string.
 * EXIF is usually "YYYY:MM:DD HH:mm:ss" without timezone — treat as local.
 */
export function parseExifDateTime(
  exif: Record<string, unknown> | null | undefined,
): string | null {
  if (!exif) return null;

  const raw = pick(exif, [
    'DateTimeOriginal',
    'DateTimeDigitized',
    'DateTime',
    'CreateDate',
    'datetime',
  ]);

  if (typeof raw !== 'string' || !raw.trim()) return null;

  // "2024:03:15 14:22:01" or "2024-03-15T14:22:01"
  const normalized = raw
    .trim()
    .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    .replace(' ', 'T');

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
