import type { FetchMessageObject, ImapFlow, MessageStructureObject, SearchObject } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import { ApiError } from '../errors';
import type { MailboxAccess } from './access';
import { inFolder, withImap } from './pool';

export interface Address {
  name: string;
  address: string;
}

export interface Folder {
  path: string;
  name: string;
  delimiter: string;
  specialUse: string | null;
  total: number;
  unseen: number;
}

export interface MessageSummary {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  from: Address[];
  to: Address[];
  cc: Address[];
  date: string;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  hasAttachments: boolean;
  size: number;
  preview: string;
}

export interface Attachment {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  inline: boolean;
}

export interface MessageDetail extends Omit<MessageSummary, 'preview'> {
  replyTo: Address[];
  bcc: Address[];
  html: string | null;
  text: string;
  blockedImages: number;
  attachments: Attachment[];
  listUnsubscribe: string | null;
}

export type Action = 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'trash' | 'delete' | 'spam' | 'notSpam' | 'move';

const PAGE_SIZE = 50;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

// --- Folders -------------------------------------------------------------------

const SPECIAL_ORDER = ['\\Inbox', '\\Drafts', '\\Sent', '\\Archive', '\\Junk', '\\Trash'];
const folderCache = new Map<string, { at: number; folders: Folder[] }>();

export function listFolders(access: MailboxAccess, fresh = false): Promise<Folder[]> {
  const cached = folderCache.get(access.address);
  if (!fresh && cached && Date.now() - cached.at < 15_000) return Promise.resolve(cached.folders);
  return withImap(access, async (client) => {
    const list = await client.list({ statusQuery: { messages: true, unseen: true } });
    const folders = list
      .filter((f) => !f.flags.has('\\Noselect') && !f.flags.has('\\NonExistent'))
      .map((f) => ({
        path: f.path,
        name: f.name,
        delimiter: f.delimiter,
        specialUse: f.path.toUpperCase() === 'INBOX' ? '\\Inbox' : (f.specialUse ?? null),
        total: f.status?.messages ?? 0,
        unseen: f.status?.unseen ?? 0,
      }))
      .sort((a, b) => {
        const ia = a.specialUse ? SPECIAL_ORDER.indexOf(a.specialUse) : -1;
        const ib = b.specialUse ? SPECIAL_ORDER.indexOf(b.specialUse) : -1;
        if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.path.localeCompare(b.path);
      });
    folderCache.set(access.address, { at: Date.now(), folders });
    return folders;
  });
}

const FALLBACK_NAMES: Record<string, string[]> = {
  '\\Trash': ['Trash', 'Deleted Messages', 'Deleted Items'],
  '\\Junk': ['Junk', 'Spam'],
  '\\Archive': ['Archive'],
  '\\Sent': ['Sent', 'Sent Messages', 'Sent Items'],
  '\\Drafts': ['Drafts'],
};

// The folder with a special use, creating it if the account has none.
export async function specialFolder(access: MailboxAccess, use: keyof typeof FALLBACK_NAMES): Promise<string> {
  const folders = await listFolders(access);
  const found = folders.find((f) => f.specialUse === use) ?? folders.find((f) => FALLBACK_NAMES[use].some((n) => n.toLowerCase() === f.path.toLowerCase()));
  if (found) return found.path;
  const path = FALLBACK_NAMES[use][0];
  await withImap(access, (client) => client.mailboxCreate(path));
  folderCache.delete(access.address);
  return path;
}

// --- Search ----------------------------------------------------------------------

