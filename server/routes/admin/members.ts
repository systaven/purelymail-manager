import { Hono } from 'hono';
import { type AppEnv } from '../../auth';
import { config } from '../../config';
import { audit, getDb } from '../../db';
import { ApiError, badRequest } from '../../errors';
import { checkNewAddress, createOwnedMailbox, getDefaults, getUser, handOverMailbox, limitsFor, revokeMailApps, setDefaults, type UserRecord } from '../../members';
import { ownerOf } from '../../owners';
import { purelymail } from '../../purelymail';
import { bool, email, json, str } from '../../validate';

function optionalInt(value: unknown, name: string): number | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1000) throw badRequest(`Invalid ${name}`, 'invalid_field', { name });
  return value as number;
}

async function domainList(value: unknown, name: string): Promise<string[]> {
  if (!Array.isArray(value)) throw badRequest(`Invalid ${name}`, 'invalid_field', { name });
  const owned = new Set((await purelymail.listDomains()).map((d) => d.name));
  const list = [...new Set(value.map((v) => String(v).toLowerCase()))];
  const unknown = list.find((d) => !owned.has(d));
  if (unknown) throw badRequest('Unknown domain', 'domain_not_on_account', { domain: unknown });
  return list;
}

const envAdmin = (user: UserRecord) => Boolean(user.email && config.adminEmails.includes(user.email));

export const memberRoutes = new Hono<AppEnv>()
  .get('/defaults', (c) => c.json(getDefaults()))
  .put('/defaults', async (c) => {
    const body = await json(c.req);
    const defaults = {
      maxMailboxes: optionalInt(body.maxMailboxes, 'maxMailboxes') ?? 0,
      requiresApproval: bool(body.requiresApproval, 'requiresApproval') ?? true,
      openDomains: await domainList(body.openDomains, 'openDomains'),
      mailApps: bool(body.mailApps, 'mailApps') ?? getDefaults().mailApps,
    };
    const before = getDefaults().mailApps;
    setDefaults(defaults);
    if (before && !defaults.mailApps) {
      // Members following the default lose access now.
      const affected = (getDb().prepare("SELECT clerk_user_id FROM users WHERE mail_apps IS NULL AND role = 'guest'").all() as { clerk_user_id: string }[]).map((r) => r.clerk_user_id);
      await revokeMailApps(affected);
    }
    audit(c.var.session.actor, 'members.defaults', undefined, defaults);
    return c.json(defaults);
  })
  .get('/', (c) => {
    const db = getDb();
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as unknown as UserRecord[];
    const counts = new Map(
      (db.prepare('SELECT clerk_user_id, COUNT(*) AS n FROM mailbox_owners GROUP BY clerk_user_id').all() as { clerk_user_id: string; n: number }[]).map((r) => [r.clerk_user_id, r.n])
    );
    const pending = new Map(
      (db.prepare("SELECT clerk_user_id, COUNT(*) AS n FROM mailbox_requests WHERE status = 'pending' GROUP BY clerk_user_id").all() as {
        clerk_user_id: string;
        n: number;
      }[]).map((r) => [r.clerk_user_id, r.n])
    );
    return c.json(
      users.map((u) => ({
        clerkUserId: u.clerk_user_id,
        email: u.email,
        name: u.name,
        role: envAdmin(u) ? 'admin' : u.role,
        // Admin because of ADMIN_EMAILS: can't be demoted here.
        envAdmin: envAdmin(u),
        disabled: Boolean(u.disabled),
        createdAt: u.created_at,
        lastSeenAt: u.last_seen_at,
        mailboxes: counts.get(u.clerk_user_id) ?? 0,
        pendingRequests: pending.get(u.clerk_user_id) ?? 0,
        overrides: {
          maxMailboxes: u.max_mailboxes,
          requiresApproval: u.requires_approval === null ? null : Boolean(u.requires_approval),
          allowedDomains: u.allowed_domains ? JSON.parse(u.allowed_domains) : null,
          mailApps: u.mail_apps === null ? null : Boolean(u.mail_apps),
        },
        limits: limitsFor(u),
      }))
    );
  })
  .get('/:id/mailboxes', (c) => {
    const rows = getDb().prepare('SELECT mailbox FROM mailbox_owners WHERE clerk_user_id = ? ORDER BY mailbox').all(c.req.param('id')) as { mailbox: string }[];
    return c.json(rows.map((r) => r.mailbox));
  })
  .patch('/:id', async (c) => {
    const user = getUser(c.req.param('id'));
    const body = await json(c.req);
    const db = getDb();
    const set = (column: string, value: unknown) => db.prepare(`UPDATE users SET ${column} = ? WHERE clerk_user_id = ?`).run(value as never, user.clerk_user_id);

    if (body.role !== undefined) {
      if (body.role !== 'admin' && body.role !== 'guest') throw badRequest('Invalid role', 'invalid_field', { name: 'role' });
      if (body.role === 'guest' && envAdmin(user)) throw new ApiError('Listed in ADMIN_EMAILS', 400, 'env_admin');
      set('role', body.role);
    }
    const disabled = bool(body.disabled, 'disabled');
    if (disabled !== undefined) {
      if (disabled && (user.clerk_user_id === c.var.session.clerkUserId || envAdmin(user))) throw new ApiError("Can't disable this account", 400, 'cannot_disable');
      set('disabled', disabled ? 1 : 0);
    }
    if ('maxMailboxes' in body) set('max_mailboxes', optionalInt(body.maxMailboxes, 'maxMailboxes') ?? null);
    if ('requiresApproval' in body) set('requires_approval', body.requiresApproval === null ? null : bool(body.requiresApproval, 'requiresApproval') ? 1 : 0);
    if ('allowedDomains' in body) set('allowed_domains', body.allowedDomains === null ? null : JSON.stringify(await domainList(body.allowedDomains, 'allowedDomains')));
    if ('mailApps' in body) {
      const before = limitsFor(user).mailApps;
      set('mail_apps', body.mailApps === null ? null : bool(body.mailApps, 'mailApps') ? 1 : 0);
      if (before && !limitsFor(getUser(user.clerk_user_id)).mailApps) await revokeMailApps([user.clerk_user_id]);
    }

    audit(c.var.session.actor, 'member.update', user.email ?? user.clerk_user_id, body);
    return c.json({ ok: true });
  })
  // Gives an existing, unowned mailbox to a member (resets its access first).
  .put('/:id/mailboxes/:address', async (c) => {
    const user = getUser(c.req.param('id'));
    const address = email(c.req.param('address'), 'address');
    if (ownerOf(address)) throw new ApiError('Already owned', 409, 'mailbox_private');
    if (!(await purelymail.listUsers()).includes(address)) throw new ApiError('No such mailbox', 404, 'not_found');
    await handOverMailbox(address, user.clerk_user_id);
    audit(c.var.session.actor, 'member.assign', address, { member: user.email });
    return c.json({ ok: true });
  });

