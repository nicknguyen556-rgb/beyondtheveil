import * as ImagePicker from 'expo-image-picker';

export type PhotoPickSource = 'camera' | 'gallery';

export class PhotoPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoPermissionError';
  }
}

async function ensureCameraPermission(): Promise<void> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return;
  const asked = await ImagePicker.requestCameraPermissionsAsync();
  if (!asked.granted) {
    throw new PhotoPermissionError('Camera permission is required to capture a photo.');
  }
}

async function ensureLibraryPermission(): Promise<void> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return;
  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!asked.granted) {
    throw new PhotoPermissionError('Photo library permission is required to import a photo.');
  }
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.9,
  exif: true,
  allowsEditing: false,
};

/** Launch camera or gallery and return a single asset (or null if cancelled). */
export async function pickPhoto(
  source: PhotoPickSource,
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (source === 'camera') {
    await ensureCameraPermission();
    const result = await ImagePicker.launchCameraAsync(pickerOptions);
    if (result.canceled || !result.assets[0]) return null;
    return result.assets[0];
  }

  await ensureLibraryPermission();
  const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
}
