import type { Address, Attachment, ComposeRequest, MessageDetail, OutgoingAttachment } from '@/lib/mail-api';

// Pure helpers: addresses, reply/forward construction and HTML → text.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// Same rule as the server (server/validate.ts).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => EMAIL_RE.test(value);

export const formatAddress = (a: Address) => (a.name && a.name !== a.address ? `${a.name} <${a.address}>` : a.address);

// "Ann <ann@x.org>, bob@y.com; "Doe, J" <j@z.io>" → addresses (with names when given).
export function parseAddresses(text: string): Address[] {
  const out: Address[] = [];
  const re = /(?:"([^"]*)"|([^<>,;"]*?))\s*<([^<>]+)>|([^\s,;<>"]+)/g;
  for (const m of text.matchAll(re)) {
    if (m[3]) out.push({ name: (m[1] ?? m[2] ?? '').trim(), address: m[3].trim().toLowerCase() });
    else if (m[4]) out.push({ name: '', address: m[4].replace(/^mailto:/i, '').toLowerCase() });
  }
  return out;
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const formatBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

export const formatDate = (date: Date | string | number, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));

// The quoted original lives outside the editor in this wrapper, so it's sent
// untouched; the class survives the server's sanitizer when a draft is reopened.
export const QUOTE_CLASS = 'pm-quote';

export function splitQuote(html: string): { body: string; quote: string } {
  if (!html.includes(QUOTE_CLASS)) return { body: html, quote: '' };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const quote = doc.querySelector(`div.${QUOTE_CLASS}`);
  if (!quote) return { body: html, quote: '' };
  const quoteHtml = quote.outerHTML;
  quote.remove();
  return { body: doc.body.innerHTML, quote: quoteHtml };
}

const stripStyles = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, '');

const originalBody = (m: MessageDetail) => (m.html ? stripStyles(m.html) : escapeHtml(m.text || '').replace(/\r?\n/g, '<br>'));

export function signatureHtml(signature: string) {
  const sig = signature.trim();
  return sig ? `<p></p><p>-- <br>${escapeHtml(sig).replace(/\r?\n/g, '<br>')}</p>` : '';
}

export interface ComposeLabels {
  wrote: (date: string, sender: string) => string;
  forwardedHeader: string;
  from: string;
  date: string;
  subject: string;
  to: string;
  cc: string;
  locale: string;
}

export interface ComposeMeta {
  inReplyTo?: string;
  references?: string[];
  replyTo?: { folder: string; uid: number };
}

export interface InitialState {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  quote: string;
  meta: ComposeMeta;
  draftUid?: number;
  attachments: OutgoingAttachment[];
  // Original attachments to fetch when forwarding.
  forward?: { folder: string; uid: number; attachments: Attachment[] };
  participants: Address[];
  focus: 'to' | 'body';
}

