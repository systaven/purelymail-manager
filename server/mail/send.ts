import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { getDb } from '../db';
import { ApiError, badRequest } from '../errors';
import { decrypt, encrypt } from '../secret';
import { email } from '../validate';
import { fixedAccess, type MailboxAccess } from './access';
import { dropFolderCache, specialFolder } from './messages';
import { inFolder, mailEvents, withImap } from './pool';

// Sending goes through an outbox: every message waits a few seconds (undo
// send) or until its scheduled time, then a background loop sends it over
// SMTP, saves a copy to Sent and removes it from the outbox. Outbox rows are
// encrypted, including the password used to send them.

const SMTP = {
  host: process.env.MAIL_SMTP_HOST || 'smtp.purelymail.com',
  port: Number(process.env.MAIL_SMTP_PORT || 465),
};
// Implicit TLS on 465 by default; STARTTLS otherwise unless MAIL_SMTP_SECURE says so.
const SMTP_SECURE = process.env.MAIL_SMTP_SECURE ? process.env.MAIL_SMTP_SECURE === 'true' : SMTP.port === 465;
const SAVE_SENT = process.env.MAIL_SAVE_SENT !== 'false';
const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024;
const MAX_SCHEDULE_DAYS = 366;

export interface OutgoingAttachment {
  filename: string;
  contentType: string;
  content: string; // base64
}

export interface OutgoingMessage {
  fromName?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  attachments: OutgoingAttachment[];
  // The message being replied to (marked answered once sent) and the draft to discard.
  replyTo?: { folder: string; uid: number };
  draftUid?: number;
}

interface OutboxPayload {
  raw: string; // base64 RFC 822
  envelope: { from: string; to: string[] };
  password: string;
  message: OutgoingMessage;
}

const list = (value: unknown, name: string) => (Array.isArray(value) ? value : []).map((v) => email(v, name));

export function parseOutgoing(body: Record<string, unknown>): OutgoingMessage {
  const attachments = (Array.isArray(body.attachments) ? body.attachments : []).map((a: any) => ({
    filename: String(a?.filename ?? 'attachment').slice(0, 200),
    contentType: String(a?.contentType ?? 'application/octet-stream').slice(0, 100),
    content: String(a?.content ?? ''),
  }));
  const bytes = attachments.reduce((sum, a) => sum + Math.floor((a.content.length * 3) / 4), 0);
  if (bytes > MAX_ATTACHMENTS_BYTES) throw new ApiError('Attachments too large', 413, 'attachments_too_large', { limit: '10 MB' });
  const replyTo = body.replyTo as { folder?: unknown; uid?: unknown } | undefined;
  return {
    fromName: typeof body.fromName === 'string' ? body.fromName.slice(0, 100) : undefined,
    to: list(body.to, 'to'),
    cc: list(body.cc, 'cc'),
    bcc: list(body.bcc, 'bcc'),
    subject: typeof body.subject === 'string' ? body.subject.slice(0, 998) : '',
    html: typeof body.html === 'string' ? body.html : '',
    text: typeof body.text === 'string' ? body.text : '',
    inReplyTo: typeof body.inReplyTo === 'string' ? body.inReplyTo : undefined,
    references: Array.isArray(body.references) ? body.references.filter((r): r is string => typeof r === 'string').slice(0, 50) : undefined,
    attachments,
    replyTo: replyTo && typeof replyTo.folder === 'string' && Number.isInteger(replyTo.uid) ? { folder: replyTo.folder, uid: replyTo.uid as number } : undefined,
    draftUid: Number.isInteger(body.draftUid) ? (body.draftUid as number) : undefined,
  };
}

function compose(address: string, message: OutgoingMessage, { keepBcc = false } = {}): Promise<Buffer> {
  const mail = new MailComposer({
    from: message.fromName ? { name: message.fromName, address } : address,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    html: message.html || undefined,
    text: message.text || undefined,
    inReplyTo: message.inReplyTo,
    references: message.references,
    attachments: message.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.content, 'base64') })),
    messageId: `<${randomUUID()}@${address.split('@')[1]}>`,
    date: new Date(),
  });
  // Drafts keep Bcc so it's still there when the draft is reopened.
  const compiled = mail.compile();
  (compiled as any).keepBcc = keepBcc;
  return compiled.build();
}

// --- Outbox ----------------------------------------------------------------------

export async function enqueue(access: MailboxAccess, clerkUserId: string, message: OutgoingMessage, sendAt: number) {
  const recipients = [...message.to, ...message.cc, ...message.bcc];
  if (!recipients.length) throw badRequest('Add at least one recipient', 'no_recipients');
  if (sendAt > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) throw badRequest('Too far in the future', 'invalid_schedule');
  const raw = await compose(access.address, message);
  const payload: OutboxPayload = {
    raw: raw.toString('base64'),
    envelope: { from: access.address, to: recipients },
    password: await access.password(),
    message,
  };
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO outbox (id, mailbox, clerk_user_id, payload, send_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, access.address, clerkUserId, encrypt(JSON.stringify(payload)), Math.max(sendAt, Date.now()));
  return { id, sendAt: Math.max(sendAt, Date.now()) };
}

interface OutboxRow {
  id: string;
  mailbox: string;
  clerk_user_id: string;
  payload: string;
  send_at: number;
  status: 'queued' | 'sending' | 'failed';
  error: string | null;
}

