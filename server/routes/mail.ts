import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { type AppEnv, requireAuth } from '../auth';
import { badRequest } from '../errors';
import { accessibleMailboxes, openMailbox } from '../mail/access';
import { applyAction, getAttachment, getMessage, listFolders, listMessages, type Action } from '../mail/messages';
import { watch } from '../mail/pool';
import { cancel, deleteDraft, enqueue, listOutbox, parseOutgoing, retry, saveDraft } from '../mail/send';
import { withImap } from '../mail/pool';
import { json, str } from '../validate';

const ACTIONS: Action[] = ['read', 'unread', 'star', 'unstar', 'archive', 'trash', 'delete', 'spam', 'notSpam', 'move'];

function uid(value: unknown, name = 'uid'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}`, 'invalid_field', { name });
  return n;
}

const folderOf = (value: unknown) => str(value, 'folder', { max: 500 });

// Attachments are always downloads; only harmless image types may be shown inline.
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

export const mailRoutes = new Hono<AppEnv>()
  .use(requireAuth())
  .get('/mailboxes', async (c) => c.json(await accessibleMailboxes(c.var.session)))
  .get('/folders', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    return c.json(await listFolders(access, c.req.query('fresh') === '1'));
  })
  .post('/folders', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const path = str(body.path, 'path', { max: 200 });
    await withImap(access, (client) => client.mailboxCreate(path));
    return c.json(await listFolders(access, true));
  })
  .get('/messages', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    const page = Math.max(0, Number(c.req.query('page')) || 0);
    return c.json(await listMessages(access, folderOf(c.req.query('folder')), { page, query: c.req.query('q') ?? '' }));
  })
  .get('/message', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    return c.json(await getMessage(access, folderOf(c.req.query('folder')), uid(c.req.query('uid')), c.req.query('images') === '1'));
  })
  .get('/attachment', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    const a = await getAttachment(access, folderOf(c.req.query('folder')), uid(c.req.query('uid')), Number(c.req.query('index')));
    const inline = c.req.query('inline') === '1' && INLINE_TYPES.has(a.contentType);
    const filename = encodeURIComponent(a.filename).replace(/['()]/g, escape);
    c.header('Content-Type', inline ? a.contentType : 'application/octet-stream');
    c.header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`);
    c.header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    c.header('Cache-Control', 'private, max-age=300');
    return c.body(new Uint8Array(a.content));
  })
  .post('/actions', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const action = body.action as Action;
    if (!ACTIONS.includes(action)) throw badRequest('Invalid action', 'invalid_field', { name: 'action' });
    const uids = (Array.isArray(body.uids) ? body.uids : []).map((u) => uid(u)).slice(0, 1000);
    await applyAction(access, folderOf(body.folder), uids, action, typeof body.target === 'string' ? body.target : undefined);
    return c.json({ ok: true });
  })

  // Live updates: new mail in the inbox, outbox results.
  .get('/events', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    await access.password(); // sets the credential cookie before the stream starts
    return streamSSE(c, async (stream) => {
      let closed = false;
      const unsubscribe = watch(access, (event) => {
        if (!closed) stream.writeSSE({ event: event.type, data: JSON.stringify(event) }).catch(() => {});
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });
      await stream.writeSSE({ event: 'ready', data: '{}' });
      while (!closed) {
        await stream.sleep(25_000);
        if (!closed) await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => (closed = true));
      }
      unsubscribe();
    });
  })

  // Sending (through the outbox)
  .post('/send', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const message = parseOutgoing((body.message ?? {}) as Record<string, unknown>);
    const delay = Math.min(Math.max(Number(body.delaySeconds) || 0, 0), 30);
    const sendAt = typeof body.sendAt === 'number' ? body.sendAt : Date.now() + delay * 1000;
    return c.json(await enqueue(access, c.var.session.clerkUserId, message, sendAt));
  })
  .get('/outbox', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    return c.json(listOutbox(access.address, c.var.session.clerkUserId));
  })
  .delete('/outbox/:id', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    return c.json(cancel(access.address, c.var.session.clerkUserId, c.req.param('id')));
  })
  .post('/outbox/:id/retry', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    retry(access.address, c.var.session.clerkUserId, c.req.param('id'));
    return c.json({ ok: true });
  })

  // Drafts
  .post('/drafts', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    const message = parseOutgoing((body.message ?? {}) as Record<string, unknown>);
    return c.json(await saveDraft(access, message, Number.isInteger(body.replaceUid) ? (body.replaceUid as number) : undefined));
  })
  .delete('/drafts/:uid', async (c) => {
    const access = await openMailbox(c, c.var.session, c.req.query('mailbox'));
    await deleteDraft(access, uid(c.req.param('uid')));
    return c.json({ ok: true });
  })

  // Deletes the panel's app password for the mailbox (a new one is made on next use).
  .post('/signout', async (c) => {
    const body = await json(c.req);
    const access = await openMailbox(c, c.var.session, body.mailbox);
    await access.revoke();
    return c.json({ ok: true });
  });
