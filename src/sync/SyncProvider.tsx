import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';

import { useDatabase } from '@/db/DatabaseProvider';
import type { Entitlement } from '@/types/models';

import {
  getCurrentUser,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from './auth';
import { isSupabaseConfigured } from './config';
import {
  getLocalEntitlement,
  setLocalEntitlement,
} from './entitlement';
import { formatMergeLine, getLastSyncAt, runCloudSync } from './engine';
import { getSupabase } from './supabase';
import type { SyncSummary } from './types';

interface SyncContextValue {
  configured: boolean;
  user: User | null;
  entitlement: Entitlement;
  lastSyncAt: string | null;
  lastSummary: SyncSummary | null;
  busy: boolean;
  authError: string | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
  setEntitlement: (next: Entitlement) => Promise<void>;
  syncNow: () => Promise<SyncSummary | null>;
  formatMergeLine: typeof formatMergeLine;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { db, status } = useDatabase();
  const [user, setUser] = useState<User | null>(null);
  const [entitlement, setEntitlementState] = useState<Entitlement>('free');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  const refresh = useCallback(async () => {
    if (!db || status !== 'ready') return;
    const [nextUser, nextEntitlement, nextLastSync] = await Promise.all([
      getCurrentUser(),
      getLocalEntitlement(db),
      getLastSyncAt(db),
    ]);
    setUser(nextUser);
    setEntitlementState(nextEntitlement);
    setLastSyncAt(nextLastSync);
  }, [db, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setAuthError(null);
      try {
        const result = await signInWithEmail(email, password);
        if (!result.ok) {
          setAuthError(result.error);
          return false;
        }
        setUser(result.user);
        await refresh();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setAuthError(null);
      try {
        const result = await signUpWithEmail(email, password);
        if (!result.ok) {
          setAuthError(result.error);
          return false;
        }
        setUser(result.user);
        await refresh();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const signOutUser = useCallback(async () => {
    setBusy(true);
    setAuthError(null);
    try {
      const result = await signOut();
      if (!result.ok) setAuthError(result.error);
      setUser(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const setEntitlement = useCallback(
    async (next: Entitlement) => {
      if (!db) return;
      await setLocalEntitlement(db, next);
      setEntitlementState(next);
    },
    [db],
  );

  const syncNow = useCallback(async () => {
    if (!db) return null;
    setBusy(true);
    setAuthError(null);
    try {
      const summary = await runCloudSync(db);
      setLastSummary(summary);
      setLastSyncAt(await getLastSyncAt(db));
      return summary;
    } finally {
      setBusy(false);
    }
  }, [db]);

  const value = useMemo<SyncContextValue>(
    () => ({
      configured,
      user,
      entitlement,
      lastSyncAt,
      lastSummary,
      busy,
      authError,
      refresh,
      signIn,
      signUp,
      signOutUser,
      setEntitlement,
      syncNow,
      formatMergeLine,
    }),
    [
      configured,
      user,
      entitlement,
      lastSyncAt,
      lastSummary,
      busy,
      authError,
      refresh,
      signIn,
      signUp,
      signOutUser,
      setEntitlement,
      syncNow,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync must be used within SyncProvider');
  }
  return ctx;
}
