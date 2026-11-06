import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { getCurrentDeviceGps } from '@/capture/placeTime';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useDatabase } from '@/db/DatabaseProvider';
import { getObservation, updateObservationPlaceTime } from '@/db/observations';
import { colors } from '@/theme/colors';

const DEFAULT_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

/** Manual map-pin fallback when EXIF / device GPS are missing or wrong. */
export default function MapPinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useDatabase();
  const [coordinate, setCoordinate] = useState({
    latitude: DEFAULT_REGION.latitude,
    longitude: DEFAULT_REGION.longitude,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const region = useMemo<Region>(
    () => ({
      ...coordinate,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    }),
    [coordinate],
  );

  const load = useCallback(async () => {
    if (!db || !id) return;
    const row = await getObservation(db, id);
    if (row?.latitude != null && row.longitude != null) {
      setCoordinate({ latitude: row.latitude, longitude: row.longitude });
      setReady(true);
      return;
    }
    const gps = await getCurrentDeviceGps();
    if (gps) {
      setCoordinate(gps);
    }
    setReady(true);
  }, [db, id]);

  useEffect(() => {
    load().catch((err) => {
      setStatus(err instanceof Error ? err.message : 'Could not load map pin');
      setReady(true);
    });
  }, [load]);

  async function savePin() {
    if (!db || !id) return;
    try {
      const existing = await getObservation(db, id);
      const shouldRename =
        !existing?.placeLabel ||
        existing.placeLabel === 'Place pending' ||
        existing.placeLabel === 'Captured spot';

      await updateObservationPlaceTime(db, id, {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        placeSource: 'manual',
        placeLabel: shouldRename ? 'Map pin' : undefined,
      });
      setStatus('Map pin saved.');
      router.back();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save pin');
    }
  }

  async function centerOnDevice() {
    const gps = await getCurrentDeviceGps();
    if (!gps) {
      setStatus('Location permission denied or unavailable.');
      return;
    }
    setCoordinate(gps);
    setStatus('Centered on current GPS — drag the pin to adjust.');
  }

  return (
    <View style={styles.root}>
      {ready ? (
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={(next) => {
            setCoordinate({
              latitude: next.latitude,
              longitude: next.longitude,
            });
          }}
        >
          <Marker
            coordinate={coordinate}
            draggable
            onDragEnd={(event) => {
              setCoordinate(event.nativeEvent.coordinate);
            }}
          />
        </MapView>
      ) : (
        <View style={styles.loading}>
          <Text style={styles.meta}>Preparing map…</Text>
        </View>
      )}

      <View style={styles.sheet}>
        <Text style={styles.title}>Map pin</Text>
        <Text style={styles.meta}>
          {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
        </Text>
        <Text style={styles.hint}>Drag the pin or pan the map, then save.</Text>
        <PrimaryButton label="Center on current GPS" onPress={centerOnDevice} />
        <PrimaryButton label="Save pin" onPress={savePin} />
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    padding: 16,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  meta: {
    fontSize: 14,
    color: colors.muted,
  },
  hint: {
    fontSize: 13,
    color: colors.ink,
  },
  status: {
    fontSize: 13,
    color: colors.accent,
  },
});
