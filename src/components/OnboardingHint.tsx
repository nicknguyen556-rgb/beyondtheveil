import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { radius, space } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface OnboardingHintProps {
  label?: string;
  children: string;
}

/** Compact tip strip for first-run guidance without dominating the screen. */
export function OnboardingHint({
  label = 'Tip',
  children,
}: OnboardingHintProps) {
  return (
    <View style={styles.root} accessibilityRole="text">
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.horizon,
    paddingVertical: space.sm,
    paddingHorizontal: 14,
  },
  label: {
    ...typography.section,
    fontSize: 11,
    color: colors.accent,
    paddingTop: 2,
  },
  body: {
    flex: 1,
    ...typography.caption,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
});
