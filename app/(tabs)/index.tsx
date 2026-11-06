import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PhotoPermissionError, pickPhoto } from '@/capture/pickPhoto';
import { ingestPhotoAsset } from '@/capture/persistPhoto';
import { formatCoords, formatSourceLabel } from '@/capture/format';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useDatabase } from '@/db/DatabaseProvider';
import { colors } from '@/theme/colors';

/**
 * Capture stage: camera or gallery → EXIF place/time (with GPS/manual fallbacks) → SQLite.
 */
export default function CaptureScreen() {
  const router = useRouter();
  const { db } = useDatabase();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function ingest(source: 'camera' | 'gallery') {
    if (!db || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const asset = await pickPhoto(source);
      if (!asset) {
        setMessage('Cancelled.');
        return;
      }

      const result = await ingestPhotoAsset(db, asset);
      const { observation, placeSource, timeSource } = result;
      setMessage(
        [
          'Saved locally.',
          formatSourceLabel('place', placeSource),
          formatCoords(observation.latitude, observation.longitude),
          formatSourceLabel('time', timeSource),
        ].join(' · '),
      );
      router.push(`/observation/${observation.id}`);
    } catch (err) {
      if (err instanceof PhotoPermissionError) {
        setMessage(err.message);
      } else {
        setMessage(err instanceof Error ? err.message : 'Could not ingest photo');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Capture"
      subtitle="Photo → place & time → enrichment. EXIF first; GPS and manual pin as fallbacks."
    >
      <View style={styles.panel}>
        <Text style={styles.stepLabel}>1 · Photo</Text>
        <Text style={styles.body}>
          Take a photo or import from your library. We read EXIF GPS and datetime when
          present, otherwise fall back to device GPS (and you can set a map pin or time
          on the observation).
        </Text>
        <PrimaryButton
          label={busy ? 'Working…' : 'Take photo'}
          onPress={() => ingest('camera')}
          disabled={!db || busy}
        />
        <PrimaryButton
          label={busy ? 'Working…' : 'Import from gallery'}
          onPress={() => ingest('gallery')}
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
    lineHeight: 18,
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
