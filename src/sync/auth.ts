import type { Session, User } from '@supabase/supabase-js';

import { isSupabaseConfigured } from './config';
import { getSupabase } from './supabase';

export type AuthResult =
  | { ok: true; user: User; session: Session }
  | { ok: false; error: string };

export function authUnavailableReason(): string | null {
  if (!isSupabaseConfigured()) {
    return 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example).';
  }
  if (!getSupabase()) {
    return 'Supabase client failed to initialize.';
  }
  return null;
}

export async function getSession(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  const blocked = authUnavailableReason();
  if (blocked) return { ok: false, error: blocked };

  const supabase = getSupabase()!;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user || !data.session) {
      return { ok: false, error: error?.message ?? 'Sign-in failed' };
    }
    return { ok: true, user: data.user, session: data.session };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Sign-in failed (offline?)',
    };
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  const blocked = authUnavailableReason();
  if (blocked) return { ok: false, error: blocked };

  const supabase = getSupabase()!;
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      return { ok: false, error: error?.message ?? 'Sign-up failed' };
    }
    if (!data.session) {
      return {
        ok: false,
        error:
          'Account created — confirm your email if required, then sign in.',
      };
    }
    return { ok: true, user: data.user, session: data.session };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Sign-up failed (offline?)',
    };
  }
}

export async function signOut(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: true };
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Sign-out failed',
    };
  }
}
