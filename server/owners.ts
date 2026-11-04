import { getDb } from './db';
import { ApiError } from './errors';

export interface Owner {
  clerkUserId: string;
  email: string | null;
  name: string | null;
}

export function ownersByMailbox(): Map<string, Owner> {
  const rows = getDb()
    .prepare(
      `SELECT o.mailbox, o.clerk_user_id, u.email, u.name
       FROM mailbox_owners o LEFT JOIN users u ON u.clerk_user_id = o.clerk_user_id`
    )
    .all() as unknown as { mailbox: string; clerk_user_id: string; email: string | null; name: string | null }[];
  return new Map(rows.map((r) => [r.mailbox, { clerkUserId: r.clerk_user_id, email: r.email, name: r.name }]));
}

export const ownerOf = (mailbox: string): Owner | null => ownersByMailbox().get(mailbox) ?? null;

// A member's mailbox is theirs alone: an admin may delete it, nothing more.
export function assertNotPrivate(mailbox: string) {
  if (ownerOf(mailbox)) throw new ApiError('This mailbox belongs to a member and is private', 403, 'mailbox_private');
}