// Gmail-style query: from: to: subject: has:attachment is:unread|read|starred
// before:/after:YYYY-MM-DD, "quoted phrases"; other words search the whole message.
export function parseQuery(query: string): SearchObject {
  const search: SearchObject = {};
  const words: string[] = [];
  const tokens = query.match(/(\w+:)?("[^"]*"|\S+)/g) ?? [];
  for (const token of tokens) {
    const m = token.match(/^(\w+):(.+)$/);
    const value = (m ? m[2] : token).replace(/^"|"$/g, '');
    const key = m?.[1].toLowerCase();
    const date = () => {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new ApiError('Invalid date in search', 400, 'invalid_search');
      return d;
    };
    switch (key) {
      case 'from': search.from = value; break;
      case 'to': search.to = value; break;
      case 'cc': search.cc = value; break;
      case 'subject': search.subject = value; break;
      case 'before': search.before = date(); break;
      case 'after': case 'since': search.since = date(); break;
      case 'has':
        if (value === 'attachment') search.header = { 'content-type': 'multipart/mixed' };
        break;
      case 'is':
        if (value === 'unread') search.seen = false;
        else if (value === 'read') search.seen = true;
        else if (value === 'starred' || value === 'flagged') search.flagged = true;
        else if (value === 'answered') search.answered = true;
        break;
      default:
        words.push(m ? token : value);
    }
  }
  if (words.length) search.text = words.join(' ');
  return Object.keys(search).length ? search : { all: true };
}

// --- Previews ------------------------------------------------------------------

function findTextPart(node: MessageStructureObject | undefined): MessageStructureObject | null {
  if (!node) return null;
  if (node.childNodes?.length) {
    for (const type of ['text/plain', 'text/html']) {
      const queue = [...node.childNodes];
      while (queue.length) {
        const child = queue.shift()!;
        if (child.childNodes) queue.unshift(...child.childNodes);
        else if (child.type === type && child.disposition !== 'attachment') return child;
      }
    }
    return null;
  }
  return node.type.startsWith('text/') ? { ...node, part: node.part ?? '1' } : null;
}

function hasAttachment(node: MessageStructureObject | undefined): boolean {
  if (!node) return false;
  if (node.disposition === 'attachment') return true;
  return (node.childNodes ?? []).some(hasAttachment);
}

function decodeQuotedPrintable(input: string): Buffer {
  const bytes: number[] = [];
  const text = input.replace(/=\r?\n/g, '');
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(text[i], 'utf8'));
    }
  }
  return Buffer.from(bytes);
}

function decodeCharset(buffer: Buffer, charset = 'utf-8'): string {
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function previewText(raw: Buffer, part: MessageStructureObject, alreadyDecoded: boolean): string {
  let bytes = raw;
  if (!alreadyDecoded) {
    const encoding = (part.encoding ?? '').toLowerCase();
    if (encoding === 'base64') {
      const clean = raw.toString('ascii').replace(/[^A-Za-z0-9+/]/g, '');
      bytes = Buffer.from(clean.slice(0, clean.length - (clean.length % 4)), 'base64');
    } else if (encoding === 'quoted-printable') {
      bytes = decodeQuotedPrintable(raw.toString('latin1'));
    }
  }
  let text = decodeCharset(bytes, part.parameters?.charset);
  if (part.type === 'text/html') {
    text = text
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"');
  }
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/�/g, '')
    .trim()
    .slice(0, 180);
}

// --- Listing -------------------------------------------------------------------

const addresses = (list?: { name?: string; address?: string }[]): Address[] =>
  (list ?? []).map((a) => ({ name: a.name ?? '', address: (a.address ?? '').toLowerCase() }));

function parseReferences(headers?: Buffer): string[] {
  if (!headers) return [];
  const value = headers.toString('utf8').replace(/\r?\n[ \t]+/g, ' ').match(/^references:\s*(.*)$/im)?.[1] ?? '';
  return value.match(/<[^>]+>/g) ?? [];
}

function summarize(msg: FetchMessageObject, preview = ''): MessageSummary {
  const env = msg.envelope ?? {};
  return {
    uid: msg.uid,
    messageId: env.messageId ?? null,
    inReplyTo: env.inReplyTo ?? null,
    references: parseReferences(msg.headers),
    subject: env.subject ?? '',
    from: addresses(env.from),
    to: addresses(env.to),
    cc: addresses(env.cc),
    date: new Date((env.date as string | Date | undefined) ?? msg.internalDate ?? Date.now()).toISOString(),
    seen: msg.flags?.has('\\Seen') ?? false,
    flagged: msg.flags?.has('\\Flagged') ?? false,
    answered: msg.flags?.has('\\Answered') ?? false,
    draft: msg.flags?.has('\\Draft') ?? false,
    hasAttachments: hasAttachment(msg.bodyStructure),
    size: msg.size ?? 0,
    preview,
  };
}

