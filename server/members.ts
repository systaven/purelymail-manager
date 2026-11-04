import { randomBytes } from 'node:crypto';
import { getDb, transaction } from './db';
import { ApiError } from './errors';
import { addManaged } from './managed';
import { purelymail } from './purelymail';

// Members (Clerk users who aren't admins) manage their own mailboxes within
// limits: a quota, which domains they may use, and whether new mailboxes need
// an admin's approval. Each has a per-member value or falls back to the default.

export interface MemberDefaults {
  maxMailboxes: number;
  requiresApproval: boolean;
  // Domains members may create mailboxes on.
  openDomains: string[];
}

const DEFAULTS: MemberDefaults = { maxMailboxes: 1, requiresApproval: true, openDomains: [] };

export function getDefaults(): MemberDefaults {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'member_defaults'").get() as { value: string } | undefined;
  return row ? { ...DEFAULTS, ...JSON.parse(row.value) } : DEFAULTS;
}

export function setDefaults(defaults: MemberDefaults) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('member_defaults', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(defaults));
}

export interface UserRecord {
  clerk_user_id: string;
  email: string | null;
  name: string | null;
  role: 'admin' | 'guest';
  disabled: number;
  max_mailboxes: number | null;
  requires_approval: number | null;
  allowed_domains: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export function getUser(clerkUserId: string): UserRecord {
  const row = getDb().prepare('SELECT * FROM users WHERE clerk_user_id = ?').get(clerkUserId) as unknown as UserRecord | undefined;
  if (!row) throw new ApiError('Member not found', 404, 'not_found');
  return row;
}

export function limitsFor(user: UserRecord) {
  const defaults = getDefaults();
  return {
    maxMailboxes: user.max_mailboxes ?? defaults.maxMailboxes,
    requiresApproval: user.requires_approval === null ? defaults.requiresApproval : Boolean(user.requires_approval),
    allowedDomains: user.allowed_domains ? (JSON.parse(user.allowed_domains) as string[]) : defaults.openDomains,
  };
}

export const ownedMailboxes = (clerkUserId: string) =>
  (getDb().prepare('SELECT mailbox FROM mailbox_owners WHERE clerk_user_id = ? ORDER BY mailbox').all(clerkUserId) as { mailbox: string }[]).map(
    (r) => r.mailbox
  );

export const pendingRequests = (clerkUserId: string) =>
  getDb()
    .prepare("SELECT id, mailbox, note, created_at FROM mailbox_requests WHERE clerk_user_id = ? AND status = 'pending' ORDER BY id")
    .all(clerkUserId) as { id: number; mailbox: string; note: string | null; created_at: string }[];

// Local parts nobody may take: they receive abuse reports, bounces and the like.
const RESERVED = new Set([
  'abuse', 'admin', 'administrator', 'hostmaster', 'info', 'mailer-daemon', 'noreply', 'no-reply', 'postmaster',
  'root', 'security', 'support', 'webmaster', 'billing', 'help', 'contact', 'sales',
]);

// Checks a member may have this address: quota (pending requests count),
// allowed domain, not reserved, not taken.
export async function checkNewAddress(user: UserRecord, localPart: string, domain: string) {
  const limits = limitsFor(user);
  if (RESERVED.has(localPart)) throw new ApiError('Reserved address', 400, 'reserved_address', { name: localPart });
  if (!limits.allowedDomains.includes(domain)) throw new ApiError('Domain not allowed', 403, 'domain_not_allowed', { domain });
  const used = ownedMailboxes(user.clerk_user_id).length + pendingRequests(user.clerk_user_id).length;
  if (used >= limits.maxMailboxes) throw new ApiError('Mailbox limit reached', 403, 'quota_reached', { limit: limits.maxMailboxes });
  const address = `${localPart}@${domain}`;
  if ((await purelymail.listUsers()).includes(address)) throw new ApiError('Address taken', 409, 'address_taken');
  if (getDb().prepare("SELECT 1 FROM mailbox_requests WHERE mailbox = ? AND status = 'pending'").get(address)) {
    throw new ApiError('Address requested', 409, 'address_requested');
  }
  // Rules that already catch this address would silently take its mail.
  const rules = await purelymail.listRoutingRules();
  if (rules.some((r) => r.domainName === domain && !r.catchall && (r.prefix ? localPart.startsWith(r.matchUser) : r.matchUser === localPart))) {
    throw new ApiError('Address taken', 409, 'address_taken');
  }
  return { address, limits };
}

export const randomPassword = () => randomBytes(24).toString('base64url');

// Creates a mailbox owned by the member. Without a password (approved
// requests) it gets a random one the member replaces from their page.
export async function createOwnedMailbox(clerkUserId: string, localPart: string, domain: string, password?: string) {
  await purelymail.createUser({ localPart, domain, password: password ?? randomPassword(), enablePasswordReset: false, enableSearchIndexing: true });
  getDb().prepare('INSERT INTO mailbox_owners (mailbox, clerk_user_id) VALUES (?, ?)').run(`${localPart}@${domain}`, clerkUserId);
  addManaged(`${localPart}@${domain}`, clerkUserId);
}

// Gives an existing mailbox to a member. Anything that let someone else in is
// removed first: recovery methods, rules forwarding just this address, and
// the password (replaced with a random one the member then changes).
export async function handOverMailbox(mailbox: string, clerkUserId: string) {
  const [local, domain] = mailbox.split('@');
  for (const method of await purelymail.listPasswordReset(mailbox)) {
    await purelymail.deletePasswordReset(mailbox, method.target);
  }
  for (const rule of await purelymail.listRoutingRules()) {
    if (rule.domainName === domain && !rule.prefix && rule.matchUser === local) await purelymail.deleteRoutingRule(rule.id);
  }
  await purelymail.modifyUser(mailbox, { newPassword: randomPassword() });
  transaction(getDb(), () => {
    getDb().prepare('DELETE FROM mailbox_owners WHERE mailbox = ?').run(mailbox);
    getDb().prepare('INSERT INTO mailbox_owners (mailbox, clerk_user_id) VALUES (?, ?)').run(mailbox, clerkUserId);
    addManaged(mailbox, clerkUserId);
  });
}
