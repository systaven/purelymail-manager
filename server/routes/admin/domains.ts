import { Hono } from 'hono';
import { type AppEnv } from '../../auth';
import { audit, getDb } from '../../db';
import { checkRecords } from '../../dns-records';
import { purelymail } from '../../purelymail';
import { ApiError } from '../../errors';
import { bool, domain, json } from '../../validate';

// PurelyMail's shared domains: admins may create mailboxes on them, but they
// can't be configured here and are never offered to members.
async function assertOwnDomain(name: string) {
  const shared = (await purelymail.listDomains(true)).some((d) => d.name === name && d.isShared);
  if (shared) throw new ApiError('This is a PurelyMail shared domain', 403, 'domain_shared');
}

export const domainRoutes = new Hono<AppEnv>()
  // Your domains first, then PurelyMail's shared domains (flagged isShared).
  .get('/', async (c) => c.json((await purelymail.listDomains(true)).sort((a, b) => Number(a.isShared) - Number(b.isShared) || a.name.localeCompare(b.name))))
  // The value of the ownership TXT record (the same for every domain on the account).
  .get('/ownership-code', async (c) => c.json(await purelymail.getOwnershipCode()))
  // The records a domain needs, each checked against live DNS.
  .get('/:name/records', async (c) => {
    const name = domain(c.req.param('name'));
    await assertOwnDomain(name);
    const owned = (await purelymail.listDomains()).some((d) => d.name === name);
    // Once the domain is added, the ownership record is no longer needed.
    const code = owned ? undefined : (await purelymail.getOwnershipCode()).code;
    return c.json(await checkRecords(name, code));
  })
  .post('/', async (c) => {
    const body = await json(c.req);
    const name = domain(body.domain);
    await purelymail.addDomain(name);
    audit(c.var.session.actor, 'domain.add', name);
    return c.json({ ok: true });
  })
  .patch('/:name', async (c) => {
    const name = domain(c.req.param('name'));
    await assertOwnDomain(name);
    const body = await json(c.req);
    const settings = {
      allowAccountReset: bool(body.allowAccountReset, 'allowAccountReset'),
      symbolicSubaddressing: bool(body.symbolicSubaddressing, 'symbolicSubaddressing'),
      recheckDns: bool(body.recheckDns, 'recheckDns'),
    };
    await purelymail.updateDomainSettings(name, settings);
    if (settings.allowAccountReset !== undefined || settings.symbolicSubaddressing !== undefined) {
      audit(c.var.session.actor, 'domain.update', name, settings);
    }
    return c.json({ ok: true });
  })
  .delete('/:name', async (c) => {
    const name = domain(c.req.param('name'));
    await assertOwnDomain(name);
    await purelymail.deleteDomain(name);
    // PurelyMail deletes the domain's mailboxes with it.
    getDb().prepare('DELETE FROM mailbox_owners WHERE mailbox LIKE ?').run(`%@${name}`);
    getDb().prepare('DELETE FROM managed_mailboxes WHERE mailbox LIKE ?').run(`%@${name}`);
    audit(c.var.session.actor, 'domain.delete', name);
    return c.json({ ok: true });
  });
