import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from './client';

type DatabaseStatus = 'loading' | 'ready' | 'error';

interface DatabaseContextValue {
  db: SQLiteDatabase | null;
  status: DatabaseStatus;
  error: string | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  db: null,
  status: 'loading',
  error: null,
});

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [status, setStatus] = useState<DatabaseStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const database = await getDatabase();
        if (!cancelled) {
          setDb(database);
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to open local store');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ db, status, error }),
    [db, status, error],
  );

  return (
    <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>
  );
}

export function useDatabase(): DatabaseContextValue {
  return useContext(DatabaseContext);
}
