import Constants from 'expo-constants';

/**
 * Read Expo public env for Supabase. Placeholders / missing values are fine —
 * the app stays fully usable offline/local-only without secrets in the repo.
 */
function readExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra = extra?.[key];
  if (typeof fromExtra === 'string' && fromExtra.trim()) return fromExtra.trim();
  return undefined;
}

function readEnv(key: string): string | undefined {
  const fromProcess =
    typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (typeof fromProcess === 'string' && fromProcess.trim()) {
    return fromProcess.trim();
  }
  return readExtra(key);
}

const PLACEHOLDER_MARKERS = [
  'YOUR_PROJECT',
  'YOUR_SUPABASE',
  'YOUR_',
  'example.supabase',
];

function looksLikePlaceholder(value: string): boolean {
  const upper = value.toUpperCase();
  return PLACEHOLDER_MARKERS.some((marker) => upper.includes(marker.toUpperCase()));
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Returns config only when both URL and anon key look real (not placeholders). */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = readEnv('EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;
  if (looksLikePlaceholder(url) || looksLikePlaceholder(anonKey)) return null;
  if (!/^https:\/\//i.test(url)) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