// Cancels a queued message and gives it back (to reopen in the composer).
export function cancel(address: string, clerkUserId: string, id: string): OutgoingMessage {
  const db = getDb();
  const row = db.prepare("SELECT * FROM outbox WHERE id = ? AND mailbox = ? AND clerk_user_id = ? AND status IN ('queued', 'failed')").get(id, address, clerkUserId) as
    | OutboxRow
    | undefined;
  if (!row) throw new ApiError('Already sent', 409, 'already_sent');
  db.prepare('DELETE FROM outbox WHERE id = ?').run(id);
  return (JSON.parse(decrypt(row.payload)) as OutboxPayload).message;
}

export function listOutbox(address: string, clerkUserId: string) {
  const rows = getDb().prepare('SELECT * FROM outbox WHERE mailbox = ? AND clerk_user_id = ? ORDER BY send_at').all(address, clerkUserId) as unknown as OutboxRow[];
  return rows.map((row) => {
    const { message } = JSON.parse(decrypt(row.payload)) as OutboxPayload;
    return { id: row.id, sendAt: row.send_at, status: row.status, error: row.error, subject: message.subject, to: [...message.to, ...message.cc] };
  });
}

async function deliver(row: OutboxRow) {
  const payload = JSON.parse(decrypt(row.payload)) as OutboxPayload;
  const raw = Buffer.from(payload.raw, 'base64');
  const transport = nodemailer.createTransport({
    host: SMTP.host,
    port: SMTP.port,
    secure: SMTP_SECURE,
    auth: { user: row.mailbox, pass: payload.password },
    connectionTimeout: 20_000,
  });
  try {
    await transport.sendMail({ envelope: payload.envelope, raw });
  } finally {
    transport.close();
  }

  // After-send bookkeeping is best effort: the mail has gone out.
  const access = fixedAccess(row.mailbox, payload.password);
  const { replyTo, draftUid } = payload.message;
  await Promise.allSettled([
    SAVE_SENT ? specialFolder(access, '\\Sent').then((sent) => withImap(access, (c) => c.append(sent, raw, ['\\Seen']))) : null,
    replyTo ? inFolder(access, replyTo.folder, (c) => c.messageFlagsAdd(String(replyTo.uid), ['\\Answered'], { uid: true })) : null,
    draftUid ? specialFolder(access, '\\Drafts').then((drafts) => inFolder(access, drafts, (c) => c.messageDelete(String(draftUid), { uid: true }))) : null,
  ]);
  dropFolderCache(row.mailbox);
}

let running = false;

async function processOutbox() {
  if (running) return;
  running = true;
  const db = getDb();
  try {
    const due = db.prepare("SELECT * FROM outbox WHERE status = 'queued' AND send_at <= ? ORDER BY send_at LIMIT 5").all(Date.now()) as unknown as OutboxRow[];
    for (const row of due) {
      db.prepare("UPDATE outbox SET status = 'sending' WHERE id = ?").run(row.id);
      try {
        await deliver(row);
        db.prepare('DELETE FROM outbox WHERE id = ?').run(row.id);
        mailEvents.emit('outbox', { type: 'outbox', mailbox: row.mailbox, id: row.id, status: 'sent' });
      } catch (error: any) {
        const message = String(error?.response || error?.message || error).slice(0, 300);
        db.prepare("UPDATE outbox SET status = 'failed', error = ? WHERE id = ?").run(message, row.id);
        mailEvents.emit('outbox', { type: 'outbox', mailbox: row.mailbox, id: row.id, status: 'failed', error: message });
      }
    }
  } finally {
    running = false;
  }
}

export function startOutbox() {
  // Anything caught mid-send by a restart is retried.
  getDb().prepare("UPDATE outbox SET status = 'queued' WHERE status = 'sending'").run();
  setInterval(() => processOutbox().catch((e) => console.error('Outbox:', e)), 2000).unref();
}

export function retry(address: string, clerkUserId: string, id: string) {
  const result = getDb()
    .prepare("UPDATE outbox SET status = 'queued', error = NULL, send_at = ? WHERE id = ? AND mailbox = ? AND clerk_user_id = ? AND status = 'failed'")
    .run(Date.now(), id, address, clerkUserId);
  if (!result.changes) throw new ApiError('Not found', 404, 'not_found');
}

// --- Drafts ----------------------------------------------------------------------

// Saves a draft to the Drafts folder, replacing the previous version.
export async function saveDraft(access: MailboxAccess, message: OutgoingMessage, replaceUid?: number): Promise<{ uid: number | null }> {
  const drafts = await specialFolder(access, '\\Drafts');
  const raw = await compose(access.address, message, { keepBcc: true });
  const result = await withImap(access, (c) => c.append(drafts, raw, ['\\Draft', '\\Seen']));
  if (replaceUid) await inFolder(access, drafts, (c) => c.messageDelete(String(replaceUid), { uid: true })).catch(() => {});
  dropFolderCache(access.address);
  return { uid: result && typeof result === 'object' && 'uid' in result ? (result.uid ?? null) : null };
}

export async function deleteDraft(access: MailboxAccess, uid: number) {
  const drafts = await specialFolder(access, '\\Drafts');
  await inFolder(access, drafts, (c) => c.messageDelete(String(uid), { uid: true }));
  dropFolderCache(access.address);
}
