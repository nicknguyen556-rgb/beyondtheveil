import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCoords } from '@/capture/format';
import { EmptyState } from '@/components/EmptyState';
import { parseObservationTags } from '@/db/observations';
import { colors } from '@/theme/colors';
import type { Observation } from '@/types/models';

interface ObservationTimelineProps {
  observations: Observation[];
  onCapturePress?: () => void;
}

type DayGroup = {
  dayKey: string;
  label: string;
  items: Observation[];
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toISOString().slice(0, 10);
}

function dayLabel(key: string): string {
  if (key === 'unknown') return 'Unknown date';
  const d = new Date(`${key}T12:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function TimelineOutcomeLine({ observation }: { observation: Observation }) {
  const tags = parseObservationTags(observation.tagsJson);
  if (observation.outcomeRating == null && tags.length === 0) return null;
  const parts: string[] = [];
  if (observation.outcomeRating != null) {
    parts.push(`Outcome ${observation.outcomeRating}/5`);
  }
  if (tags.length > 0) parts.push(tags.join(', '));
  return <Text style={styles.entryRating}>{parts.join(' · ')}</Text>;
}

/** Chronological timeline grouped by calendar day (newest first). */
export function ObservationTimeline({
  observations,
  onCapturePress,
}: ObservationTimelineProps) {
  const router = useRouter();
  const groups = useMemo<DayGroup[]>(() => {
    const sorted = [...observations].sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    );
    const map = new Map<string, Observation[]>();
    for (const item of sorted) {
      const key = dayKey(item.capturedAt);
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      dayKey: key,
      label: dayLabel(key),
      items,
    }));
  }, [observations]);

  if (observations.length === 0) {
    return (
      <EmptyState
        eyebrow="Timeline"
        title="No days logged yet"
        body="After you capture, entries group by calendar day so trips read like a field notebook."
        actionLabel={onCapturePress ? 'Go to Capture' : undefined}
        onAction={onCapturePress}
      />
    );
  }

  return (
    <View style={styles.root}>
      {groups.map((group) => (
        <View key={group.dayKey} style={styles.dayBlock}>
          <View style={styles.dayHeader}>
            <View style={styles.railDot} />
            <Text style={styles.dayLabel}>{group.label}</Text>
            <Text style={styles.dayCount}>
              {group.items.length} capture{group.items.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.rail}>
            {group.items.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.entry,
                  pressed && styles.entryPressed,
                ]}
                onPress={() => router.push(`/observation/${item.id}`)}
              >
                {item.photoUri ? (
                  <Image source={{ uri: item.photoUri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Text style={styles.thumbPlaceholderText}>—</Text>
                  </View>
                )}
                <View style={styles.entryBody}>
                  <Text style={styles.entryTitle}>
                    {item.placeLabel ?? 'Untitled spot'}
                  </Text>
                  <Text style={styles.entryMeta}>
                    {new Date(item.capturedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {formatCoords(item.latitude, item.longitude)}
                  </Text>
                  <TimelineOutcomeLine observation={item} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 20,
  },
  dayBlock: {
    gap: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  dayLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  dayCount: {
    fontSize: 12,
    color: colors.muted,
  },
  rail: {
    marginLeft: 4,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.accentSoft,
    gap: 8,
  },
  entry: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    alignItems: 'center',
  },
  entryPressed: {
    backgroundColor: colors.accentSoft,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    color: colors.muted,
  },
  entryBody: {
    flex: 1,
    gap: 2,
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  entryMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  entryRating: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
});
