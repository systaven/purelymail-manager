import { EventEmitter } from 'node:events';
import { ImapFlow } from 'imapflow';
import type { MailboxAccess } from './access';

// IMAP connections are reused between requests: opening one (TLS + login)
// takes far longer than most commands. Each mailbox gets at most one command
// connection, closed after a few idle minutes, plus one IDLE connection on the
// inbox while someone has the mailbox open in a browser.

export const IMAP = {
  host: process.env.MAIL_IMAP_HOST || 'imap.purelymail.com',
  port: Number(process.env.MAIL_IMAP_PORT || 993),
};

const IDLE_CLOSE_MS = 5 * 60_000;
const MAX_CONNECTIONS = Number(process.env.MAIL_MAX_CONNECTIONS || 40);

interface Entry {
  client: Promise<ImapFlow>;
  lastUsed: number;
}

const pool = new Map<string, Entry>();

const isAuthError = (error: any) => Boolean(error?.authenticationFailed || error?.serverResponseCode === 'AUTHENTICATIONFAILED');

async function connect(address: string, password: string, idle = false): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: IMAP.host,
    port: IMAP.port,
    secure: true,
    auth: { user: address, pass: password },
    logger: false,
    // IDLE only on the watcher connection; command connections stay quiet.
    disableAutoIdle: !idle,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 5 * 60_000,
  });
  client.on('error', () => {}); // surfaced through the failing command instead
  await client.connect();
  return client;
}

// Signs in with the mailbox's app password; if PurelyMail rejects it (deleted
// elsewhere, or a new device), a new one is made and tried once.
async function connectWithRetry(access: MailboxAccess, idle = false): Promise<ImapFlow> {
  try {
    return await connect(access.address, await access.password(), idle);
  } catch (error) {
    if (!isAuthError(error)) throw error;
    await access.invalidate();
    return connect(access.address, await access.password(), idle);
  }
}

function evictIfFull() {
  if (pool.size < MAX_CONNECTIONS) return;
  const oldest = [...pool.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
  if (oldest) close(oldest[0]);
}

function close(address: string) {
  const entry = pool.get(address);
  pool.delete(address);
  entry?.client.then((client) => client.logout().catch(() => client.close())).catch(() => {});
}

async function getClient(access: MailboxAccess): Promise<ImapFlow> {
  const existing = pool.get(access.address);
  if (existing) {
    const client = await existing.client.catch(() => null);
    if (client?.usable) {
      existing.lastUsed = Date.now();
      return client;
    }
    pool.delete(access.address);
  }
  evictIfFull();
  const entry: Entry = { client: connectWithRetry(access), lastUsed: Date.now() };
  pool.set(access.address, entry);
  entry.client.catch(() => pool.get(access.address) === entry && pool.delete(access.address));
  return entry.client;
}

// Runs `fn` with the mailbox's connection. Commands on one connection are
// queued by imapflow; folder selection is serialised with mailbox locks.
export async function withImap<T>(access: MailboxAccess, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = await getClient(access);
  try {
    return await fn(client);
  } catch (error: any) {
    // A dropped connection: reconnect once and retry.
    if (!client.usable && !isAuthError(error)) {
      close(access.address);
      return fn(await getClient(access));
    }
    throw error;
  }
}

// Runs `fn` with `path` selected.
export function inFolder<T>(access: MailboxAccess, path: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  return withImap(access, async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  });
}

// --- Push --------------------------------------------------------------------

export type MailEvent = { type: 'inbox'; reason: 'exists' | 'expunge' | 'flags' } | { type: 'outbox'; id: string; status: 'sent' | 'failed'; error?: string };

interface Watcher {
  emitter: EventEmitter;
  client: ImapFlow | null;
  subscribers: number;
  closeTimer?: NodeJS.Timeout;
  pollTimer?: NodeJS.Timeout;
}

// Some servers accept IDLE but don't report new mail during it; a NOOP every
// so often makes them send the pending EXISTS/EXPUNGE updates.
const NOOP_INTERVAL_MS = 30_000;

const watchers = new Map<string, Watcher>();
export const mailEvents = new EventEmitter();
mailEvents.setMaxListeners(0);

async function startWatcher(access: MailboxAccess, watcher: Watcher) {
  try {
    const client = await connectWithRetry(access, true);
    client.on('exists', () => watcher.emitter.emit('event', { type: 'inbox', reason: 'exists' }));
    client.on('expunge', () => watcher.emitter.emit('event', { type: 'inbox', reason: 'expunge' }));
    client.on('flags', () => watcher.emitter.emit('event', { type: 'inbox', reason: 'flags' }));
    client.on('close', () => {
      // Reconnect while people are still watching.
      if (watchers.get(access.address) === watcher && watcher.subscribers > 0) {
        watcher.client = null;
        setTimeout(() => startWatcher(access, watcher), 5000);
      }
    });
    if (watchers.get(access.address) !== watcher || watcher.subscribers === 0) {
      await client.logout().catch(() => client.close());
      return;
    }
    watcher.client = client;
    // With auto-IDLE on, imapflow IDLEs on the open mailbox and reports changes.
    await client.mailboxOpen('INBOX', { readOnly: true });
    clearInterval(watcher.pollTimer);
    watcher.pollTimer = setInterval(() => client.usable && client.noop().catch(() => {}), NOOP_INTERVAL_MS);
  } catch {
    if (watchers.get(access.address) === watcher && watcher.subscribers > 0) setTimeout(() => startWatcher(access, watcher), 30_000);
  }
}

// Subscribes to changes in the mailbox: new mail in the inbox (IDLE) and
// outbox results. Returns an unsubscribe function.
export function watch(access: MailboxAccess, listener: (event: MailEvent) => void): () => void {
  let watcher = watchers.get(access.address);
  if (!watcher) {
    watcher = { emitter: new EventEmitter(), client: null, subscribers: 0 };
    watchers.set(access.address, watcher);
    startWatcher(access, watcher);
  }
  const w = watcher;
  clearTimeout(w.closeTimer);
  w.subscribers++;
  w.emitter.on('event', listener);
  const outbox = (event: MailEvent & { mailbox?: string }) => event.mailbox === access.address && listener(event);
  mailEvents.on('outbox', outbox);

  return () => {
    w.emitter.off('event', listener);
    mailEvents.off('outbox', outbox);
    w.subscribers--;
    if (w.subscribers > 0) return;
    // Keep it briefly in case the page is just reloading.
    w.closeTimer = setTimeout(() => {
      if (w.subscribers > 0) return;
      watchers.delete(access.address);
      clearInterval(w.pollTimer);
      w.client?.logout().catch(() => w.client?.close());
    }, 60_000);
  };
}

// Close idle command connections.
setInterval(() => {
  const now = Date.now();
  for (const [address, entry] of pool) if (now - entry.lastUsed > IDLE_CLOSE_MS) close(address);
}, 60_000).unref();

export function closeAll() {
  for (const address of [...pool.keys()]) close(address);
  for (const w of watchers.values()) w.client?.close();
}
