import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatCoords, formatSourceLabel } from '@/capture/format';
import { getCurrentDeviceGps } from '@/capture/placeTime';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useDatabase } from '@/db/DatabaseProvider';
import {
  getObservation,
  listSignalsForObservation,
  updateObservationPlaceTime,
} from '@/db/observations';
import { catalogLabel, SIGNAL_CATALOG } from '@/enrichment/catalog';
import { enrichObservation } from '@/enrichment/enrichObservation';
import { colors } from '@/theme/colors';
import type { Observation, Signal } from '@/types/models';

/** Display order for enrichment panels — required first, then extras. */
const DETAIL_SIGNAL_ORDER = [
  'solar.time_of_day',
  'solar.daylight_remaining_min',
  'weather.pressure_msl',
  'weather.wind_speed',
  'weather.wind_direction',
  'weather.humidity',
  'weather.uv_index',
  'water.temperature',
  'weather.precipitation',
  'weather.temperature',
  'weather.feels_like',
  'weather.cloud_cover',
  'weather.visibility',
  'weather.dew_point',
  'weather.wind_gusts',
  'weather.conditions',
  'solar.sunrise',
  'solar.sunset',
  'solar.moon_phase',
] as const;

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
  const [enriching, setEnriching] = useState(false);

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

  const signalByKey = useMemo(() => {
    const map = new Map<string, Signal>();
    for (const signal of signals) {
      map.set(signal.key, signal);
    }
    return map;
  }, [signals]);

  const enrichmentMeta = useMemo(() => {
    return {
      status: signalByKey.get('enrichment.status')?.value ?? null,
      error: signalByKey.get('enrichment.error')?.value ?? null,
      fetchedAt: signalByKey.get('enrichment.fetched_at')?.value ?? null,
      provider: signalByKey.get('enrichment.provider')?.value ?? null,
    };
  }, [signalByKey]);

  const displaySignals = useMemo(() => {
    const ordered: Signal[] = [];
    const seen = new Set<string>();
    for (const key of DETAIL_SIGNAL_ORDER) {
      const signal = signalByKey.get(key);
      if (signal) {
        ordered.push(signal);
        seen.add(key);
      }
    }
    for (const signal of signals) {
      if (seen.has(signal.key) || signal.key.startsWith('enrichment.')) continue;
      ordered.push(signal);
    }
    return ordered;
  }, [signalByKey, signals]);

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

      if (nextLat != null && nextLon != null && Number.isFinite(nextLat) && Number.isFinite(nextLon)) {
        await runEnrichment();
      }
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

  async function runEnrichment() {
    if (!db || !id || enriching) return;
    setEnriching(true);
    setStatus('Fetching Open-Meteo weather & solar context…');
    try {
      const result = await enrichObservation(db, id);
      setStatus(result.message);
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Enrichment failed');
    } finally {
      setEnriching(false);
    }
  }

  if (!observation) {
    return (
      <Screen title="Observation" subtitle={status ?? 'Loading…'}>
        <Text style={styles.muted}>No observation loaded.</Text>
      </Screen>
    );
  }

  const canEnrich =
    observation.latitude != null &&
    observation.longitude != null &&
    Number.isFinite(observation.latitude) &&
    Number.isFinite(observation.longitude);

  return (
    <Screen
      title={observation.placeLabel ?? 'Observation'}
      subtitle="Photo saved. Confirm place and time, then pull weather for that moment."
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
          Open-Meteo fills weather and solar signals for this place and time. Water
          temperature is included when marine coverage exists; otherwise marked
          unavailable for free-text later.
        </Text>

        <PrimaryButton
          label={enriching ? 'Enriching…' : 'Fetch weather & solar'}
          onPress={runEnrichment}
          disabled={!canEnrich || enriching}
        />

        {enriching ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Talking to Open-Meteo…</Text>
          </View>
        ) : null}

        {!canEnrich ? (
          <Text style={styles.muted}>
            Add latitude and longitude before enrichment can run.
          </Text>
        ) : null}

        {enrichmentMeta.status ? (
          <Text style={styles.meta}>
            Status: {enrichmentMeta.status}
            {enrichmentMeta.provider ? ` · ${enrichmentMeta.provider}` : ''}
            {enrichmentMeta.fetchedAt
              ? ` · ${new Date(enrichmentMeta.fetchedAt).toLocaleString()}`
              : ''}
          </Text>
        ) : null}

        {enrichmentMeta.error ? (
          <Text style={styles.warn}>{enrichmentMeta.error}</Text>
        ) : null}

        {displaySignals.length === 0 ? (
          <Text style={styles.muted}>No enrichment signals yet.</Text>
        ) : (
          displaySignals.map((signal) => (
            <View key={signal.id} style={styles.signalRow}>
              <Text style={styles.signalKey}>{catalogLabel(signal.key)}</Text>
              <Text style={styles.signalValue}>
                {formatSignalValue(signal)}
                {' · '}
                {signal.source}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.catalogHint}>
          Catalog: {SIGNAL_CATALOG.filter((e) => e.trendable).length} trendable
          signals documented in README.
        </Text>
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}
    </Screen>
  );
}

function formatSignalValue(signal: Signal): string {
  if (signal.value == null || signal.value === '') return '—';
  if (signal.value === 'unavailable') return 'unavailable (free-text ready)';
  return `${signal.value}${signal.unit ? ` ${signal.unit}` : ''}`;
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
  warn: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.accent,
  },
  status: {
    fontSize: 13,
    color: colors.accent,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catalogHint: {
    fontSize: 12,
    color: colors.muted,
  },
});
