/**
 * GD-6: request any signal key (catalog or custom) and enter free-text fallbacks.
 * Resolve uses the shared multi-source merger (top3 / suggestions / custom, cap 5).
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  catalogLabel,
  catalogUnit,
  isChartableSignalValue,
  normalizeSignalKey,
  REQUESTABLE_SIGNAL_KEYS,
} from '@/enrichment/catalog';
import {
  ensureFreeTextPlaceholder,
  requestUserSignal,
  setFreeTextSignal,
} from '@/enrichment/resolveUserSignal';
import { colors } from '@/theme/colors';
import type { Observation, Signal } from '@/types/models';

import { PrimaryButton } from './PrimaryButton';

/** Suggest a short list of on-demand / fallback-prone keys. */
const SUGGESTED_KEYS = [
  'solar.moon_phase',
  'weather.pressure_msl',
  'water.temperature',
  'weather.uv_index',
  'weather.visibility',
] as const;

interface CustomSignalsPanelProps {
  db: SQLiteDatabase;
  observation: Observation;
  signals: Signal[];
  onChanged: () => Promise<void> | void;
  onMessage?: (message: string | null) => void;
  disabled?: boolean;
}

export function CustomSignalsPanel({
  db,
  observation,
  signals,
  onChanged,
  onMessage,
  disabled,
}: CustomSignalsPanelProps) {
  const [keyInput, setKeyInput] = useState('');
  const [freeTextValue, setFreeTextValue] = useState('');
  const [freeTextUnit, setFreeTextUnit] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canResolve =
    observation.latitude != null &&
    observation.longitude != null &&
    Number.isFinite(observation.latitude) &&
    Number.isFinite(observation.longitude);

  const signalByKey = useMemo(() => {
    const map = new Map<string, Signal>();
    for (const signal of signals) map.set(signal.key, signal);
    return map;
  }, [signals]);

  const fallbackCandidates = useMemo(() => {
    return signals.filter(
      (s) =>
        !s.key.startsWith('enrichment.') &&
        !s.key.endsWith('.std_dev') &&
        (s.value === 'unavailable' ||
          (s.source === 'manual' && s.value != null && s.value !== '')),
    );
  }, [signals]);

  const normalizedDraft = normalizeSignalKey(keyInput);
  const draftUnitHint = catalogUnit(normalizedDraft);
  const chartHint = isChartableSignalValue(freeTextValue);

  function pickSuggested(key: string) {
    setKeyInput(key);
    setActiveKey(key);
    const existing = signalByKey.get(key);
    if (existing?.unit) setFreeTextUnit(existing.unit);
    else setFreeTextUnit(catalogUnit(key) ?? '');
    if (existing && existing.value !== 'unavailable' && existing.source === 'manual') {
      setFreeTextValue(existing.value ?? '');
    } else {
      setFreeTextValue('');
    }
  }

  function focusFallback(signal: Signal) {
    setKeyInput(signal.key);
    setActiveKey(signal.key);
    setFreeTextUnit(signal.unit ?? catalogUnit(signal.key) ?? '');
    setFreeTextValue(
      signal.value && signal.value !== 'unavailable' ? signal.value : '',
    );
  }

  async function runResolve() {
    if (busy || disabled) return;
    const key = normalizeSignalKey(keyInput);
    if (!key) {
      onMessage?.('Enter a signal key (catalog or custom, e.g. tide.height).');
      return;
    }
    if (!canResolve) {
      onMessage?.('Add latitude and longitude before resolving from sources.');
      return;
    }

    setBusy(true);
    onMessage?.(`Resolving ${key} via selected sources…`);
    try {
      const result = await requestUserSignal(db, observation.id, key);
      setActiveKey(result.signal.key);
      setKeyInput(result.signal.key);
      setFreeTextUnit(result.signal.unit ?? '');
      if (result.status === 'unavailable') {
        setFreeTextValue('');
      } else if (result.signal.value) {
        setFreeTextValue(result.signal.value);
      }
      onMessage?.(result.message);
      await onChanged();
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'Resolve failed');
    } finally {
      setBusy(false);
    }
  }

  async function runFreeTextOnly() {
    if (busy || disabled) return;
    const key = normalizeSignalKey(keyInput);
    if (!key) {
      onMessage?.('Enter a signal key before free-text entry.');
      return;
    }
    setBusy(true);
    try {
      const placeholder = await ensureFreeTextPlaceholder(db, observation.id, key);
      setActiveKey(placeholder.key);
      setKeyInput(placeholder.key);
      setFreeTextUnit(placeholder.unit ?? '');
      setFreeTextValue('');
      onMessage?.(
        `${placeholder.key} ready for free-text (skipped providers).`,
      );
      await onChanged();
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'Could not create placeholder');
    } finally {
      setBusy(false);
    }
  }

  async function saveFreeText() {
    if (busy || disabled) return;
    const key = normalizeSignalKey(keyInput);
    if (!key) {
      onMessage?.('Enter a signal key for the free-text value.');
      return;
    }
    setBusy(true);
    try {
      const saved = await setFreeTextSignal(db, observation.id, key, freeTextValue, {
        unit: freeTextUnit.trim() || null,
      });
      setActiveKey(saved.key);
      const chartable = isChartableSignalValue(saved.value);
      onMessage?.(
        chartable
          ? `Saved ${saved.key}=${saved.value}${saved.unit ? ` ${saved.unit}` : ''} (chartable).`
          : `Saved free-text ${saved.key} (note — not a parseable number).`,
      );
      await onChanged();
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'Free-text save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Custom signals</Text>
      <Text style={styles.hint}>
        Request any catalog or custom key. Known keys resolve through the shared
        multi-source merger (top3 / suggestions / custom, max 5). Misses stay
        free-text ready with optional units for charts.
      </Text>

      <Text style={styles.label}>Signal key</Text>
      <TextInput
        value={keyInput}
        onChangeText={setKeyInput}
        placeholder="weather.pressure_msl or tide.height"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        editable={!busy && !disabled}
      />

      <View style={styles.chipRow}>
        {SUGGESTED_KEYS.map((key) => {
          const on = normalizeSignalKey(keyInput) === key;
          return (
            <Pressable
              key={key}
              onPress={() => pickSuggested(key)}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <Text style={[styles.chipLabel, on ? styles.chipLabelOn : null]}>
                {catalogLabel(key)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.meta}>
        {REQUESTABLE_SIGNAL_KEYS.length} catalog keys · draft:{' '}
        {normalizedDraft || '—'}
        {draftUnitHint ? ` (${draftUnitHint})` : ''}
      </Text>

      <PrimaryButton
        label={busy ? 'Working…' : 'Resolve from sources'}
        onPress={runResolve}
        disabled={busy || disabled || !canResolve}
      />
      <PrimaryButton
        label="Skip to free-text"
        onPress={runFreeTextOnly}
        disabled={busy || disabled}
      />

      {busy ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.meta}>Talking to selected sources…</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Free-text value</Text>
      <TextInput
        value={freeTextValue}
        onChangeText={setFreeTextValue}
        placeholder="12.5 or note when no API coverage"
        placeholderTextColor={colors.muted}
        style={styles.input}
        editable={!busy && !disabled}
      />

      <Text style={styles.label}>Unit (optional)</Text>
      <TextInput
        value={freeTextUnit}
        onChangeText={setFreeTextUnit}
        placeholder={draftUnitHint ?? '°C, hPa, m…'}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={styles.input}
        editable={!busy && !disabled}
      />

      <Text style={styles.meta}>
        {chartHint
          ? 'Value looks chartable (leading number detected).'
          : 'Add a number (and unit) when you want this point on trends.'}
        {activeKey ? ` · editing ${activeKey}` : ''}
      </Text>

      <PrimaryButton
        label="Save free-text"
        onPress={saveFreeText}
        disabled={busy || disabled}
      />

      {fallbackCandidates.length > 0 ? (
        <View style={styles.fallbackBlock}>
          <Text style={styles.label}>Needs free-text / manual</Text>
          {fallbackCandidates.map((signal) => (
            <Pressable
              key={signal.id}
              onPress={() => focusFallback(signal)}
              style={[
                styles.fallbackRow,
                activeKey === signal.key ? styles.fallbackOn : null,
              ]}
            >
              <Text style={styles.fallbackKey}>{catalogLabel(signal.key)}</Text>
              <Text style={styles.fallbackValue}>
                {signal.value === 'unavailable'
                  ? 'unavailable — tap to enter'
                  : `${signal.value}${signal.unit ? ` ${signal.unit}` : ''}`}
                {isChartableSignalValue(signal.value) ? ' · chartable' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginTop: 4,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  chipLabelOn: {
    color: colors.accent,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fallbackBlock: {
    gap: 6,
    marginTop: 4,
  },
  fallbackRow: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  fallbackOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  fallbackKey: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  fallbackValue: {
    fontSize: 12,
    color: colors.muted,
  },
});
