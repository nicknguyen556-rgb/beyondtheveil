import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';

import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import type { Observation } from '@/types/models';

const FALLBACK_REGION: Region = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

interface ObservationMapViewProps {
  observations: Observation[];
  onCapturePress?: () => void;
}

function regionForPins(pins: Observation[]): Region {
  const withCoords = pins.filter(
    (o): o is Observation & { latitude: number; longitude: number } =>
      o.latitude != null && o.longitude != null,
  );
  if (withCoords.length === 0) return FALLBACK_REGION;

  let minLat = withCoords[0].latitude;
  let maxLat = withCoords[0].latitude;
  let minLon = withCoords[0].longitude;
  let maxLon = withCoords[0].longitude;
  for (const pin of withCoords) {
    minLat = Math.min(minLat, pin.latitude);
    maxLat = Math.max(maxLat, pin.latitude);
    minLon = Math.min(minLon, pin.longitude);
    maxLon = Math.max(maxLon, pin.longitude);
  }

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLon + maxLon) / 2;
  const latitudeDelta = Math.max(0.04, (maxLat - minLat) * 1.4 || 0.08);
  const longitudeDelta = Math.max(0.04, (maxLon - minLon) * 1.4 || 0.08);
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

/** Full-log map of observations that have coordinates. */
export function ObservationMapView({
  observations,
  onCapturePress,
}: ObservationMapViewProps) {
  const router = useRouter();
  const pins = useMemo(
    () =>
      observations.filter(
        (o) => o.latitude != null && o.longitude != null,
      ),
    [observations],
  );
  const region = useMemo(() => regionForPins(pins), [pins]);

  if (pins.length === 0) {
    const noObservations = observations.length === 0;
    return (
      <EmptyState
        eyebrow="Map"
        title={noObservations ? 'Nothing on the map yet' : 'No pinned spots yet'}
        body={
          noObservations
            ? 'Capture a field photo first. Spots with GPS or a manual pin show up here.'
            : 'These observations are missing coordinates. Open one and set a map pin, or use device GPS.'
        }
        actionLabel={noObservations && onCapturePress ? 'Go to Capture' : undefined}
        onAction={noObservations ? onCapturePress : undefined}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <MapView style={styles.map} initialRegion={region}>
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={{
              latitude: pin.latitude as number,
              longitude: pin.longitude as number,
            }}
            pinColor={colors.accent}
          >
            <Callout
              onPress={() => router.push(`/observation/${pin.id}`)}
            >
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>
                  {pin.placeLabel ?? 'Untitled spot'}
                </Text>
                <Text style={styles.calloutMeta}>
                  {new Date(pin.capturedAt).toLocaleString()}
                </Text>
                <Text style={styles.calloutLink}>Open detail</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
      <Text style={styles.caption}>
        {pins.length} pin{pins.length === 1 ? '' : 's'} · tap a marker for detail
      </Text>
      {/* accessibility: also list shortcuts below map for screen readers */}
      <View style={styles.listShortcuts}>
        {pins.slice(0, 8).map((pin) => (
          <Pressable
            key={`link-${pin.id}`}
            onPress={() => router.push(`/observation/${pin.id}`)}
            style={({ pressed }) => [
              styles.shortcut,
              pressed && styles.shortcutPressed,
            ]}
          >
            <Text style={styles.shortcutText} numberOfLines={1}>
              {pin.placeLabel ?? 'Untitled'} ·{' '}
              {new Date(pin.capturedAt).toLocaleDateString()}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    flex: 1,
  },
  map: {
    height: 360,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  caption: {
    fontSize: 13,
    color: colors.muted,
  },
  callout: {
    minWidth: 140,
    maxWidth: 220,
    gap: 2,
    padding: 4,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  calloutMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  calloutLink: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  listShortcuts: {
    gap: 6,
  },
  shortcut: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shortcutPressed: {
    backgroundColor: colors.accentSoft,
  },
  shortcutText: {
    fontSize: 13,
    color: colors.ink,
  },
});
