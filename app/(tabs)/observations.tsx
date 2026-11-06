import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCoords, formatSourceLabel } from '@/capture/format';
import { Screen } from '@/components/Screen';
import { useDatabase } from '@/db/DatabaseProvider';
import { listObservations } from '@/db/observations';
import { colors } from '@/theme/colors';
import type { Observation } from '@/types/models';

export default function ObservationsScreen() {
  const { db } = useDatabase();
  const router = useRouter();
  const [items, setItems] = useState<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!db) return;
        try {
          const rows = await listObservations(db);
          if (active) {
            setItems(rows);
            setError(null);
          }
        } catch (err) {
          if (active) {
            setError(err instanceof Error ? err.message : 'Failed to load observations');
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [db]),
  );

  return (
    <Screen
      title="Observations"
      subtitle="Local SQLite log — photo, place, and time from capture."
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No observations yet</Text>
          <Text style={styles.emptyBody}>
            Capture or import a photo. EXIF place/time (or GPS fallbacks) land on each row.
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(`/observation/${item.id}`)}
          >
            {item.photoUri ? (
              <Image source={{ uri: item.photoUri }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Text style={styles.thumbPlaceholderText}>No photo</Text>
              </View>
            )}
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.placeLabel ?? 'Untitled spot'}</Text>
              <Text style={styles.rowMeta}>
                {new Date(item.capturedAt).toLocaleString()}
                {' · '}
                {formatCoords(item.latitude, item.longitude)}
              </Text>
              <Text style={styles.rowSources}>
                {formatSourceLabel('place', item.placeSource)}
                {' · '}
                {formatSourceLabel('time', item.timeSource)}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowPressed: {
    backgroundColor: colors.accentSoft,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    fontSize: 11,
    color: colors.muted,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  rowMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  rowSources: {
    fontSize: 12,
    color: colors.accent,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
