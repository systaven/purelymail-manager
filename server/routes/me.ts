import { addManaged, isManaged, removeManaged } from '../managed';
import { verifyPassword } from '../mail/pool';
import { ownerOf } from '../owners';
import { Hono } from 'hono';
import { type AppEnv, requireAuth } from '../auth';
import { audit, getDb } from '../db';
import { ApiError } from '../errors';
import { checkNewAddress, createOwnedMailbox, getUser, limitsFor, ownedMailboxes, pendingRequests, randomPassword } from '../members';
import { purelymail } from '../purelymail';
import { bool, domain, email, emails, json, localPart, password, str } from '../validate';

// A member's own mailboxes. Every route checks the mailbox belongs to the caller.
function ownMailbox(clerkUserId: string, value: string): string {
  const address = email(value, 'address');
  if (!ownedMailboxes(clerkUserId).includes(address)) throw new ApiError('Not your mailbox', 403, 'no_mailbox_access');
  return address;
}

// Wrong-password attempts when claiming a mailbox, per member (in memory).
const claimFailures = new Map<string, number[]>();
const CLAIM_WINDOW_MS = 15 * 60_000;
const CLAIM_MAX_FAILURES = 5;

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth())
  .get('/', (c) => {
    const user = getUser(c.var.session.clerkUserId);
    return c.json({ limits: limitsFor(user), mailboxes: ownedMailboxes(user.clerk_user_id), requests: pendingRequests(user.clerk_user_id) });
  })
  .post('/mailboxes', async (c) => {
    const user = getUser(c.var.session.clerkUserId);
    const body = await json(c.req);
    const local = localPart(body.localPart);
    const { address, limits } = await checkNewAddress(user, local, domain(body.domain));
    if (limits.requiresApproval) {
      getDb()
        .prepare('INSERT INTO mailbox_requests (clerk_user_id, mailbox, note) VALUES (?, ?, ?)')
        .run(user.clerk_user_id, address, str(body.note, 'note', { optional: true, max: 300 }) || null);
      audit(c.var.session.actor, 'request.create', address);
      return c.json({ status: 'requested' });
    }
    // A random password by default: mail apps get one through the setup guide.
    const chosen = limits.mailApps && body.password ? password(body.password) : undefined;
    await createOwnedMailbox(user.clerk_user_id, local, address.split('@')[1], chosen);
    audit(c.var.session.actor, 'mailbox.create', address);
    return c.json({ status: 'created' });
  })
  .delete('/requests/:id', (c) => {
    const result = getDb()
      .prepare("UPDATE mailbox_requests SET status = 'cancelled' WHERE id = ? AND clerk_user_id = ? AND status = 'pending'")
      .run(Number(c.req.param('id')), c.var.session.clerkUserId);
    if (!result.changes) throw new ApiError('Request not found', 404, 'not_found');
    return c.json({ ok: true });
  })
  .post('/claim', async (c) => {
    // A mailbox that already exists in PurelyMail becomes the member's after
    // they prove it's theirs with its current password. Mailboxes the panel
    // already manages (admins' or another member's) can't be claimed.
    const user = getUser(c.var.session.clerkUserId);
    const body = await json(c.req);
    const address = email(body.address, 'address');
    const current = str(body.password, 'password', { max: 200 });
    const limits = limitsFor(user);
    // Without mail-app access the password they proved with stops working:
    // the mailbox gets a random one (webmail doesn't need it).
    const newPassword = !limits.mailApps ? randomPassword() : body.newPassword === undefined || body.newPassword === '' ? undefined : password(body.newPassword);

    const now = Date.now();
    const recent = (claimFailures.get(user.clerk_user_id) ?? []).filter((t) => now - t < CLAIM_WINDOW_MS);
    if (recent.length >= CLAIM_MAX_FAILURES) throw new ApiError('Too many attempts', 429, 'too_many_attempts');

    const owner = ownerOf(address);
    if (owner?.clerkUserId === user.clerk_user_id) throw new ApiError('Already yours', 409, 'already_yours');
    if (owner || isManaged(address)) throw new ApiError('Managed by the panel', 409, 'mailbox_managed');
    if (ownedMailboxes(user.clerk_user_id).length + pendingRequests(user.clerk_user_id).length >= limits.maxMailboxes) {
      throw new ApiError('Mailbox limit reached', 403, 'quota_reached', { limit: limits.maxMailboxes });
    }
    // Same answer for "no such mailbox" and "wrong password": no probing.
    const exists = (await purelymail.listUsers(true)).includes(address);
    if (!exists || !(await verifyPassword(address, current))) {
      claimFailures.set(user.clerk_user_id, [...recent, now]);
      throw new ApiError('Wrong address or password', 403, 'claim_failed');
    }
    claimFailures.delete(user.clerk_user_id);
    if (newPassword) await purelymail.modifyUser(address, { newPassword });
    getDb().prepare('INSERT INTO mailbox_owners (mailbox, clerk_user_id) VALUES (?, ?)').run(address, user.clerk_user_id);
    addManaged(address, user.clerk_user_id);
    audit(c.var.session.actor, 'mailbox.claim', address, { passwordChanged: Boolean(newPassword) });
    return c.json({ ok: true });
  })
  .delete('/mailboxes/:address', async (c) => {
    const address = ownMailbox(c.var.session.clerkUserId, c.req.param('address'));
    await purelymail.deleteUser(address);
    getDb().prepare('DELETE FROM mailbox_owners WHERE mailbox = ?').run(address);
    removeManaged(address);
    audit(c.var.session.actor, 'mailbox.delete', address);
    return c.json({ ok: true });
  })
  .post('/mailboxes/:address/password', async (c) => {
    const address = ownMailbox(c.var.session.clerkUserId, c.req.param('address'));
    if (!limitsFor(getUser(c.var.session.clerkUserId)).mailApps) throw new ApiError('Mail apps are turned off for you', 403, 'mail_apps_disabled');
    await purelymail.modifyUser(address, { newPassword: password((await json(c.req)).password) });
    audit(c.var.session.actor, 'mailbox.password', address);
    return c.json({ ok: true });
  })
  // Forwarding is an exact routing rule for the address; keeping a copy means
  // the mailbox itself is one of the targets.
  .get('/mailboxes/:address/forwarding', async (c) => {
    const address = ownMailbox(c.var.session.clerkUserId, c.req.param('address'));
    const [local, dom] = address.split('@');
    const rule = (await purelymail.listRoutingRules()).find((r) => r.domainName === dom && !r.prefix && r.matchUser === local);
    if (!rule) return c.json({ targets: [], keepCopy: true });
    return c.json({ targets: rule.targetAddresses.filter((t) => t !== address), keepCopy: rule.targetAddresses.includes(address) });
  })
  .put('/mailboxes/:address/forwarding', async (c) => {
    const address = ownMailbox(c.var.session.clerkUserId, c.req.param('address'));
    const [local, dom] = address.split('@');
    const body = await json(c.req);
    const targets = (Array.isArray(body.targets) && body.targets.length ? emails(body.targets, 'targets') : []).filter((t) => t !== address);
    const keepCopy = bool(body.keepCopy, 'keepCopy') ?? true;
    const existing = (await purelymail.listRoutingRules()).filter((r) => r.domainName === dom && !r.prefix && r.matchUser === local);
    for (const rule of existing) await purelymail.deleteRoutingRule(rule.id);
    if (targets.length) {
      try {
        await purelymail.createRoutingRule({ domainName: dom, prefix: false, matchUser: local, catchall: false, targetAddresses: keepCopy ? [address, ...targets] : targets });
      } catch (error) {
        for (const { id: _id, ...rule } of existing) await purelymail.createRoutingRule(rule).catch(() => {});
        throw error;
      }
    }
    audit(c.var.session.actor, 'mailbox.forwarding', address, { targets: targets.length, keepCopy });
    return c.json({ ok: true });
  });
