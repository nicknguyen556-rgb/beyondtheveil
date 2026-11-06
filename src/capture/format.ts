import type { PlaceSource, TimeSource } from '@/types/models';

export function formatCoords(latitude: number | null, longitude: number | null): string {
  if (latitude == null || longitude == null) return 'Place pending';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function formatSourceLabel(
  kind: 'place' | 'time',
  source: PlaceSource | TimeSource | null,
): string {
  if (!source) return kind === 'place' ? 'No place yet' : 'Time set at save';
  switch (source) {
    case 'exif':
      return kind === 'place' ? 'From photo EXIF' : 'From photo EXIF time';
    case 'device':
      return kind === 'place' ? 'From device GPS' : 'Device clock at capture';
    case 'manual':
      return kind === 'place' ? 'Manual map pin' : 'Manual time';
    default:
      return String(source);
  }
}
