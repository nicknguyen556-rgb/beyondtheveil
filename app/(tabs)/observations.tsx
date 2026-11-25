import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
      subtitle="Local SQLite log — offline without premium sync."
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No observations yet</Text>
          <Text style={styles.emptyBody}>
            Capture a draft on the Capture tab. Place/time and enrichment attach
            to each observation row.
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(`/observation/${item.id}`)}
          >
            <Text style={styles.rowTitle}>{item.placeLabel ?? 'Untitled spot'}</Text>
            <Text style={styles.rowMeta}>
              {new Date(item.capturedAt).toLocaleString()}
              {item.latitude != null && item.longitude != null
                ? ` · ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
                : ' · place pending'}
            </Text>
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
    padding: 14,
    gap: 4,
  },
  rowPressed: {
    backgroundColor: colors.accentSoft,
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
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