export const requestRoutes = new Hono<AppEnv>()
  .get('/', (c) => {
    const status = c.req.query('status') || 'pending';
    const rows = getDb()
      .prepare(
        `SELECT r.id, r.mailbox, r.note, r.status, r.created_at AS createdAt, r.decided_at AS decidedAt, r.decided_by AS decidedBy,
                u.clerk_user_id AS clerkUserId, u.email, u.name
         FROM mailbox_requests r JOIN users u ON u.clerk_user_id = r.clerk_user_id
         WHERE r.status = ? ORDER BY r.id DESC LIMIT 200`
      )
      .all(status);
    return c.json(rows);
  })
  .post('/:id', async (c) => {
    const db = getDb();
    const request = db.prepare("SELECT * FROM mailbox_requests WHERE id = ? AND status = 'pending'").get(Number(c.req.param('id'))) as
      | { id: number; clerk_user_id: string; mailbox: string }
      | undefined;
    if (!request) throw new ApiError('Request not found', 404, 'not_found');
    const decision = str((await json(c.req)).decision, 'decision');
    if (decision !== 'approve' && decision !== 'reject') throw badRequest('Invalid decision', 'invalid_field', { name: 'decision' });

    if (decision === 'approve') {
      const [local, domain] = request.mailbox.split('@');
      const user = getUser(request.clerk_user_id);
      // Re-check everything except the quota this request already counts towards.
      db.prepare("UPDATE mailbox_requests SET status = 'cancelled' WHERE id = ?").run(request.id);
      try {
        await checkNewAddress(user, local, domain);
        await createOwnedMailbox(user.clerk_user_id, local, domain);
      } catch (error) {
        db.prepare("UPDATE mailbox_requests SET status = 'pending' WHERE id = ?").run(request.id);
        throw error;
      }
    }
    db.prepare("UPDATE mailbox_requests SET status = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?").run(
      decision === 'approve' ? 'approved' : 'rejected',
      c.var.session.actor,
      request.id
    );
    audit(c.var.session.actor, `request.${decision}`, request.mailbox);
    return c.json({ ok: true });
  });
