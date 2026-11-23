import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from './config';

let client: SupabaseClient | null = null;
let clientFailed = false;

/**
 * Lazy singleton. Returns null when env placeholders are unset/invalid so
 * free/local users never hit the network for auth or sync.
 */
export function getSupabase(): SupabaseClient | null {
  if (clientFailed) return null;
  if (client) return client;

  const config = getSupabaseConfig();
  if (!config) {
    clientFailed = true;
    return null;
  }

  client = createClient(config.url, config.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Test helper — drop the cached client (e.g. after env changes). */
export function resetSupabaseClient(): void {
  client = null;
  clientFailed = false;
}