async function fetchSummaries(client: ImapFlow, uids: number[]): Promise<MessageSummary[]> {
  if (!uids.length) return [];
  const range = uids.join(',');
  const messages: FetchMessageObject[] = [];
  for await (const msg of client.fetch(range, { uid: true, flags: true, envelope: true, internalDate: true, size: true, bodyStructure: true, headers: ['references'] }, { uid: true })) {
    messages.push(msg);
  }

  // Second round: the first few hundred bytes of each text part, for previews.
  const parts = new Map<number, MessageStructureObject>();
  for (const msg of messages) {
    const part = findTextPart(msg.bodyStructure);
    if (part?.part) parts.set(msg.uid, part);
  }
  const previews = new Map<number, string>();
  // Group by part key so each FETCH asks for the same part.
  const byKey = new Map<string, number[]>();
  for (const [uid, part] of parts) byKey.set(part.part!, [...(byKey.get(part.part!) ?? []), uid]);
  for (const [key, keyUids] of byKey) {
    try {
      for await (const msg of client.fetch(keyUids.join(','), { uid: true, bodyParts: [{ key, start: 0, maxLength: 2048 }] }, { uid: true })) {
        const raw = msg.bodyParts?.get(key);
        const part = parts.get(msg.uid);
        if (raw && part) previews.set(msg.uid, previewText(raw, part, msg.binaryParts?.has(key) ?? false));
      }
    } catch {
      // Previews are optional.
    }
  }

  const byUid = new Map(messages.map((m) => [m.uid, m]));
  return uids.filter((uid) => byUid.has(uid)).map((uid) => summarize(byUid.get(uid)!, previews.get(uid) ?? ''));
}

export interface MessagePage {
  messages: MessageSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export function listMessages(access: MailboxAccess, folder: string, { page = 0, query = '' }: { page?: number; query?: string }): Promise<MessagePage> {
  return inFolder(access, folder, async (client) => {
    const found = (await client.search(parseQuery(query), { uid: true })) || [];
    const uids = [...found].sort((a, b) => b - a);
    const slice = uids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const messages = await fetchSummaries(client, slice);
    return { messages, total: uids.length, page, pageSize: PAGE_SIZE };
  });
}

// --- A single message ----------------------------------------------------------------

const SAFE_TAGS = sanitizeHtml.defaults.allowedTags.concat([
  'img', 'style', 'center', 'font', 'span', 'div', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col', 'hr', 'u', 's', 'sup', 'sub', 'small', 'big',
]);

function sanitize(html: string, cid: Map<string, string>, allowImages: boolean) {
  let blocked = 0;
  const clean = sanitizeHtml(html, {
    allowedTags: SAFE_TAGS,
    disallowedTagsMode: 'discard',
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'bgcolor', 'color', 'border', 'cellpadding', 'cellspacing', 'dir', 'lang', 'title'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      font: ['face', 'size', 'color'],
      td: ['colspan', 'rowspan', 'style', 'width', 'height', 'bgcolor', 'align', 'valign'],
      th: ['colspan', 'rowspan', 'style', 'width', 'height', 'bgcolor', 'align', 'valign'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'cid'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowVulnerableTags: true, // <style> is allowed; the sandboxed iframe and its CSP contain it
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? '';
        if (src.startsWith('cid:')) return { tagName, attribs: { ...attribs, src: cid.get(src.slice(4).replace(/^<|>$/g, '')) ?? '' } };
        if (/^https?:/i.test(src) && !allowImages) {
          blocked++;
          return { tagName, attribs: { ...attribs, src: '', 'data-blocked': '1' } };
        }
        return { tagName, attribs };
      },
    },
  });
  return { html: clean, blocked };
}

const addressList = (value?: AddressObject | AddressObject[]): Address[] =>
  (Array.isArray(value) ? value : value ? [value] : []).flatMap((a) => addresses(a.value));

async function fetchSource(client: ImapFlow, uid: number): Promise<{ source: Buffer; flags: Set<string> }> {
  const msg = await client.fetchOne(String(uid), { uid: true, source: true, flags: true, size: true }, { uid: true });
  if (!msg || !msg.source) throw new ApiError('Message not found', 404, 'message_not_found');
  if ((msg.size ?? 0) > MAX_SOURCE_BYTES) throw new ApiError('Message too large to open here', 413, 'message_too_large');
  return { source: msg.source, flags: msg.flags ?? new Set() };
}

