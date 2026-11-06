import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useDatabase } from '@/db/DatabaseProvider';
import { createObservation } from '@/db/observations';
import { colors } from '@/theme/colors';

/**
 * Capture stage of the core loop.
 * Photo ingest + EXIF land in GD-4; this shell creates a local observation draft.
 */
export default function CaptureScreen() {
  const router = useRouter();
  const { db } = useDatabase();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function startObservation() {
    if (!db || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const observation = await createObservation(db, {
        placeLabel: 'Untitled spot',
      });
      setMessage('Draft observation saved locally.');
      router.push(`/observation/${observation.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create observation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Capture"
      subtitle="Photo → place & time → enrichment. Start a local observation draft."
    >
      <View style={styles.panel}>
        <Text style={styles.stepLabel}>1 · Photo</Text>
        <Text style={styles.body}>
          Camera and gallery import come next. For now, create a draft observation
          so place/time and enrichment screens can be wired against the SQLite store.
        </Text>
        <PrimaryButton
          label={busy ? 'Creating…' : 'New observation draft'}
          onPress={startObservation}
          disabled={!db || busy}
        />
        {message ? <Text style={styles.hint}>{message}</Text> : null}
      </View>

      <View style={styles.pipeline}>
        {['Photo', 'Place / time', 'Enrichment', 'Trends'].map((step, index) => (
          <View key={step} style={[styles.pipelineStep, index === 0 && styles.pipelineActive]}>
            <Text style={[styles.pipelineIndex, index === 0 && styles.pipelineIndexActive]}>
              {index + 1}
            </Text>
            <Text style={[styles.pipelineText, index === 0 && styles.pipelineTextActive]}>
              {step}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
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
  hint: {
    fontSize: 13,
    color: colors.muted,
  },
  pipeline: {
    gap: 8,
  },
  pipelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pipelineActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  pipelineIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 28,
    backgroundColor: colors.surface,
    color: colors.muted,
    fontWeight: '700',
    overflow: 'hidden',
  },
  pipelineIndexActive: {
    backgroundColor: colors.accent,
    color: colors.white,
  },
  pipelineText: {
    fontSize: 15,
    color: colors.muted,
    fontWeight: '500',
  },
  pipelineTextActive: {
    color: colors.ink,
    fontWeight: '700',
  },
});
