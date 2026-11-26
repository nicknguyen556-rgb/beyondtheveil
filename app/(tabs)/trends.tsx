import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AiSuggestionsPanel,
  suggestionQueryPatch,
} from '@/components/AiSuggestionsPanel';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingHint } from '@/components/OnboardingHint';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TrendChart } from '@/components/TrendChart';
import { useDatabase } from '@/db/DatabaseProvider';
import { listObservations } from '@/db/observations';
import { listActiveSuggestions } from '@/db/suggestions';
import {
  createTrendView,
  deleteTrendView,
  listDistinctSignalKeys,
  listDistinctTags,
  listObservationsWithCoords,
  listSignalsForObservations,
  listTrendViews,
  trendViewToQuery,
} from '@/db/trends';
import {
  SIGNAL_CATALOG,
  catalogLabel,
  normalizeSignalKey,
} from '@/enrichment/catalog';
import { useSync } from '@/sync';
import { colors } from '@/theme/colors';
import type {
  AiSuggestion,
  ChartType,
  Observation,
  TrendView,
} from '@/types/models';
import { BUILTIN_TREND_PRESETS, builtinToQuery } from '@/trends/presets';
import {
  buildTrendSeries,
  endOfDayIso,
  startOfDayIso,
} from '@/trends/series';
import {
  OUTCOME_RATING_KEY,
  defaultTrendQuery,
  emptyFilters,
  type PlaceRadiusFilter,
  type TrendQuery,
} from '@/trends/types';

const CHART_TYPES: ChartType[] = ['line', 'scatter', 'bar'];
const RADIUS_PRESETS_KM = [1, 5, 10, 25, 50];

const CATALOG_TRENDABLE = SIGNAL_CATALOG.filter((e) => e.trendable).map(
  (e) => e.key,
);

