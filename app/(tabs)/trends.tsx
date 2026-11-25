import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors } from '@/theme/colors';

/**
 * Trends stage — charts land in GD-7.
 * Shell documents the free-tier success metric: reliable graphs over local signals.
 */
export default function TrendsScreen() {
  return (
    <Screen
      title="Trends"
      subtitle="Multi-series graphs over place, time, and outcomes — foundation only."
    >
      <View style={styles.panel}>
        <Text style={styles.heading}>Coming in the trends phase</Text>
        <Text style={styles.body}>
          Charts will read from local observations and signals. Filters by date
          range and place radius, plus saved presets, ship before premium AI.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.heading}>Data ready for later</Text>
        <Text style={styles.bullet}>• observations — photo, lat/lon, time, tags, outcomes</Text>
        <Text style={styles.bullet}>• signals — weather, solar, and custom keys</Text>
        <Text style={styles.bullet}>• trend_views — saved chart presets (schema reserved)</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
  },
});
