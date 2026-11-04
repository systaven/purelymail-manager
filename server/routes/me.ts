import { removeManaged } from '../managed';
import { Hono } from 'hono';
import { type AppEnv, requireAuth } from '../auth';
import { audit, getDb } from '../db';
import { ApiError } from '../errors';
import { checkNewAddress, createOwnedMailbox, getUser, limitsFor, ownedMailboxes, pendingRequests } from '../members';
import { purelymail } from '../purelymail';
import { bool, domain, email, emails, json, localPart, password, str } from '../validate';

// A member's own mailboxes. Every route checks the mailbox belongs to the caller.
function ownMailbox(clerkUserId: string, value: string): string {
  const address = email(value, 'address');
  if (!ownedMailboxes(clerkUserId).includes(address)) throw new ApiError('Not your mailbox', 403, 'no_mailbox_access');
  return address;
}

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
    await createOwnedMailbox(user.clerk_user_id, local, address.split('@')[1], password(body.password));
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
