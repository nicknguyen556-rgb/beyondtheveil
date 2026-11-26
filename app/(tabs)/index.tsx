import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PhotoPermissionError, pickPhoto } from '@/capture/pickPhoto';
import { ingestPhotoAsset } from '@/capture/persistPhoto';
import { formatCoords, formatSourceLabel } from '@/capture/format';
import { OnboardingHint } from '@/components/OnboardingHint';
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
  const [permissionDenied, setPermissionDenied] = useState(false);

  async function ingest(source: 'camera' | 'gallery') {
    if (!db || busy) return;
    setBusy(true);
    setMessage(null);
    setPermissionDenied(false);
    try {
      const asset = await pickPhoto(source);
      if (!asset) {
        setMessage('Cancelled — nothing saved.');
        return;
      }

      const result = await ingestPhotoAsset(db, asset);
      const { observation, placeSource, timeSource } = result;
      setMessage(
        [
          'Saved on this device.',
          formatSourceLabel('place', placeSource),
          formatCoords(observation.latitude, observation.longitude),
          formatSourceLabel('time', timeSource),
        ].join(' · '),
      );
      router.push(`/observation/${observation.id}`);
    } catch (err) {
      if (err instanceof PhotoPermissionError) {
        setPermissionDenied(true);
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
      subtitle="Photograph a moment, pin place & time, then enrich — your first entry starts the journal."
    >
      <OnboardingHint label="Start here">
        Take or import one photo. We read place and time from the image when we can;
        otherwise device GPS or a map pin. Enrichment and trends unlock after that.
      </OnboardingHint>

      <View style={styles.panel}>
        <Text style={styles.stepLabel}>1 · Photo</Text>
        <Text style={styles.body}>
          Camera for a fresh shot, or gallery for something already on your phone.
          Place and time stick to the observation so weather and charts stay honest.
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
        {message ? (
          <Text style={[styles.hint, permissionDenied && styles.hintWarn]}>
            {message}
          </Text>
        ) : null}
        {permissionDenied ? (
          <Text style={styles.permissionWhy}>
            Photos stay on this device until you opt into premium sync.
          </Text>
        ) : null}
      </View>

      <View style={styles.pipeline}>
        <Text style={styles.pipelineHeading}>What happens next</Text>
        {[
          { step: 'Photo', detail: 'Capture or import' },
          { step: 'Place / time', detail: 'EXIF → GPS → map pin' },
          { step: 'Enrichment', detail: 'Weather & solar context' },
          { step: 'Trends', detail: 'Graphs from your log' },
        ].map((item, index) => (
          <View
            key={item.step}
            style={[styles.pipelineStep, index === 0 && styles.pipelineActive]}
          >
            <Text
              style={[styles.pipelineIndex, index === 0 && styles.pipelineIndexActive]}
            >
              {index + 1}
            </Text>
            <View style={styles.pipelineCopy}>
              <Text
                style={[styles.pipelineText, index === 0 && styles.pipelineTextActive]}
              >
                {item.step}
              </Text>
              <Text style={styles.pipelineDetail}>{item.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
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
  hintWarn: {
    color: colors.danger,
  },
  permissionWhy: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.trail,
  },
  pipeline: {
    gap: 8,
  },
  pipelineHeading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.trail,
    marginBottom: 2,
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
    backgroundColor: colors.white,
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
  pipelineCopy: {
    flex: 1,
    gap: 1,
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
  pipelineDetail: {
    fontSize: 12,
    color: colors.muted,
  },
});
