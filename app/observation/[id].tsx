import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useDatabase } from '@/db/DatabaseProvider';
import {
  addSignal,
  getObservation,
  listSignalsForObservation,
  updateObservationPlaceTime,
} from '@/db/observations';
import { colors } from '@/theme/colors';
import type { Observation, Signal } from '@/types/models';

/**
 * Place/time + enrichment shell for a single observation.
 * Real EXIF/GPS and weather APIs arrive in later tasks.
 */
export default function ObservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useDatabase();
  const [observation, setObservation] = useState<Observation | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [placeLabel, setPlaceLabel] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!db || !id) return;
    const row = await getObservation(db, id);
    setObservation(row);
    if (row) {
      setPlaceLabel(row.placeLabel ?? '');
      setLatitude(row.latitude != null ? String(row.latitude) : '');
      setLongitude(row.longitude != null ? String(row.longitude) : '');
      setSignals(await listSignalsForObservation(db, row.id));
    }
  }, [db, id]);

  useEffect(() => {
    reload().catch((err) => {
      setStatus(err instanceof Error ? err.message : 'Failed to load observation');
    });
  }, [reload]);

  async function savePlaceTime() {
    if (!db || !id) return;
    try {
      await updateObservationPlaceTime(db, id, {
        placeLabel: placeLabel.trim() || null,
        latitude: latitude.trim() === '' ? null : Number(latitude),
        longitude: longitude.trim() === '' ? null : Number(longitude),
      });
      setStatus('Place & time saved locally.');
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function addDefaultEnrichmentShell() {
    if (!db || !id) return;
    try {
      const existingKeys = new Set(signals.map((s) => s.key));
      const defaults: Array<{ key: string; value: string; unit: string | null }> = [
        { key: 'weather.summary', value: 'pending', unit: null },
        { key: 'solar.relative', value: 'pending', unit: null },
      ];
      for (const item of defaults) {
        if (!existingKeys.has(item.key)) {
          await addSignal(db, {
            observationId: id,
            key: item.key,
            source: 'api',
            value: item.value,
            unit: item.unit,
            confidence: null,
          });
        }
      }
      setStatus('Default enrichment placeholders attached (API fetch later).');
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Enrichment shell failed');
    }
  }

  if (!observation) {
    return (
      <Screen title="Observation" subtitle={status ?? 'Loading…'}>
        <Text style={styles.muted}>No observation loaded.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title={observation.placeLabel ?? 'Observation'}
      subtitle="Core loop: place/time → enrichment against the local store."
    >
      <View style={styles.panel}>
        <Text style={styles.stepLabel}>2 · Place & time</Text>
        <Text style={styles.label}>Place label</Text>
        <TextInput
          value={placeLabel}
          onChangeText={setPlaceLabel}
          placeholder="Trailhead, lake, field…"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Latitude</Text>
            <TextInput
              value={latitude}
              onChangeText={setLatitude}
              keyboardType="decimal-pad"
              placeholder="0.0000"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Longitude</Text>
            <TextInput
              value={longitude}
              onChangeText={setLongitude}
              keyboardType="decimal-pad"
              placeholder="0.0000"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>
        </View>
        <Text style={styles.meta}>
          Captured {new Date(observation.capturedAt).toLocaleString()}
        </Text>
        <PrimaryButton label="Save place & time" onPress={savePlaceTime} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.stepLabel}>3 · Enrichment</Text>
        <Text style={styles.body}>
          Default signals (weather summary, solar position) will resolve from
          place + time. This shell stores placeholder signal rows locally.
        </Text>
        <PrimaryButton label="Attach default signal shells" onPress={addDefaultEnrichmentShell} />
        {signals.length === 0 ? (
          <Text style={styles.muted}>No signals yet.</Text>
        ) : (
          signals.map((signal) => (
            <View key={signal.id} style={styles.signalRow}>
              <Text style={styles.signalKey}>{signal.key}</Text>
              <Text style={styles.signalValue}>
                {signal.value ?? '—'}
                {signal.unit ? ` ${signal.unit}` : ''} · {signal.source}
              </Text>
            </View>
          ))
        )}
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
    gap: 6,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  signalRow: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 10,
    gap: 2,
  },
  signalKey: {
    fontWeight: '600',
    color: colors.ink,
  },
  signalValue: {
    fontSize: 13,
    color: colors.muted,
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
  },
  status: {
    fontSize: 13,
    color: colors.accent,
  },
});