export default function TrendsScreen() {
  const router = useRouter();
  const { db } = useDatabase();
  const { entitlement } = useSync();
  const [observations, setObservations] = useState<Observation[]>([]);
  const [savedViews, setSavedViews] = useState<TrendView[]>([]);
  const [dbKeys, setDbKeys] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [placed, setPlaced] = useState<Observation[]>([]);
  const [query, setQuery] = useState<TrendQuery>(defaultTrendQuery);
  const [signalsByObs, setSignalsByObs] = useState<
    Awaited<ReturnType<typeof listSignalsForObservations>>
  >([]);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [dateStartDraft, setDateStartDraft] = useState('');
  const [dateEndDraft, setDateEndDraft] = useState('');
  const [radiusDraft, setRadiusDraft] = useState('10');

  const reload = useCallback(async () => {
    if (!db) return;
    try {
      const [obs, views, keys, tags, withCoords, activeSuggestions] =
        await Promise.all([
          listObservations(db),
          listTrendViews(db),
          listDistinctSignalKeys(db),
          listDistinctTags(db),
          listObservationsWithCoords(db),
          listActiveSuggestions(db),
        ]);
      setObservations(obs);
      setSavedViews(views);
      setDbKeys(keys);
      setAllTags(tags);
      setPlaced(withCoords);
      setSuggestions(activeSuggestions);
      const signals = await listSignalsForObservations(
        db,
        obs.map((o) => o.id),
      );
      setSignalsByObs(signals);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trends data');
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!db) return;
        await reload();
        if (!active) return;
      })();
      return () => {
        active = false;
      };
    }, [db, reload]),
  );

  const selectableKeys = useMemo(() => {
    const set = new Set<string>([
      ...CATALOG_TRENDABLE,
      ...dbKeys.filter((k) => !k.endsWith('.std_dev') && !k.startsWith('enrichment.')),
      OUTCOME_RATING_KEY,
    ]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dbKeys]);

  const dateRangeStart = dateStartDraft.trim()
    ? startOfDayIso(dateStartDraft.trim())
    : query.dateRangeStart;
  const dateRangeEnd = dateEndDraft.trim()
    ? endOfDayIso(dateEndDraft.trim())
    : query.dateRangeEnd;

  const chartResult = useMemo(
    () =>
      buildTrendSeries({
        observations,
        signals: signalsByObs,
        signalKeys: query.signalKeys,
        filters: query.filters,
        dateRangeStart,
        dateRangeEnd,
      }),
    [
      observations,
      signalsByObs,
      query.signalKeys,
      query.filters,
      dateRangeStart,
      dateRangeEnd,
    ],
  );

  function toggleSignalKey(key: string) {
    setActivePresetId(null);
    setQuery((prev) => {
      const has = prev.signalKeys.includes(key);
      return {
        ...prev,
        signalKeys: has
          ? prev.signalKeys.filter((k) => k !== key)
          : [...prev.signalKeys, key],
      };
    });
  }

  function addCustomSignalKey() {
    const key = normalizeSignalKey(customKey);
    if (!key) {
      setStatus('Enter a signal key (e. for example weather.temperature).');
      return;
    }
    setActivePresetId(null);
    setQuery((prev) =>
      prev.signalKeys.includes(key)
        ? prev
        : { ...prev, signalKeys: [...prev.signalKeys, key] },
    );
    setCustomKey('');
    setStatus(`Added ${key}`);
  }

  function toggleTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return;
    setActivePresetId(null);
    setQuery((prev) => {
      const has = prev.filters.tags.includes(normalized);
      return {
        ...prev,
        filters: {
          ...prev.filters,
          tags: has
            ? prev.filters.tags.filter((t) => t !== normalized)
            : [...prev.filters.tags, normalized],
        },
      };
    });
  }

  function addTagDraft() {
    if (!tagDraft.trim()) return;
    toggleTag(tagDraft);
    setTagDraft('');
  }

  function setPlaceCenter(observation: Observation) {
    if (observation.latitude == null || observation.longitude == null) return;
    const radiusKm = Math.max(0.1, Number(radiusDraft) || 10);
    const place: PlaceRadiusFilter = {
      latitude: observation.latitude,
      longitude: observation.longitude,
      radiusKm,
    };
    setActivePresetId(null);
    setQuery((prev) => ({
      ...prev,
      filters: { ...prev.filters, place },
    }));
    setStatus(
      `Place filter: ${observation.placeLabel ?? 'spot'} ± ${radiusKm} km`,
    );
  }

  function clearPlaceFilter() {
    setActivePresetId(null);
    setQuery((prev) => ({
      ...prev,
      filters: { ...prev.filters, place: null },
    }));
  }

  function applyRadiusPreset(km: number) {
    setRadiusDraft(String(km));
    setQuery((prev) => {
      if (!prev.filters.place) return prev;
      setActivePresetId(null);
      return {
        ...prev,
        filters: {
          ...prev.filters,
          place: { ...prev.filters.place, radiusKm: km },
        },
      };
    });
  }

  function applyBuiltin(id: string) {
    const preset = BUILTIN_TREND_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const next = builtinToQuery(preset);
    setQuery(next);
    setDateStartDraft('');
    setDateEndDraft('');
    setActivePresetId(id);
    setStatus(`Loaded preset “${preset.name}”`);
  }

  function applySaved(view: TrendView) {
    const next = trendViewToQuery(view);
    setQuery(next);
    setDateStartDraft(
      next.dateRangeStart ? next.dateRangeStart.slice(0, 10) : '',
    );
    setDateEndDraft(next.dateRangeEnd ? next.dateRangeEnd.slice(0, 10) : '');
    if (next.filters.place) {
      setRadiusDraft(String(next.filters.place.radiusKm));
    }
    setActivePresetId(view.id);
    setStatus(`Loaded saved “${view.name}”`);
  }

  async function savePreset() {
    if (!db) return;
    const name = presetName.trim();
    if (!name) {
      setStatus('Name the preset before saving.');
      return;
    }
    if (query.signalKeys.length === 0) {
      setStatus('Select at least one signal key.');
      return;
    }
    try {
      const view = await createTrendView(db, {
        name,
        signalKeys: query.signalKeys,
        chartType: query.chartType,
        dateRangeStart,
        dateRangeEnd,
        filters: query.filters,
      });
      setPresetName('');
      setActivePresetId(view.id);
      await reload();
      setStatus(`Saved preset “${view.name}”`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function removeSaved(id: string) {
    if (!db) return;
    try {
      await deleteTrendView(db, id);
      if (activePresetId === id) setActivePresetId(null);
      await reload();
      setStatus('Preset deleted');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function resetFilters() {
    setQuery((prev) => ({
      ...prev,
      filters: emptyFilters(),
      dateRangeStart: null,
      dateRangeEnd: null,
    }));
    setDateStartDraft('');
    setDateEndDraft('');
    setActivePresetId(null);
    setStatus('Filters cleared');
  }

  function applyAiSuggestion(patch: {
    signalKeys: string[];
    dateRangeStart: string | null;
    dateRangeEnd: string | null;
  }) {
    setActivePresetId(null);
    setQuery((prev) => suggestionQueryPatch(patch, prev));
    setDateStartDraft(
      patch.dateRangeStart ? patch.dateRangeStart.slice(0, 10) : '',
    );
    setDateEndDraft(patch.dateRangeEnd ? patch.dateRangeEnd.slice(0, 10) : '');
  }

  const isEmpty = observations.length === 0;

  return (
    <Screen
      title="Trends"
      subtitle="Honest graphs from place, weather, and outcomes — filter until the pattern holds."
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isEmpty ? (
        <EmptyState
          eyebrow="Needs data"
          title="Trends wake up after a few captures"
          body="Log photos with place and enrichment first. Then pick signal keys (weather, solar, ratings) to plot honest patterns over time."
          actionLabel="Go to Capture"
          onAction={() => router.push('/')}
        />
      ) : (
        <OnboardingHint label="How to read">
          Select signal keys below, optionally filter by place or tags, then watch the
          chart. Presets are shortcuts — correctness over novelty.
        </OnboardingHint>
      )}

      {!isEmpty ? (
        <AiSuggestionsPanel
          db={db}
          entitlement={entitlement}
          suggestions={suggestions}
          onSuggestionsChange={setSuggestions}
          onApply={applyAiSuggestion}
          onStatus={setStatus}
        />
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.heading}>Chart</Text>
        <Text style={styles.meta}>
          {chartResult.matchedObservationCount} observation
          {chartResult.matchedObservationCount === 1 ? '' : 's'} matched ·{' '}
          {query.signalKeys.length} series
        </Text>
        <TrendChart
          result={chartResult}
          chartType={query.chartType}
          showStdDev={query.filters.showStdDev}
          emptyHint={
            isEmpty
              ? 'Capture and enrich observations to fill this chart.'
              : undefined
          }
        />
        <View style={styles.chipRow}>
          {CHART_TYPES.map((type) => (
            <Chip
              key={type}
              label={type}
              selected={query.chartType === type}
              onPress={() => {
                setActivePresetId(null);
                setQuery((prev) => ({ ...prev, chartType: type }));
              }}
            />
          ))}
          <Chip
            label={query.filters.showStdDev ? 'σ on' : 'σ off'}
            selected={query.filters.showStdDev}
            onPress={() => {
              setActivePresetId(null);
              setQuery((prev) => ({
                ...prev,
                filters: {
                  ...prev.filters,
                  showStdDev: !prev.filters.showStdDev,
                },
              }));
            }}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.heading}>Signal keys</Text>
        <Text style={styles.body}>
          Averaged multi-source values use the primary key. Toggle σ to overlay
          {'{key}'}.std_dev bands from per-source samples.
        </Text>
        <View style={styles.chipRow}>
          {selectableKeys.map((key) => (
            <Chip
              key={key}
              label={key === OUTCOME_RATING_KEY ? 'Outcome rating' : catalogLabel(key)}
              selected={query.signalKeys.includes(key)}
              onPress={() => toggleSignalKey(key)}
            />
          ))}
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="Add key (e.g. water.temperature)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={customKey}
            onChangeText={setCustomKey}
            onSubmitEditing={addCustomSignalKey}
          />
          <Pressable style={styles.smallBtn} onPress={addCustomSignalKey}>
            <Text style={styles.smallBtnText}>Add</Text>
          </Pressable>
        </View>
        {query.signalKeys.length > 0 ? (
          <Text style={styles.meta}>
            Selected: {query.signalKeys.join(', ')}
          </Text>
        ) : (
          <Text style={styles.warn}>Select at least one signal to plot.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.heading}>Date range</Text>
        <Text style={styles.body}>YYYY-MM-DD (UTC day bounds). Leave blank for all time.</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="Start"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            value={dateStartDraft}
            onChangeText={(text) => {
              setDateStartDraft(text);
              setActivePresetId(null);
            }}
          />
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="End"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            value={dateEndDraft}
            onChangeText={(text) => {
              setDateEndDraft(text);
              setActivePresetId(null);
            }}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.heading}>Place radius</Text>
        <Text style={styles.body}>
          Center on an observation with coordinates, then set radius in km.
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="Radius km"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            value={radiusDraft}
            onChangeText={setRadiusDraft}
          />
          {query.filters.place ? (
            <Pressable style={styles.smallBtn} onPress={clearPlaceFilter}>
              <Text style={styles.smallBtnText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.chipRow}>
          {RADIUS_PRESETS_KM.map((km) => (
            <Chip
              key={km}
              label={`${km} km`}
              selected={
                query.filters.place != null &&
                query.filters.place.radiusKm === km
              }
              onPress={() => applyRadiusPreset(km)}
            />
          ))}
        </View>
        {query.filters.place ? (
          <Text style={styles.meta}>
            Active: {query.filters.place.latitude.toFixed(4)},{' '}
            {query.filters.place.longitude.toFixed(4)} ±{' '}
            {query.filters.place.radiusKm} km
          </Text>
        ) : (
          <Text style={styles.meta}>No place filter (all locations).</Text>
        )}
        {placed.length === 0 ? (
          <Text style={styles.muted}>No observations with coordinates yet.</Text>
        ) : (
          placed.slice(0, 8).map((obs) => (
            <Pressable
              key={obs.id}
              style={styles.placeRow}
              onPress={() => setPlaceCenter(obs)}
            >
              <Text style={styles.placeTitle}>
                {obs.placeLabel ?? 'Untitled spot'}
              </Text>
              <Text style={styles.placeMeta}>
                {obs.latitude!.toFixed(4)}, {obs.longitude!.toFixed(4)}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.heading}>Tags</Text>
        <Text style={styles.body}>
          Observation must include every selected tag (AND).
        </Text>
        <View style={styles.chipRow}>
          {allTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              selected={query.filters.tags.includes(tag)}
              onPress={() => toggleTag(tag)}
            />
          ))}
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="Add tag filter"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            value={tagDraft}
            onChangeText={setTagDraft}
            onSubmitEditing={addTagDraft}
          />
          <Pressable style={styles.smallBtn} onPress={addTagDraft}>
            <Text style={styles.smallBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.heading}>Outcome rating</Text>
        <Text style={styles.body}>
          Keep observations rated at least this high (1–5). Plot Outcome rating as
          a series above to correlate against weather signals.
        </Text>
        <View style={styles.chipRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Chip
              key={value}
              label={`≥ ${value}`}
              selected={query.filters.minRating === value}
              onPress={() => {
                setActivePresetId(null);
                setQuery((prev) => ({
                  ...prev,
                  filters: {
                    ...prev.filters,
                    minRating:
                      prev.filters.minRating === value ? null : value,
                  },
                }));
              }}
            />
          ))}
        </View>
        {query.filters.minRating != null ? (
          <Text style={styles.meta}>
            Active: rating ≥ {query.filters.minRating}
          </Text>
        ) : (
          <Text style={styles.meta}>No rating floor (all outcomes).</Text>
        )}
        <Pressable onPress={resetFilters}>
          <Text style={styles.link}>Clear place, tags, rating, and dates</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.heading}>Presets</Text>
        <Text style={styles.body}>Built-in packs and your saved trend views.</Text>
        {BUILTIN_TREND_PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            style={[
              styles.presetRow,
              activePresetId === preset.id && styles.presetActive,
            ]}
            onPress={() => applyBuiltin(preset.id)}
          >
            <Text style={styles.presetName}>{preset.name}</Text>
            <Text style={styles.presetDesc}>{preset.description}</Text>
          </Pressable>
        ))}
        {savedViews.map((view) => (
          <View
            key={view.id}
            style={[
              styles.presetRow,
              activePresetId === view.id && styles.presetActive,
            ]}
          >
            <Pressable style={styles.flex} onPress={() => applySaved(view)}>
              <Text style={styles.presetName}>{view.name}</Text>
              <Text style={styles.presetDesc}>
                {trendViewToQuery(view).signalKeys.join(', ') || 'No keys'}
              </Text>
            </Pressable>
            <Pressable onPress={() => removeSaved(view.id)}>
              <Text style={styles.delete}>Delete</Text>
            </Pressable>
          </View>
        ))}
        <TextInput
          style={styles.input}
          placeholder="New preset name"
          placeholderTextColor={colors.muted}
          value={presetName}
          onChangeText={setPresetName}
        />
        <PrimaryButton label="Save current as preset" onPress={savePreset} />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}
    </Screen>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
  },
  muted: {
    fontSize: 13,
    color: colors.muted,
  },
  warn: {
    fontSize: 13,
    color: colors.danger,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  status: {
    fontSize: 14,
    color: colors.accent,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    color: colors.ink,
  },
  chipTextSelected: {
    fontWeight: '600',
    color: colors.accent,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  smallBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  smallBtnText: {
    color: colors.onAccent,
    fontWeight: '600',
    fontSize: 14,
  },
  placeRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  placeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  placeMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  presetActive: {
    backgroundColor: colors.accentSoft,
  },
  presetName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  presetDesc: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  delete: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    padding: 6,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
