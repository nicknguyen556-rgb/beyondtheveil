import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';

interface ScreenProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
}

export function Screen({ title, subtitle, children, scroll = true }: ScreenProps) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.brand}>Geocatch</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.dawn,
  },
  brand: {
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.accent,
    fontWeight: '800',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  fill: {
    flex: 1,
    padding: 20,
  },
});