const dedupe = (list: string[], exclude: Iterable<string> = []) => {
  const seen = new Set([...exclude].map((a) => a.toLowerCase()));
  return list.filter((a) => {
    const key = a.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const prefixed = (subject: string, prefix: string, re: RegExp) => (re.test(subject.trim()) ? subject.trim() : `${prefix} ${subject.trim()}`.trim());

export function buildInitial(request: ComposeRequest, signature: string, labels: ComposeLabels): InitialState {
  const sig = signatureHtml(signature);
  const empty: InitialState = { to: [], cc: [], bcc: [], subject: '', body: '', quote: '', meta: {}, attachments: [], participants: [], focus: 'to' };

  if (request.mode === 'new') return { ...empty, to: request.to ?? [], body: sig, focus: request.to?.length ? 'body' : 'to' };

  if (request.mode === 'draft') {
    const m = request.message;
    const { body, quote } = splitQuote(m.html || escapeHtml(m.text || '').replace(/\r?\n/g, '<br>'));
    return {
      ...empty,
      to: m.to,
      cc: m.cc,
      bcc: m.bcc,
      subject: m.subject,
      body,
      quote,
      meta: { inReplyTo: m.inReplyTo, references: m.references, replyTo: m.replyTo },
      draftUid: request.draftUid ?? m.draftUid,
      attachments: m.attachments,
      focus: m.to.length ? 'body' : 'to'
    };
  }

  const m = request.message;
  const me = request.mailbox.toLowerCase();
  const participants = [...m.from, ...m.replyTo, ...m.to, ...m.cc].filter((a) => a.address.toLowerCase() !== me);
  const dateText = formatDate(m.date, labels.locale);

  if (request.mode === 'forward') {
    const list = (as: Address[]) => escapeHtml(as.map(formatAddress).join(', '));
    const header = [
      labels.forwardedHeader,
      `${labels.from}: ${list(m.from)}`,
      `${labels.date}: ${escapeHtml(dateText)}`,
      `${labels.subject}: ${escapeHtml(m.subject)}`,
      `${labels.to}: ${list(m.to)}`,
      ...(m.cc.length ? [`${labels.cc}: ${list(m.cc)}`] : [])
    ].join('<br>');
    return {
      ...empty,
      subject: prefixed(m.subject, 'Fwd:', /^(fwd?|转发|轉寄|転送|wg)\s*[:：]/i),
      body: sig,
      quote: `<div class="${QUOTE_CLASS}"><p>${header}</p><br>${originalBody(m)}</div>`,
      forward: { folder: request.folder, uid: m.uid, attachments: m.attachments },
      participants
    };
  }

  // Reply / reply all. Replying to our own sent message goes to its recipients.
  const primary = (m.replyTo.length ? m.replyTo : m.from).map((a) => a.address);
  const fromMe = primary.every((a) => a.toLowerCase() === me);
  let to = dedupe(fromMe ? m.to.map((a) => a.address) : primary, [me]);
  let cc: string[] = [];
  if (request.mode === 'replyAll') {
    to = dedupe([...to, ...m.to.map((a) => a.address)], [me]);
    cc = dedupe(
      m.cc.map((a) => a.address),
      [me, ...to]
    );
  }
  const sender = m.from[0] ? formatAddress(m.from[0]) : '';
  return {
    ...empty,
    to,
    cc,
    subject: prefixed(m.subject, 'Re:', /^(re|回复|回覆|答复|aw|sv|antw)\s*[:：]/i),
    body: `<p></p>${sig}`,
    quote:
      `<div class="${QUOTE_CLASS}"><p>${escapeHtml(labels.wrote(dateText, sender))}</p>` +
      `<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${originalBody(m)}</blockquote></div>`,
    meta: {
      inReplyTo: m.messageId ?? undefined,
      references: m.messageId ? [...m.references, m.messageId] : m.references,
      replyTo: { folder: request.folder, uid: m.uid }
    },
    participants,
    focus: 'body'
  };
}

// Tiptap paragraphs are lines (no margins in the editor); keep that look in mail clients.
export const finalizeHtml = (html: string) => html.replace(/<p><\/p>/g, '<p><br></p>').replace(/<p>/g, '<p style="margin:0">');

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'TR', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);

// Plain-text alternative: blocks → line breaks, links → "text (url)", quotes → "> ".
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style,script,head').forEach((n) => n.remove());

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const inner = () => [...el.childNodes].map(walk).join('');
    switch (el.tagName) {
      case 'BR':
        return '\n';
      case 'HR':
        return '\n---\n';
      case 'IMG':
        return el.getAttribute('alt') ?? '';
      case 'A': {
        const text = inner();
        const href = el.getAttribute('href') ?? '';
        const plainHref = href.replace(/^mailto:/i, '');
        return href && !href.startsWith('#') && plainHref !== text.trim() ? `${text} (${plainHref})` : text;
      }
      case 'LI': {
        const parent = el.parentElement;
        const marker = parent?.tagName === 'OL' ? `${[...parent.children].indexOf(el) + 1}. ` : '- ';
        return `\n${marker}${inner().trim()}`;
      }
      case 'TD':
      case 'TH':
        return `${inner()} `;
      case 'BLOCKQUOTE': {
        const text = tidy(inner());
        return `\n${text
          .split('\n')
          .map((line) => (line ? `> ${line}` : '>'))
          .join('\n')}\n`;
      }
      default:
        return BLOCKS.has(el.tagName) ? `\n${inner()}\n` : inner();
    }
  };
  return tidy(walk(doc.body));
}

function tidy(text: string) {
  return text
    .split('\n')
    .map((line) => line.replace(/^ +| +$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Paragraph boundaries are single line breaks in our editor (Gmail-style lines).
export const editorHtmlToText = (html: string) => htmlToText(html.replace(/<\/p>\s*<p[^>]*>/g, '<br>'));

const ATTACH_RE = /attach|附件|添付|附檔/i;
export const mentionsAttachment = (text: string) => ATTACH_RE.test(text);
