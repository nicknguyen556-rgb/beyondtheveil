import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { PrimaryButton } from '@/components/PrimaryButton';
import {
  dismissSuggestion,
  listActiveSuggestions,
  replaceActiveSuggestions,
} from '@/db/suggestions';
import { listObservations } from '@/db/observations';
import { listSignalsForObservations } from '@/db/trends';
import { analyzeStoredObservations } from '@/suggestions/analyze';
import {
  parseJsonStringArray,
  parseSuggestionEvidence,
} from '@/suggestions/types';
import { canUseAiSuggestions } from '@/sync/entitlement';
import { colors } from '@/theme/colors';
import type { AiSuggestion, Entitlement } from '@/types/models';
import type { TrendQuery } from '@/trends/types';

interface AiSuggestionsPanelProps {
  db: SQLiteDatabase | null;
  entitlement: Entitlement;
  suggestions: AiSuggestion[];
  onSuggestionsChange: (next: AiSuggestion[]) => void;
  onApply: (patch: Pick<
    TrendQuery,
    'signalKeys' | 'dateRangeStart' | 'dateRangeEnd'
  >) => void;
  onStatus: (message: string) => void;
}

export function AiSuggestionsPanel({
  db,
  entitlement,
  suggestions,
  onSuggestionsChange,
  onApply,
  onStatus,
}: AiSuggestionsPanelProps) {
  const [busy, setBusy] = useState(false);
  const premium = canUseAiSuggestions(entitlement);

  const generate = useCallback(async () => {
    if (!db) return;
    if (!premium) {
      onStatus('Premium required for AI trend suggestions (same as cloud sync).');
      return;
    }
    setBusy(true);
    try {
      const observations = await listObservations(db);
      const signals = await listSignalsForObservations(
        db,
        observations.map((o) => o.id),
      );
      const drafts = analyzeStoredObservations({ observations, signals });
      if (drafts.length === 0) {
        await replaceActiveSuggestions(db, []);
        onSuggestionsChange([]);
        onStatus(
          observations.length < 3
            ? 'Need more stored observations (and ratings/signals) before patterns appear.'
            : 'No strong correlations or interesting periods in the current data.',
        );
        return;
      }
      const saved = await replaceActiveSuggestions(db, drafts);
      onSuggestionsChange(saved);
      onStatus(
        `Generated ${saved.length} suggestion${saved.length === 1 ? '' : 's'} from stored observations.`,
      );
    } catch (err) {
      onStatus(err instanceof Error ? err.message : 'Suggestion analysis failed');
    } finally {
      setBusy(false);
    }
  }, [db, premium, onSuggestionsChange, onStatus]);

  const onDismiss = useCallback(
    async (id: string) => {
      if (!db) return;
      try {
        await dismissSuggestion(db, id);
        const next = await listActiveSuggestions(db);
        onSuggestionsChange(next);
        onStatus('Suggestion dismissed');
      } catch (err) {
        onStatus(err instanceof Error ? err.message : 'Dismiss failed');
      }
    },
    [db, onSuggestionsChange, onStatus],
  );

  function applySuggestion(suggestion: AiSuggestion) {
    const signalKeys = parseJsonStringArray(suggestion.signalKeysJson);
    if (signalKeys.length === 0) {
      onStatus('Suggestion has no signal keys to plot.');
      return;
    }
    onApply({
      signalKeys,
      dateRangeStart: suggestion.dateRangeStart,
      dateRangeEnd: suggestion.dateRangeEnd,
    });
    onStatus(`Applied “${suggestion.title}” to the chart`);
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>AI suggestions</Text>
      <Text style={styles.body}>
        Premium analyzes your stored observations only — correlations and
        interesting periods with explainable signals and date windows. Nothing
        is invented; dismiss anything you do not want.
      </Text>

      {!premium ? (
        <Text style={styles.warn}>
          Enable premium on the Account tab (same entitlement as cloud sync) to
          generate suggestions.
        </Text>
      ) : (
        <PrimaryButton
          label={busy ? 'Analyzing…' : 'Generate from stored data'}
          onPress={() => void generate()}
          disabled={busy || !db}
        />
      )}

      {busy ? (
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      ) : null}

      {premium && suggestions.length === 0 && !busy ? (
        <Text style={styles.meta}>No active suggestions yet.</Text>
      ) : null}

      {suggestions.map((suggestion) => {
        const keys = parseJsonStringArray(suggestion.signalKeysJson);
        const obsIds = parseJsonStringArray(suggestion.observationIdsJson);
        const evidence = parseSuggestionEvidence(suggestion.evidenceJson);
        const windowLabel =
          suggestion.dateRangeStart || suggestion.dateRangeEnd
            ? `${(suggestion.dateRangeStart ?? '…').slice(0, 10)} → ${(suggestion.dateRangeEnd ?? '…').slice(0, 10)}`
            : 'All supporting captures';

        return (
          <View key={suggestion.id} style={styles.card}>
            <Text style={styles.kind}>
              {suggestion.kind === 'correlation'
                ? 'Correlation'
                : 'Interesting period'}
            </Text>
            <Text style={styles.cardTitle}>{suggestion.title}</Text>
            <Text style={styles.cardSummary}>{suggestion.summary}</Text>
            <Text style={styles.evidence}>
              Signals: {keys.join(', ') || '—'}
            </Text>
            <Text style={styles.evidence}>Window: {windowLabel}</Text>
            <Text style={styles.evidence}>
              n={evidence.sampleSize}
              {evidence.correlation != null
                ? ` · r=${evidence.correlation.toFixed(2)}`
                : ''}
              {evidence.outcomeMean != null
                ? ` · rating μ=${evidence.outcomeMean}`
                : ''}
              {evidence.signalMean != null
                ? ` · signal μ=${evidence.signalMean}`
                : ''}
              {' · '}
              {obsIds.length} observation{obsIds.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.method}>{evidence.method}</Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.applyBtn}
                onPress={() => applySuggestion(suggestion)}
              >
                <Text style={styles.applyText}>Apply to chart</Text>
              </Pressable>
              <Pressable onPress={() => void onDismiss(suggestion.id)}>
                <Text style={styles.dismiss}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Helper for Trends screen when applying a suggestion. */
export function suggestionQueryPatch(
  patch: Pick<TrendQuery, 'signalKeys' | 'dateRangeStart' | 'dateRangeEnd'>,
  prev: TrendQuery,
): TrendQuery {
  return {
    ...prev,
    signalKeys: patch.signalKeys,
    dateRangeStart: patch.dateRangeStart,
    dateRangeEnd: patch.dateRangeEnd,
    // Keep place/tag filters; clear σ so the suggestion series stay readable.
    filters: { ...prev.filters, showStdDev: false },
  };
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.white,
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
  warn: {
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
  spinner: {
    marginVertical: 8,
  },
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 6,
  },
  kind: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  cardSummary: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  evidence: {
    fontSize: 12,
    color: colors.muted,
  },
  method: {
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  applyBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  applyText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 13,
  },
  dismiss: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});
