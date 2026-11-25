import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCoords, formatSourceLabel } from '@/capture/format';
import { ObservationMapView } from '@/components/ObservationMapView';
import { ObservationTimeline } from '@/components/ObservationTimeline';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useDatabase } from '@/db/DatabaseProvider';
import { listObservations } from '@/db/observations';
import { shareObservationsExport, type ExportFormat } from '@/export';
import { colors } from '@/theme/colors';
import type { Observation } from '@/types/models';

type LogMode = 'list' | 'map' | 'timeline';

const MODES: { id: LogMode; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'map', label: 'Map' },
  { id: 'timeline', label: 'Timeline' },
];

export default function ObservationsScreen() {
  const { db } = useDatabase();
  const router = useRouter();
  const [items, setItems] = useState<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<LogMode>('list');
  const [stripCoordinates, setStripCoordinates] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

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

  async function onExport(format: ExportFormat) {
    if (!db || exportBusy) return;
    setExportBusy(true);
    setExportStatus(null);
    const result = await shareObservationsExport(db, format, { stripCoordinates });
    setExportBusy(false);
    if (!result.ok) {
      setExportStatus(result.error ?? 'Export failed');
      return;
    }
    if (result.error) {
      setExportStatus(result.error);
      return;
    }
    setExportStatus(
      `Exported ${items.length} observation${items.length === 1 ? '' : 's'} as ${format.toUpperCase()}` +
        (stripCoordinates ? ' (coordinates stripped).' : '.'),
    );
  }

  return (
    <Screen
      title="Observations"
      subtitle="Browse the local log as a list, map, or day timeline — and export your data."
    >
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => setMode(m.id)}
              style={[styles.modeChip, active && styles.modeChipActive]}
            >
              <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {mode === 'list' ? (
        items.length === 0 ? (
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
        )
      ) : null}

      {mode === 'map' ? <ObservationMapView observations={items} /> : null}
      {mode === 'timeline' ? <ObservationTimeline observations={items} /> : null}

      <View style={styles.exportPanel}>
        <Text style={styles.exportTitle}>Data export</Text>
        <Text style={styles.exportBody}>
          You own your data. Export observations and signals as JSON or CSV. Photos stay on
          device (export notes whether a local photo exists). Optionally strip coordinates for
          privacy.
        </Text>
        <Pressable
          onPress={() => setStripCoordinates((v) => !v)}
          style={styles.toggleRow}
        >
          <View style={[styles.checkbox, stripCoordinates && styles.checkboxOn]} />
          <Text style={styles.toggleLabel}>Strip latitude / longitude from export</Text>
        </Pressable>
        <PrimaryButton
          label={exportBusy ? 'Exporting…' : 'Export JSON'}
          onPress={() => onExport('json')}
          disabled={!db || exportBusy || items.length === 0}
        />
        <PrimaryButton
          label={exportBusy ? 'Exporting…' : 'Export CSV'}
          onPress={() => onExport('csv')}
          disabled={!db || exportBusy || items.length === 0}
        />
        {exportStatus ? <Text style={styles.exportStatus}>{exportStatus}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  modeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  modeChipTextActive: {
    color: colors.white,
  },
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
  exportPanel: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  exportTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  exportBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.white,
  },
  checkboxOn: {
    backgroundColor: colors.accent,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
  },
  exportStatus: {
    fontSize: 13,
    color: colors.accent,
  },
});
