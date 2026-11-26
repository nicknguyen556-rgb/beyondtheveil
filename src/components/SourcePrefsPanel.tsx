/**
 * Per-dataset source selection prefs UI.
 * Custom mode hard-caps at 5 (same as suggestions); extras are rejected with a message.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { CUSTOM_SOURCE_CAP } from '@/enrichment/sources/cap';
import { getDatasetPrefs, setDatasetPrefs } from '@/enrichment/sources/prefs';
import {
  isSourceConfigured,
  sourcesForDataset,
} from '@/enrichment/sources/registry';
import type {
  DatasetId,
  EnrichmentDatasetPrefs,
  SourceId,
  SourceSelectionMode,
} from '@/enrichment/sources/types';
import { colors } from '@/theme/colors';

const MODES: Array<{ id: SourceSelectionMode; label: string }> = [
  { id: 'top3', label: 'Top 3' },
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'custom', label: 'Custom' },
];

const DATASETS: DatasetId[] = ['weather', 'solar', 'water'];

interface SourcePrefsPanelProps {
  db: SQLiteDatabase;
  onMessage?: (message: string | null) => void;
}

export function SourcePrefsPanel({ db, onMessage }: SourcePrefsPanelProps) {
  const [activeDataset, setActiveDataset] = useState<DatasetId>('weather');
  const [prefs, setPrefs] = useState<EnrichmentDatasetPrefs | null>(null);
  const [capMessage, setCapMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await getDatasetPrefs(db, activeDataset);
    setPrefs(next);
  }, [db, activeDataset]);

  useEffect(() => {
    reload().catch((err) => {
      onMessage?.(err instanceof Error ? err.message : 'Failed to load source prefs');
    });
  }, [reload, onMessage]);

  async function save(
    nextMode: SourceSelectionMode,
    nextCustom: SourceId[],
  ) {
    const result = await setDatasetPrefs(db, {
      datasetId: activeDataset,
      mode: nextMode,
      customSourceIds: nextCustom,
    });
    setPrefs(result.prefs);
    setCapMessage(result.truncationMessage);
    if (result.truncationMessage) {
      onMessage?.(result.truncationMessage);
    }
  }

  function selectMode(mode: SourceSelectionMode) {
    if (!prefs) return;
    save(mode, prefs.customSourceIds).catch((err) => {
      onMessage?.(err instanceof Error ? err.message : 'Failed to save mode');
    });
  }

  function toggleCustomSource(sourceId: SourceId) {
    if (!prefs) return;
    const selected = new Set(prefs.customSourceIds);
    if (selected.has(sourceId)) {
      selected.delete(sourceId);
      setCapMessage(null);
      save(prefs.mode === 'custom' ? 'custom' : prefs.mode, [...selected]).catch(
        (err) => {
          onMessage?.(
            err instanceof Error ? err.message : 'Failed to update sources',
          );
        },
      );
      return;
    }

    if (selected.size >= CUSTOM_SOURCE_CAP) {
      const message = `Custom source selection is capped at ${CUSTOM_SOURCE_CAP}. Deselect one before adding another.`;
      setCapMessage(message);
      onMessage?.(message);
      return;
    }

    selected.add(sourceId);
    setCapMessage(null);
    // Switching on a custom pick implies custom mode so the list is used.
    save('custom', [...selected]).catch((err) => {
      onMessage?.(
        err instanceof Error ? err.message : 'Failed to update sources',
      );
    });
  }

  const candidates = sourcesForDataset(activeDataset);
  const customCount = prefs?.customSourceIds.length ?? 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Source selection</Text>
      <Text style={styles.hint}>
        Top 3 · Suggestions (max {CUSTOM_SOURCE_CAP}) · Custom (max{' '}
        {CUSTOM_SOURCE_CAP})
      </Text>

      <View style={styles.row}>
        {DATASETS.map((id) => (
          <Pressable
            key={id}
            onPress={() => {
              setActiveDataset(id);
              setCapMessage(null);
            }}
            style={[
              styles.chip,
              activeDataset === id ? styles.chipOn : null,
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                activeDataset === id ? styles.chipLabelOn : null,
              ]}
            >
              {id}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        {MODES.map((mode) => (
          <Pressable
            key={mode.id}
            onPress={() => selectMode(mode.id)}
            style={[
              styles.chip,
              prefs?.mode === mode.id ? styles.chipOn : null,
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                prefs?.mode === mode.id ? styles.chipLabelOn : null,
              ]}
            >
              {mode.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {prefs?.mode === 'custom' ? (
        <View style={styles.customBlock}>
          <Text style={styles.meta}>
            Custom sources {customCount}/{CUSTOM_SOURCE_CAP}
          </Text>
          {candidates.map((source) => {
            const on = prefs.customSourceIds.includes(source.id);
            const configured = isSourceConfigured(source);
            const atCap = !on && customCount >= CUSTOM_SOURCE_CAP;
            return (
              <Pressable
                key={source.id}
                disabled={!configured && !on}
                onPress={() => toggleCustomSource(source.id)}
                style={[
                  styles.sourceRow,
                  on ? styles.sourceOn : null,
                  atCap ? styles.sourceDisabled : null,
                  !configured ? styles.sourceDisabled : null,
                ]}
              >
                <Text style={styles.sourceLabel}>
                  {on ? '✓ ' : ''}
                  {source.label}
                  {!configured ? ' (needs key)' : ''}
                  {atCap && !on ? ' — cap reached' : ''}
                </Text>
                <Text style={styles.sourceMeta}>
                  reliability {source.reliability}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.meta}>
          {prefs?.mode === 'top3'
            ? 'Uses up to 3 ranked sources (usage-biased when available).'
            : `Uses our curated suggestions (cap ${CUSTOM_SOURCE_CAP}).`}
        </Text>
      )}

      {capMessage ? <Text style={styles.warn}>{capMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  chipLabelOn: {
    color: colors.accent,
  },
  customBlock: {
    gap: 6,
  },
  sourceRow: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  sourceOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  sourceDisabled: {
    opacity: 0.55,
  },
  sourceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  sourceMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
  },
  warn: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.danger,
  },
});
