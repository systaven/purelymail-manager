import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config';

// Schema changes are appended here and applied in order; PRAGMA user_version
// records how many have run.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE users (
    clerk_user_id TEXT PRIMARY KEY,
    email TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('guest', 'admin')),
    disabled INTEGER NOT NULL DEFAULT 0,
    max_mailboxes INTEGER,
    requires_approval INTEGER,
    allowed_domains TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT,
    last_seen_at TEXT
  );
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    details TEXT
  );
  `,
];

export type DB = Database.Database;

let db: DB | undefined;

export function getDb(): DB {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new Database(path.join(config.dataDir, 'manager.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(database: DB) {
  const current = database.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    database.transaction(() => {
      database.exec(MIGRATIONS[i]);
      database.pragma(`user_version = ${i + 1}`);
    })();
  }
}

export function audit(actor: string, action: string, target?: string, details?: unknown) {
  getDb()
    .prepare('INSERT INTO audit_log (actor, action, target, details) VALUES (?, ?, ?, ?)')
    .run(actor, action, target ?? null, details === undefined ? null : JSON.stringify(details));
}
