/**
 * Light outcome logging: rate what happened, add notes, tag for trend filters.
 */

import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  parseObservationTags,
  updateObservationOutcome,
} from '@/db/observations';
import { colors } from '@/theme/colors';
import type { Observation } from '@/types/models';

import { PrimaryButton } from './PrimaryButton';

const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

interface OutcomePanelProps {
  db: SQLiteDatabase;
  observation: Observation;
  onChanged: () => Promise<void> | void;
  onMessage?: (message: string | null) => void;
  disabled?: boolean;
}

export function OutcomePanel({
  db,
  observation,
  onChanged,
  onMessage,
  disabled,
}: OutcomePanelProps) {
  const [rating, setRating] = useState<number | null>(observation.outcomeRating);
  const [notes, setNotes] = useState(observation.outcomeNotes ?? '');
  const [tags, setTags] = useState<string[]>(() =>
    parseObservationTags(observation.tagsJson),
  );
  const [tagDraft, setTagDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRating(observation.outcomeRating);
    setNotes(observation.outcomeNotes ?? '');
    setTags(parseObservationTags(observation.tagsJson));
  }, [
    observation.id,
    observation.outcomeRating,
    observation.outcomeNotes,
    observation.tagsJson,
  ]);

  function addTag() {
    const next = tagDraft.trim().toLowerCase();
    if (!next) return;
    setTags((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setTagDraft('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function save() {
    if (busy || disabled) return;
    setBusy(true);
    onMessage?.(null);
    try {
      await updateObservationOutcome(db, observation.id, {
        outcomeRating: rating,
        outcomeNotes: notes,
        tags,
      });
      await onChanged();
      onMessage?.('Outcome saved locally.');
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : 'Could not save outcome');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.stepLabel}>4 · Outcome</Text>
      <Text style={styles.body}>
        Light rating, notes, and tags so trends can filter and plot what lined up
        with good (or rough) days.
      </Text>

      <Text style={styles.label}>Rating (1–5)</Text>
      <View style={styles.chipRow}>
        {RATING_OPTIONS.map((value) => {
          const selected = rating === value;
          return (
            <Pressable
              key={value}
              disabled={disabled || busy}
              onPress={() => setRating(selected ? null : value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {value}
              </Text>
            </Pressable>
          );
        })}
        {rating != null ? (
          <Pressable
            disabled={disabled || busy}
            onPress={() => setRating(null)}
            style={styles.clearChip}
          >
            <Text style={styles.clearChipText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.label}>Notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="What worked, what didn’t…"
        placeholderTextColor={colors.muted}
        style={[styles.input, styles.notes]}
        multiline
        editable={!disabled && !busy}
      />

      <Text style={styles.label}>Tags</Text>
      <Text style={styles.hint}>
        Used in Trends filters (AND). Examples: dawn, shoreline, windy.
      </Text>
      <View style={styles.chipRow}>
        {tags.map((tag) => (
          <Pressable
            key={tag}
            disabled={disabled || busy}
            onPress={() => removeTag(tag)}
            style={[styles.chip, styles.chipSelected]}
          >
            <Text style={[styles.chipText, styles.chipTextSelected]}>
              {tag} ×
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="Add tag"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          value={tagDraft}
          onChangeText={setTagDraft}
          onSubmitEditing={addTag}
          editable={!disabled && !busy}
        />
        <Pressable
          style={styles.smallBtn}
          onPress={addTag}
          disabled={disabled || busy || !tagDraft.trim()}
        >
          <Text style={styles.smallBtnText}>Add</Text>
        </Pressable>
      </View>

      <PrimaryButton
        label={busy ? 'Saving…' : 'Save outcome'}
        onPress={save}
        disabled={disabled || busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  notes: {
    minHeight: 72,
    textAlignVertical: 'top',
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '500',
  },
  chipTextSelected: {
    fontWeight: '700',
    color: colors.accent,
  },
  clearChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  clearChipText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
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
});
