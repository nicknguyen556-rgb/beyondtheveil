import type { SQLiteDatabase } from 'expo-sqlite';

import type { Entitlement } from '@/types/models';

import { getSupabase } from './supabase';

const META_KEY = 'entitlement';

function parseEntitlement(value: string | null | undefined): Entitlement {
  return value === 'premium' ? 'premium' : 'free';
}

/** Local entitlement (source of truth while offline; free by default). */
export async function getLocalEntitlement(db: SQLiteDatabase): Promise<Entitlement> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = ?`,
    [META_KEY],
  );
  return parseEntitlement(row?.value);
}

/**
 * Set local entitlement. Used for the Account toggle until real IAP lands.
 * Free stays local-only; premium unlocks sync when signed in + configured.
 */
export async function setLocalEntitlement(
  db: SQLiteDatabase,
  entitlement: Entitlement,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [META_KEY, entitlement],
  );
}

/**
 * Prefer remote profile entitlement when online + signed in; fall back to local.
 * Does not overwrite local free → premium silently when remote fetch fails.
 */
export async function resolveEntitlement(
  db: SQLiteDatabase,
  userId: string | null,
): Promise<Entitlement> {
  const local = await getLocalEntitlement(db);
  if (!userId) return local;

  const supabase = getSupabase();
  if (!supabase) return local;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('entitlement')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return local;
    const remote = parseEntitlement(data.entitlement as string);
    if (remote !== local) {
      await setLocalEntitlement(db, remote);
    }
    return remote;
  } catch {
    return local;
  }
}

/** Sync is allowed only for premium users (auth checked separately). */
export function canSync(entitlement: Entitlement): boolean {
  return entitlement === 'premium';
}
