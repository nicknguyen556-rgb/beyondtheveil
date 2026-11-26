import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
  canSync,
  getLocalEntitlement,
  setLocalEntitlement,
} from './entitlement';
import { formatMergeLine, getLastSyncAt, runCloudSync } from './engine';
import { buildSyncStatus } from './status';
import { getSupabase } from './supabase';
import type { SyncStatus, SyncSummary } from './types';

interface SyncContextValue {
  configured: boolean;
  user: User | null;
  entitlement: Entitlement;
  lastSyncAt: string | null;
  lastSummary: SyncSummary | null;
  syncStatus: SyncStatus;
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

const DEFAULT_STATUS: SyncStatus = {
  kind: 'local_only',
  message: 'Local-only — changes stay on this device.',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
  offline: false,
};

const SyncContext = createContext<SyncContextValue | null>(null);

/** Minimum gap between automatic retries (foreground / reconnect). */
const AUTO_SYNC_COOLDOWN_MS = 8_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { db, status } = useDatabase();
  const [user, setUser] = useState<User | null>(null);
  const [entitlement, setEntitlementState] = useState<Entitlement>('free');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_STATUS);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const busyRef = useRef(false);
  const lastAutoSyncAtRef = useRef(0);
  const userRef = useRef<User | null>(null);
  const entitlementRef = useRef<Entitlement>('free');

  const configured = isSupabaseConfigured();

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    entitlementRef.current = entitlement;
  }, [entitlement]);

  const refreshStatus = useCallback(
    async (syncing = false) => {
      if (!db || status !== 'ready') return;
      const next = await buildSyncStatus(db, {
        entitlement: entitlementRef.current,
        signedIn: Boolean(userRef.current),
        syncing,
      });
      setSyncStatus(next);
      setLastSyncAt(next.lastSyncAt);
    },
    [db, status],
  );

  const refresh = useCallback(async () => {
    if (!db || status !== 'ready') return;
    const [nextUser, nextEntitlement, nextLastSync] = await Promise.all([
      getCurrentUser(),
      getLocalEntitlement(db),
      getLastSyncAt(db),
    ]);
    setUser(nextUser);
    userRef.current = nextUser;
    setEntitlementState(nextEntitlement);
    entitlementRef.current = nextEntitlement;
    setLastSyncAt(nextLastSync);
    const nextStatus = await buildSyncStatus(db, {
      entitlement: nextEntitlement,
      signedIn: Boolean(nextUser),
      syncing: busyRef.current,
    });
    setSyncStatus(nextStatus);
  }, [db, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      userRef.current = session?.user ?? null;
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const syncNow = useCallback(async () => {
    if (!db) return null;
    setBusy(true);
    busyRef.current = true;
    setAuthError(null);
    await refreshStatus(true);
    try {
      const summary = await runCloudSync(db);
      setLastSummary(summary);
      setLastSyncAt(await getLastSyncAt(db));
      await refreshStatus(false);
      return summary;
    } finally {
      setBusy(false);
      busyRef.current = false;
      await refreshStatus(false);
    }
  }, [db, refreshStatus]);

  const maybeAutoSync = useCallback(
    async (reason: 'foreground' | 'reconnect') => {
      if (!db || status !== 'ready') return;
      if (busyRef.current) return;
      if (!isSupabaseConfigured()) return;
      if (!canSync(entitlementRef.current)) return;
      if (!userRef.current) return;

      const now = Date.now();
      if (now - lastAutoSyncAtRef.current < AUTO_SYNC_COOLDOWN_MS) return;
      lastAutoSyncAtRef.current = now;

      // Only auto-flush when there is something to do or we were offline.
      const snapshot = await buildSyncStatus(db, {
        entitlement: entitlementRef.current,
        signedIn: true,
        syncing: false,
      });
      if (
        snapshot.pendingCount <= 0 &&
        !snapshot.offline &&
        reason === 'foreground'
      ) {
        await refreshStatus(false);
        return;
      }

      await syncNow();
    },
    [db, status, syncNow, refreshStatus],
  );

  // Retry when the app returns to the foreground.
  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        void maybeAutoSync('foreground');
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [maybeAutoSync]);

  // Retry when connectivity returns.
  useEffect(() => {
    let wasOffline = false;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online =
        state.isConnected === true && state.isInternetReachable !== false;
      if (!online) {
        wasOffline = true;
        return;
      }
      if (wasOffline) {
        wasOffline = false;
        void maybeAutoSync('reconnect');
      }
    });
    return () => unsubscribe();
  }, [maybeAutoSync]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setAuthError(null);
      let ok = false;
      try {
        const result = await signInWithEmail(email, password);
        if (!result.ok) {
          setAuthError(result.error);
          return false;
        }
        setUser(result.user);
        userRef.current = result.user;
        await refresh();
        ok = true;
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
      // Flush queued premium changes after auth settles (outside busy lock).
      if (ok && canSync(entitlementRef.current)) {
        void syncNow();
      }
      return ok;
    },
    [refresh, syncNow],
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
        userRef.current = result.user;
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
      userRef.current = null;
      await refreshStatus(false);
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const setEntitlement = useCallback(
    async (next: Entitlement) => {
      if (!db) return;
      await setLocalEntitlement(db, next);
      setEntitlementState(next);
      entitlementRef.current = next;
      await refreshStatus(false);
      if (canSync(next) && userRef.current) {
        void syncNow();
      }
    },
    [db, refreshStatus, syncNow],
  );

  const value = useMemo<SyncContextValue>(
    () => ({
      configured,
      user,
      entitlement,
      lastSyncAt,
      lastSummary,
      syncStatus,
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
      syncStatus,
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
