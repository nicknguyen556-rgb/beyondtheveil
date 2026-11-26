import { ReactNode, useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { colors } from '@/theme/colors';
import { space } from '@/theme/spacing';
import { typography } from '@/theme/typography';

interface ScreenProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
  /** Hero-level brand on entry surfaces (Capture / first-run). */
  brandHero?: boolean;
}

export function Screen({
  title,
  subtitle,
  children,
  scroll = true,
  brandHero = false,
}: ScreenProps) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: brandHero ? 700 : 420,
      useNativeDriver: true,
    }).start();
  }, [fade, brandHero]);

  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Atmosphere style={styles.atmosphere}>
        <Animated.View style={[styles.header, { opacity: fade }]}>
          {brandHero ? (
            <>
              <Text style={styles.brandHero}>Beyond the Veil</Text>
              <Text style={styles.productMark}>Geocatch datalink</Text>
              <Text style={styles.heroTitle}>{title}</Text>
            </>
          ) : (
            <>
              <Text style={styles.brandMark}>Beyond the Veil</Text>
              <Text style={styles.title}>{title}</Text>
            </>
          )}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </Animated.View>
        {body}
      </Atmosphere>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  atmosphere: {
    flex: 1,
  },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  brandMark: {
    ...typography.brandMark,
    color: colors.accent,
    marginBottom: 6,
  },
  brandHero: {
    ...typography.brand,
    color: colors.ink,
    marginBottom: 4,
  },
  productMark: {
    ...typography.brandMark,
    color: colors.trail,
    marginBottom: space.sm,
  },
  title: {
    ...typography.title,
    color: colors.ink,
  },
  heroTitle: {
    ...typography.headline,
    color: colors.ink,
  },
  subtitle: {
    marginTop: 8,
    ...typography.body,
    color: colors.muted,
  },
  scroll: {
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  fill: {
    flex: 1,
    padding: space.lg,
  },
});
