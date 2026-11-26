/** User-facing permission copy — why Geocatch asks, and what to do if denied. */

export const permissionCopy = {
  cameraDenied:
    'Camera access is off. Open Settings → Geocatch → Camera so you can photograph the spot you’re logging.',
  libraryDenied:
    'Photo library access is off. Open Settings → Geocatch → Photos to import an existing field shot.',
  locationDenied:
    'Location access is off or unavailable. Enable it in Settings to pin place when a photo has no GPS, or drop a map pin manually.',
  locationWhy:
    'Used only to place observations when EXIF GPS is missing, and to center map pins. Never uploaded on the free plan.',
} as const;
