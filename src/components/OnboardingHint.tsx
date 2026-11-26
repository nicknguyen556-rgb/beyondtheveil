import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accent,
    paddingTop: 2,
  },
  body: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
});
