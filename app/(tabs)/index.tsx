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
import { radius, space } from '@/theme/spacing';
import { typography } from '@/theme/typography';

/**
 * Capture stage: camera or gallery → EXIF place/time (with GPS/manual fallbacks) → SQLite.
 * Brand-forward entry — one composition, not a dashboard.
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
      brandHero
      title="Pin a moment"
      subtitle="Photograph a place. We read time and location, then weave weather and solar context into your field journal."
    >
      <OnboardingHint label="Start here">
        Take or import one photo. Place and time come from the image when we can;
        otherwise device GPS or a map pin. Rate the outcome later so trends stay honest.
      </OnboardingHint>

      <View style={styles.panel}>
        <Text style={styles.stepLabel}>Field capture</Text>
        <Text style={styles.body}>
          Camera for a fresh shot, or gallery for something already on your phone.
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
          variant="ghost"
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
        <Text style={styles.pipelineHeading}>The thread</Text>
        {[
          { step: 'Photo', detail: 'Capture or import' },
          { step: 'Place / time', detail: 'EXIF → GPS → map pin' },
          { step: 'Enrichment', detail: 'Weather & solar context' },
          { step: 'Outcome', detail: 'Rating, notes, tags' },
          { step: 'Trends', detail: 'Graphs vs outcomes' },
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
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  stepLabel: {
    ...typography.section,
    color: colors.accent,
  },
  body: {
    ...typography.body,
    color: colors.ink,
  },
  hint: {
    ...typography.caption,
    color: colors.muted,
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
    gap: space.xs,
  },
  pipelineHeading: {
    ...typography.section,
    color: colors.trail,
    marginBottom: 2,
  },
  pipelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pipelineActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.horizon,
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
    color: colors.onAccent,
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
