import { Hono } from 'hono';
import { type AppEnv } from '../../auth';
import { audit, getDb } from '../../db';
import { ApiError, badRequest } from '../../errors';
import { addManaged, assertManaged, isManaged, managedMailboxes, removeManaged, renameManaged } from '../../managed';
import { assertNotPrivate, ownerOf, ownersByMailbox } from '../../owners';
import { purelymail, PurelyMailError, type UserChanges } from '../../purelymail';
import { bool, domain, email, json, localPart, password, str } from '../../validate';

export const mailboxRoutes = new Hono<AppEnv>()
  // Every route on one mailbox requires it to be one the panel manages.
  // ('/:address/*' also matches '/:address' itself.)
  .use('/:address/*', async (c, next) => {
    if (!['adopt', 'check'].includes(c.req.param('address'))) assertManaged(email(c.req.param('address'), 'address'));
    await next();
  })
  .get('/', async (c) => {
    const [names, owners] = [await managedMailboxes(), ownersByMailbox()];
    return c.json(names.map((address) => ({ address, owner: owners.get(address) ?? null })));
  })
  // Whether an address is free, already in the panel, or only in PurelyMail
  // (the new-mailbox dialog then offers to add it instead).
  .get('/check', async (c) => {
    const address = email(c.req.query('address'), 'address');
    const exists = (await purelymail.listUsers(c.req.query('fresh') === '1')).includes(address);
    return c.json({ address, exists, managed: exists && isManaged(address), owned: Boolean(ownerOf(address)) });
  })
  // Adds a mailbox that already exists in PurelyMail to the panel, keeping its
  // password or, when one is given, replacing it.
  .post('/adopt', async (c) => {
    const body = await json(c.req);
    const address = email(body.address, 'address');
    const newPassword = body.password === undefined || body.password === '' ? undefined : password(body.password);
    if (!(await purelymail.listUsers(true)).includes(address)) throw new ApiError('No such mailbox', 404, 'mailbox_not_found');
    if (newPassword) {
      await purelymail.modifyUser(address, { newPassword });
      // A stored webmail app password still works; nothing else to reset.
    }
    addManaged(address, c.var.session.actor);
    audit(c.var.session.actor, 'mailbox.adopt', address, { passwordChanged: Boolean(newPassword) });
    return c.json({ ok: true });
  })
  // Stops showing a mailbox in the panel; it stays in PurelyMail untouched.
  .delete('/:address/managed', async (c) => {
    const address = email(c.req.param('address'), 'address');
    assertNotPrivate(address);
    removeManaged(address);
    getDb().prepare('DELETE FROM mailbox_credentials WHERE mailbox = ?').run(address);
    audit(c.var.session.actor, 'mailbox.release', address);
    return c.json({ ok: true });
  })
  // Settings and recovery methods; withheld for members' private mailboxes.
  .get('/:address', async (c) => {
    const address = email(c.req.param('address'), 'address');
    const owner = ownerOf(address);
    if (owner) return c.json({ address, owner, private: true });
    return c.json({ address, owner: null, private: false, ...(await purelymail.getUser(address)) });
  })
  .post('/', async (c) => {
    const body = await json(c.req);
    const user = {
      localPart: localPart(body.localPart),
      domain: domain(body.domain),
      password: password(body.password),
      enablePasswordReset: bool(body.enablePasswordReset, 'enablePasswordReset'),
      enableSearchIndexing: bool(body.enableSearchIndexing, 'enableSearchIndexing'),
    };
    const address = `${user.localPart}@${user.domain}`;
    // Already in PurelyMail: offer to add it to the panel instead of failing
    // with PurelyMail's own error.
    const exists = () =>
      isManaged(address) ? new ApiError('Address taken', 409, 'address_taken') : new ApiError('Mailbox exists', 409, 'mailbox_exists', { address });
    if ((await purelymail.listUsers()).includes(address)) throw exists();
    try {
      await purelymail.createUser(user);
    } catch (error) {
      // The user list is cached for a minute; ask PurelyMail again.
      if (error instanceof PurelyMailError && (await purelymail.listUsers(true)).includes(address)) throw exists();
      throw error;
    }
    addManaged(`${user.localPart}@${user.domain}`, c.var.session.actor);
    audit(c.var.session.actor, 'mailbox.create', `${user.localPart}@${user.domain}`);
    return c.json({ ok: true });
  })
  .patch('/:address', async (c) => {
    const address = email(c.req.param('address'), 'address');
    assertNotPrivate(address);
    const body = await json(c.req);
    const changes: UserChanges = {
      enableSearchIndexing: bool(body.enableSearchIndexing, 'enableSearchIndexing'),
      enablePasswordReset: bool(body.enablePasswordReset, 'enablePasswordReset'),
      requireTwoFactorAuthentication: bool(body.requireTwoFactorAuthentication, 'requireTwoFactorAuthentication'),
    };
    if (body.newPassword !== undefined) changes.newPassword = password(body.newPassword);
    if (body.newUserName !== undefined) {
      changes.newUserName = email(body.newUserName, 'newUserName');
      if (changes.newUserName.split('@')[1] !== address.split('@')[1]) throw badRequest('Renaming must keep the domain', 'rename_domain');
    }
    await purelymail.modifyUser(address, changes);
    if (changes.newUserName) renameManaged(address, changes.newUserName);
    audit(c.var.session.actor, 'mailbox.update', address, { ...changes, newPassword: changes.newPassword ? '(changed)' : undefined });
    return c.json({ ok: true });
  })
  .delete('/:address', async (c) => {
    const address = email(c.req.param('address'), 'address');
    await purelymail.deleteUser(address);
    getDb().prepare('DELETE FROM mailbox_owners WHERE mailbox = ?').run(address);
    removeManaged(address);
    audit(c.var.session.actor, 'mailbox.delete', address);
    return c.json({ ok: true });
  })

  // Recovery (password reset) methods
  .put('/:address/recovery', async (c) => {
    const address = email(c.req.param('address'), 'address');
    assertNotPrivate(address);
    const body = await json(c.req);
    const type = str(body.type, 'type');
    if (type !== 'email' && type !== 'phone') throw badRequest('Invalid type', 'invalid_field', { name: 'type' });
    const target = type === 'email' ? email(body.target, 'target') : str(body.target, 'target', { max: 40 });
    const existingTarget = str(body.existingTarget, 'existingTarget', { optional: true }) || undefined;
    await purelymail.upsertPasswordReset(
      address,
      { type, target, description: str(body.description, 'description', { optional: true, max: 100 }), allowMfaReset: bool(body.allowMfaReset, 'allowMfaReset') ?? true },
      existingTarget
    );
    audit(c.var.session.actor, 'mailbox.recovery.set', address, { type });
    return c.json({ ok: true });
  })
  .delete('/:address/recovery', async (c) => {
    const address = email(c.req.param('address'), 'address');
    assertNotPrivate(address);
    const body = await json(c.req);
    await purelymail.deletePasswordReset(address, str(body.target, 'target'));
    audit(c.var.session.actor, 'mailbox.recovery.delete', address);
    return c.json({ ok: true });
  })

  // App passwords: PurelyMail shows a new one once and can't list them.
  .post('/:address/app-passwords', async (c) => {
    const address = email(c.req.param('address'), 'address');
    assertNotPrivate(address);
    const body = await json(c.req);
    const appPassword = await purelymail.createAppPassword(address, str(body.name, 'name', { optional: true, max: 100 }));
    audit(c.var.session.actor, 'mailbox.app_password.create', address);
    return c.json({ appPassword });
  });
