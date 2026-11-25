import { Stack } from 'expo-router';

import { colors } from '@/theme/colors';

export default function ObservationLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.accent,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Observation' }} />
      <Stack.Screen name="pin" options={{ title: 'Map pin' }} />
    </Stack>
  );
}
