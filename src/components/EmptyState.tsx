import { ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';
import { radius, space } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface EmptyStateProps {
  eyebrow?: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  footer?: ReactNode;
}

/** Shared first-run / empty log panel — quiet dusk journal tone, one CTA. */
export function EmptyState({
  eyebrow = 'Field journal',
  title,
  body,
  actionLabel,
  onAction,
  footer,
}: EmptyStateProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 520,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, rise]);

  return (
    <Animated.View
      style={[
        styles.root,
        { opacity: fade, transform: [{ translateY: rise }] },
      ]}
    >
      <View style={styles.accent} />
      <View style={styles.glyph}>
        <View style={styles.glyphRing} />
        <View style={styles.glyphDot} />
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} />
      ) : null}
      {footer}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 10,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.accent,
  },
  glyph: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  glyphRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.accent,
    opacity: 0.55,
  },
  glyphDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.trail,
  },
  eyebrow: {
    ...typography.section,
    color: colors.accent,
  },
  title: {
    ...typography.headline,
    color: colors.ink,
  },
  body: {
    ...typography.body,
    color: colors.muted,
  },
});
