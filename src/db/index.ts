import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { householdTimezoneOrDefault, localDate } from "../period.js";

export type Db = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

/**
 * Open a sqlite database and return a Drizzle handle. Pass ":memory:" for
 * tests. Foreign keys are enforced and WAL is enabled for the on-disk case.
 */
export function openDb(dbPath: string): Db {
  // Ensure the parent directory exists so a configured path like
  // ./data/budget.sqlite works on a fresh checkout (better-sqlite3 will not
  // create missing directories).
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  // Keep registered: migration 0009 calls local_date() and replays on every
  // fresh database. SQLite has no time zone support.
  sqlite.function("local_date", { deterministic: true }, (iso, timeZone) => {
    const zone = householdTimezoneOrDefault(timeZone == null ? undefined : String(timeZone));
    return localDate(new Date(String(iso)), zone);
  });
  if (dbPath !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  const db = drizzle(sqlite, { schema }) as Db;
  db.$client = sqlite;
  return db;
}

/** Apply all pending Drizzle migrations. Idempotent; safe to run on startup. */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder });
}

/** Open a database and bring it up to the latest schema in one call. */
export function openAndMigrate(dbPath: string): Db {
  const db = openDb(dbPath);
  runMigrations(db);
  return db;
}
