import { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/theme/colors';

interface AtmosphereProps {
  children?: ReactNode;
  style?: ViewStyle;
  /** Softer wash for nested panels; full for screen backgrounds. */
  intensity?: 'full' | 'soft';
}

/**
 * Quiet layered dusk wash — stand-in for a gradient without extra deps.
 * Keeps the field/night journal atmosphere off flat single-color fills.
 */
export function Atmosphere({ children, style, intensity = 'full' }: AtmosphereProps) {
  const soft = intensity === 'soft';
  return (
    <View style={[styles.root, style]}>
      <View pointerEvents="none" style={[styles.base, soft && styles.baseSoft]} />
      <View pointerEvents="none" style={[styles.horizon, soft && styles.horizonSoft]} />
      <View pointerEvents="none" style={[styles.mist, soft && styles.mistSoft]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  base: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
  },
  baseSoft: {
    backgroundColor: colors.dawn,
  },
  horizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: colors.horizon,
    opacity: 0.22,
  },
  horizonSoft: {
    height: '55%',
    opacity: 0.14,
  },
  mist: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.accent,
    opacity: 0.07,
  },
  mistSoft: {
    opacity: 0.05,
    width: 160,
    height: 160,
  },
});
