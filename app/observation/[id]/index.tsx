import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatCoords, formatSourceLabel } from '@/capture/format';
import { getCurrentDeviceGps } from '@/capture/placeTime';
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
 * Place/time + enrichment for a single observation.
 * Shows saved photo and lets the user fix GPS / time when EXIF was incomplete.
 */
export default function ObservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db } = useDatabase();
  const [observation, setObservation] = useState<Observation | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [placeLabel, setPlaceLabel] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [capturedLocal, setCapturedLocal] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!db || !id) return;
    const row = await getObservation(db, id);
    setObservation(row);
    if (row) {
      setPlaceLabel(row.placeLabel ?? '');
      setLatitude(row.latitude != null ? String(row.latitude) : '');
      setLongitude(row.longitude != null ? String(row.longitude) : '');
      setCapturedLocal(toLocalInputValue(row.capturedAt));
      setSignals(await listSignalsForObservation(db, row.id));
    }
  }, [db, id]);

  useEffect(() => {
    reload().catch((err) => {
      setStatus(err instanceof Error ? err.message : 'Failed to load observation');
    });
  }, [reload]);

  async function savePlaceTime() {
    if (!db || !id || !observation) return;
    try {
      const parsedTime = fromLocalInputValue(capturedLocal);
      const nextLat = latitude.trim() === '' ? null : Number(latitude);
      const nextLon = longitude.trim() === '' ? null : Number(longitude);
      const placeChanged =
        nextLat !== observation.latitude || nextLon !== observation.longitude;
      const timeChanged =
        parsedTime != null && parsedTime !== observation.capturedAt;

      await updateObservationPlaceTime(db, id, {
        placeLabel: placeLabel.trim() || null,
        latitude: nextLat,
        longitude: nextLon,
        capturedAt: parsedTime ?? undefined,
        placeSource: placeChanged ? 'manual' : undefined,
        timeSource: timeChanged ? 'manual' : undefined,
      });
      setStatus('Place & time saved locally.');
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function useDeviceGps() {
    setStatus('Reading device GPS…');
    const gps = await getCurrentDeviceGps();
    if (!gps) {
      setStatus('Location permission denied or unavailable.');
      return;
    }
    setLatitude(String(gps.latitude));
    setLongitude(String(gps.longitude));
    if (!db || !id) return;
    await updateObservationPlaceTime(db, id, {
      latitude: gps.latitude,
      longitude: gps.longitude,
      placeSource: 'device',
    });
    setStatus('Updated from device GPS.');
    await reload();
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
      subtitle="Photo saved. Confirm or fix place and time before enrichment."
    >
      {observation.photoUri ? (
        <Image source={{ uri: observation.photoUri }} style={styles.hero} />
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.stepLabel}>2 · Place & time</Text>
        <Text style={styles.meta}>
          {formatCoords(observation.latitude, observation.longitude)}
          {' · '}
          {formatSourceLabel('place', observation.placeSource)}
        </Text>
        <Text style={styles.meta}>
          {new Date(observation.capturedAt).toLocaleString()}
          {' · '}
          {formatSourceLabel('time', observation.timeSource)}
        </Text>

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

        <Text style={styles.label}>Captured time (local)</Text>
        <TextInput
          value={capturedLocal}
          onChangeText={setCapturedLocal}
          placeholder="YYYY-MM-DD HH:mm"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
        />

        <PrimaryButton label="Save place & time" onPress={savePlaceTime} />
        <PrimaryButton label="Use current GPS" onPress={useDeviceGps} />
        <PrimaryButton
          label="Set map pin"
          onPress={() => router.push(`/observation/${id}/pin`)}
        />
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

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid time. Use YYYY-MM-DD HH:mm');
  }
  return date.toISOString();
}

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
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
