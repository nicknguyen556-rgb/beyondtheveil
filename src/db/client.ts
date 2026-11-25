import * as SQLite from 'expo-sqlite';

import { CREATE_TABLES_SQL, MIGRATIONS, SCHEMA_VERSION } from './schema';

const DATABASE_NAME = 'geocatch.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function columnExists(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_TABLES_SQL);

  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = ?`,
    ['schema_version'],
  );

  let current = row ? Number(row.value) : 0;

  // Fresh installs create v2 tables via CREATE_TABLES_SQL — stamp current.
  if (current === 0) {
    const hasPlaceSource = await columnExists(db, 'observations', 'place_source');
    current = hasPlaceSource ? SCHEMA_VERSION : 1;
  }

  for (let next = current + 1; next <= SCHEMA_VERSION; next += 1) {
    const statements = MIGRATIONS[next] ?? [];
    for (const sql of statements) {
      try {
        await db.execAsync(sql);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Ignore duplicate-column races when CREATE already included the fields.
        if (!/duplicate column/i.test(message)) throw err;
      }
    }
  }

  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ['schema_version', String(SCHEMA_VERSION)],
  );
}

/** Opens (or reuses) the on-device SQLite database and applies migrations. */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

/** Test / reset helper — closes and clears the cached connection. */
export async function resetDatabaseConnection(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
}
