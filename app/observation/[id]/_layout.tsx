import { Stack } from 'expo-router';

import { colors } from '@/theme/colors';

export default function ObservationLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.dawn },
        headerTitleStyle: { color: colors.ink, fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Observation' }} />
      <Stack.Screen name="pin" options={{ title: 'Map pin' }} />
    </Stack>
  );
}