export function getMessage(access: MailboxAccess, folder: string, uid: number, allowImages: boolean): Promise<MessageDetail> {
  return inFolder(access, folder, async (client) => {
    const { source, flags } = await fetchSource(client, uid);
    const parsed = await simpleParser(source, { skipTextToHtml: true, skipImageLinks: true });

    // Inline (cid:) images become data URLs so they show without remote loads.
    const cid = new Map<string, string>();
    for (const a of parsed.attachments) {
      if (a.contentId && a.contentType.startsWith('image/') && a.size < 2 * 1024 * 1024) {
        cid.set(a.contentId.replace(/^<|>$/g, ''), `data:${a.contentType};base64,${a.content.toString('base64')}`);
      }
    }
    const { html, blocked } = parsed.html ? sanitize(parsed.html, cid, allowImages) : { html: null, blocked: 0 };

    if (!flags.has('\\Seen')) {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      flags.add('\\Seen');
    }

    const refs = parsed.references;
    // mailparser groups List-* headers: { unsubscribe: { url, mail } }.
    const list = parsed.headers.get('list') as { unsubscribe?: { url?: string; mail?: string } } | undefined;
    const unsubscribe = list?.unsubscribe?.url ?? (list?.unsubscribe?.mail ? `mailto:${list.unsubscribe.mail}` : null);
    return {
      uid,
      messageId: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      references: Array.isArray(refs) ? refs : refs ? refs.split(/\s+/) : [],
      subject: parsed.subject ?? '',
      from: addressList(parsed.from),
      to: addressList(parsed.to),
      cc: addressList(parsed.cc),
      bcc: addressList(parsed.bcc),
      replyTo: addressList(parsed.replyTo),
      date: (parsed.date ?? new Date()).toISOString(),
      seen: true,
      flagged: flags.has('\\Flagged'),
      answered: flags.has('\\Answered'),
      draft: flags.has('\\Draft'),
      hasAttachments: parsed.attachments.some((a) => !a.related),
      size: source.length,
      html,
      text: parsed.text ?? '',
      blockedImages: blocked,
      attachments: parsed.attachments.map((a, index) => ({
        index,
        filename: a.filename || `attachment-${index + 1}`,
        contentType: a.contentType,
        size: a.size,
        inline: Boolean(a.related && a.contentId && cid.has(a.contentId.replace(/^<|>$/g, ''))),
      })),
      listUnsubscribe: unsubscribe ?? null,
    };
  });
}

export function getAttachment(access: MailboxAccess, folder: string, uid: number, index: number) {
  return inFolder(access, folder, async (client) => {
    const { source } = await fetchSource(client, uid);
    const parsed = await simpleParser(source, { skipTextToHtml: true, skipImageLinks: true });
    const a = parsed.attachments[index];
    if (!a) throw new ApiError('Attachment not found', 404, 'attachment_not_found');
    return { filename: a.filename || `attachment-${index + 1}`, contentType: a.contentType, content: a.content };
  });
}

// The raw message, for "show original" and forwarding as an attachment.
export const getSource = (access: MailboxAccess, folder: string, uid: number) =>
  inFolder(access, folder, async (client) => (await fetchSource(client, uid)).source);

// --- Actions -------------------------------------------------------------------

export async function applyAction(access: MailboxAccess, folder: string, uids: number[], action: Action, target?: string) {
  if (!uids.length) return;
  const range = uids.join(',');
  const destinations: Partial<Record<Action, () => Promise<string>>> = {
    archive: () => specialFolder(access, '\\Archive'),
    trash: () => specialFolder(access, '\\Trash'),
    spam: () => specialFolder(access, '\\Junk'),
    notSpam: async () => 'INBOX',
    move: async () => {
      if (!target) throw new ApiError('Missing target folder', 400, 'missing_field', { name: 'target' });
      if (!(await listFolders(access)).some((f) => f.path === target)) throw new ApiError('No such folder', 404, 'not_found');
      return target;
    },
  };
  const destination = await destinations[action]?.();

  await inFolder(access, folder, async (client) => {
    switch (action) {
      case 'read': return void (await client.messageFlagsAdd(range, ['\\Seen'], { uid: true }));
      case 'unread': return void (await client.messageFlagsRemove(range, ['\\Seen'], { uid: true }));
      case 'star': return void (await client.messageFlagsAdd(range, ['\\Flagged'], { uid: true }));
      case 'unstar': return void (await client.messageFlagsRemove(range, ['\\Flagged'], { uid: true }));
      case 'delete': return void (await client.messageDelete(range, { uid: true }));
      default:
        if (destination && destination !== folder) await client.messageMove(range, destination, { uid: true });
    }
  });
  folderCache.delete(access.address);
}

export const dropFolderCache = (address: string) => folderCache.delete(address);
