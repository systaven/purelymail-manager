import { getDb } from './db';
import { ApiError } from './errors';
import { purelymail } from './purelymail';

// The panel only shows mailboxes it manages: created or added here, or owned
// by a member. Mailboxes that exist only in the PurelyMail account are ignored.

export function managedSet(): Set<string> {
  const rows = getDb()
    .prepare('SELECT mailbox FROM managed_mailboxes UNION SELECT mailbox FROM mailbox_owners')
    .all() as { mailbox: string }[];
  return new Set(rows.map((r) => r.mailbox));
}

export const isManaged = (mailbox: string) => managedSet().has(mailbox);

export function addManaged(mailbox: string, actor: string | null) {
  getDb().prepare('INSERT OR IGNORE INTO managed_mailboxes (mailbox, added_by) VALUES (?, ?)').run(mailbox, actor);
}

export function removeManaged(mailbox: string) {
  getDb().prepare('DELETE FROM managed_mailboxes WHERE mailbox = ?').run(mailbox);
}

export function renameManaged(from: string, to: string) {
  getDb().prepare('UPDATE OR IGNORE managed_mailboxes SET mailbox = ? WHERE mailbox = ?').run(to, from);
}

// Managed mailboxes that still exist in PurelyMail (deleted elsewhere drop out).
export async function managedMailboxes(): Promise<string[]> {
  const managed = managedSet();
  return (await purelymail.listUsers()).filter((m) => managed.has(m)).sort();
}

export function assertManaged(mailbox: string) {
  if (!isManaged(mailbox)) throw new ApiError('This mailbox is not managed by the panel', 404, 'not_found');
}
