import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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
  // Mailboxes that belong to a member. They're private: admins can delete them
  // but not reset their password, change recovery or create app passwords.
  `
  CREATE TABLE mailbox_owners (
    mailbox TEXT PRIMARY KEY,
    clerk_user_id TEXT NOT NULL REFERENCES users (clerk_user_id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX mailbox_owners_user ON mailbox_owners (clerk_user_id);
  `,
  // Members asking for a mailbox when their account needs approval.
  `
  CREATE TABLE mailbox_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clerk_user_id TEXT NOT NULL REFERENCES users (clerk_user_id) ON DELETE CASCADE,
    mailbox TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT,
    decided_by TEXT
  );
  CREATE UNIQUE INDEX mailbox_requests_pending ON mailbox_requests (mailbox) WHERE status = 'pending';
  `,
  // Webmail. App passwords for mailboxes nobody owns (members' are kept only in
  // their browser), and mail waiting to be sent (undo send, scheduled send).
  `
  CREATE TABLE mailbox_credentials (
    mailbox TEXT PRIMARY KEY,
    encrypted_password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE outbox (
    id TEXT PRIMARY KEY,
    mailbox TEXT NOT NULL,
    clerk_user_id TEXT NOT NULL,
    -- Encrypted JSON: the raw message, envelope, a summary for the UI and the
    -- password to send it with. Deleted once sent.
    payload TEXT NOT NULL,
    send_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'failed')),
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX outbox_due ON outbox (status, send_at);
  `,
  // The mailboxes this panel shows: created or added here, or owned by a
  // member. Other mailboxes in the PurelyMail account are left alone.
  `
  CREATE TABLE managed_mailboxes (
    mailbox TEXT PRIMARY KEY,
    added_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO managed_mailboxes (mailbox, added_by)
    SELECT mailbox, 'migration' FROM mailbox_owners
    UNION SELECT mailbox, 'migration' FROM mailbox_credentials
    UNION SELECT target, 'migration' FROM audit_log WHERE action IN ('mailbox.create', 'mailbox.update', 'member.assign') AND target LIKE '%@%';
  `,
  // Whether a member may use mail apps (IMAP/SMTP) with their mailboxes;
  // NULL follows the default in member_defaults.
  `
  ALTER TABLE users ADD COLUMN mail_apps INTEGER;
  `,
];

// Node's built-in SQLite: no native module to compile, so the image builds
// quickly on any platform.
export type DB = DatabaseSync;

let db: DB | undefined;

export function getDb(): DB {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(config.dataDir, 'manager.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

// Runs `fn` in a transaction, rolling back if it throws.
export function transaction<T>(database: DB, fn: () => T): T {
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function migrate(database: DB) {
  const current = Number((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  for (let i = current; i < MIGRATIONS.length; i++) {
    transaction(database, () => {
      database.exec(MIGRATIONS[i]);
      database.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}

export function audit(actor: string, action: string, target?: string, details?: unknown) {
  getDb()
    .prepare('INSERT INTO audit_log (actor, action, target, details) VALUES (?, ?, ?, ?)')
    .run(actor, action, target ?? null, details === undefined ? null : JSON.stringify(details));
}
