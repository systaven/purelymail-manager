import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Session } from '../auth';
import { config } from '../config';
import { getDb } from '../db';
import { ApiError } from '../errors';
import { ownerOf, ownersByMailbox } from '../owners';
import { purelymail } from '../purelymail';
import { decrypt, encrypt, hash } from '../secret';
import { email } from '../validate';

// Webmail signs in to IMAP/SMTP with a PurelyMail app password made for the
// panel. Where it is kept depends on who the mailbox belongs to:
// - nobody (the admins' mailboxes): encrypted in SQLite, shared by admins;
// - a member: only in that member's browser, in an encrypted HttpOnly cookie,
//   so neither admins nor the database can open their mail.

const APP_PASSWORD_NAME = 'Webmail (purelymail-manager)';
const COOKIE_PREFIX = 'pm_mbx_';
const COOKIE_DAYS = 30;

export interface MailboxAccess {
  address: string;
  private: boolean;
  password(): Promise<string>;
  // After a failed login: forget the password so the next call makes a new one.
  invalidate(): Promise<void>;
  // Deletes the app password in PurelyMail too ("sign out of this mailbox").
  revoke(): Promise<void>;
}

// Mailboxes the session may open in webmail.
export async function accessibleMailboxes(session: Session): Promise<string[]> {
  const owners = ownersByMailbox();
  const own = [...owners].filter(([, o]) => o.clerkUserId === session.clerkUserId).map(([m]) => m);
  if (session.role !== 'admin') return own.sort();
  const unowned = (await purelymail.listUsers()).filter((m) => !owners.has(m));
  return [...new Set([...own, ...unowned])].sort();
}

function sharedAccess(address: string): MailboxAccess {
  const db = getDb();
  const forget = () => db.prepare('DELETE FROM mailbox_credentials WHERE mailbox = ?').run(address);
  return {
    address,
    private: false,
    async password() {
      const row = db.prepare('SELECT encrypted_password FROM mailbox_credentials WHERE mailbox = ?').get(address) as { encrypted_password: string } | undefined;
      if (row) {
        try {
          return decrypt(row.encrypted_password);
        } catch {
          forget(); // the key changed; make a new one
        }
      }
      const password = await purelymail.createAppPassword(address, APP_PASSWORD_NAME);
      db.prepare('INSERT OR REPLACE INTO mailbox_credentials (mailbox, encrypted_password) VALUES (?, ?)').run(address, encrypt(password));
      return password;
    },
    async invalidate() {
      forget();
    },
    async revoke() {
      const row = db.prepare('SELECT encrypted_password FROM mailbox_credentials WHERE mailbox = ?').get(address) as { encrypted_password: string } | undefined;
      if (row) await purelymail.deleteAppPassword(address, decrypt(row.encrypted_password)).catch(() => {});
      forget();
    },
  };
}

function privateAccess(c: Context, address: string, clerkUserId: string): MailboxAccess {
  // The cookie name doesn't reveal the address.
  const name = COOKIE_PREFIX + hash(`${clerkUserId}:${address}`).slice(0, 16);
  let current: string | null | undefined;

  const read = (): string | null => {
    const value = getCookie(c, name);
    if (!value) return null;
    try {
      const payload = JSON.parse(decrypt(value)) as { u: string; m: string; p: string };
      return payload.u === clerkUserId && payload.m === address ? payload.p : null;
    } catch {
      return null;
    }
  };
  const clear = () => {
    current = null;
    deleteCookie(c, name, { path: '/api/mail' });
  };

  return {
    address,
    private: true,
    async password() {
      if (current === undefined) current = read();
      if (current) return current;
      const password = await purelymail.createAppPassword(address, APP_PASSWORD_NAME);
      setCookie(c, name, encrypt(JSON.stringify({ u: clerkUserId, m: address, p: password })), {
        httpOnly: true,
        secure: config.production,
        sameSite: 'Strict',
        path: '/api/mail',
        maxAge: COOKIE_DAYS * 86_400,
      });
      current = password;
      return password;
    },
    async invalidate() {
      clear();
    },
    async revoke() {
      const password = current ?? read();
      if (password) await purelymail.deleteAppPassword(address, password).catch(() => {});
      clear();
    },
  };
}

// Checks the session may open the mailbox and returns how to sign in to it:
// owned mailboxes only by their owner, unowned ones only by admins.
export async function openMailbox(c: Context, session: Session, value: unknown): Promise<MailboxAccess> {
  const address = email(value, 'mailbox');
  const owner = ownerOf(address);
  if (owner) {
    if (owner.clerkUserId !== session.clerkUserId) throw new ApiError('This mailbox is private to its owner', 403, 'mailbox_private');
    return privateAccess(c, address, session.clerkUserId);
  }
  if (session.role !== 'admin' || !(await purelymail.listUsers()).includes(address)) {
    throw new ApiError("You don't have access to this mailbox", 403, 'no_mailbox_access');
  }
  return sharedAccess(address);
}

// For background jobs (scheduled send) that already hold the password.
export const fixedAccess = (address: string, password: string): MailboxAccess => ({
  address,
  private: true,
  password: async () => password,
  invalidate: async () => {},
  revoke: async () => {},
});
