import { api } from './api';

// Types and calls for /api/mail (webmail). Server: server/routes/mail.ts.

export interface Address {
  name: string;
  address: string;
}

export interface Folder {
  path: string;
  name: string;
  delimiter: string;
  specialUse: string | null; // '\\Inbox' | '\\Drafts' | '\\Sent' | '\\Archive' | '\\Junk' | '\\Trash' | null
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
  date: string; // ISO
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  hasAttachments: boolean;
  size: number;
  preview: string;
}

export interface MessagePage {
  messages: MessageSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Attachment {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  // Already shown inside the HTML body (cid: image).
  inline: boolean;
}

export interface MessageDetail extends Omit<MessageSummary, 'preview'> {
  replyTo: Address[];
  bcc: Address[];
  html: string | null; // sanitized; render only in a sandboxed iframe
  text: string;
  blockedImages: number;
  attachments: Attachment[];
  listUnsubscribe: string | null;
}

export type MailAction = 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'trash' | 'delete' | 'spam' | 'notSpam' | 'move';

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
  replyTo?: { folder: string; uid: number };
  draftUid?: number;
}

export interface OutboxItem {
  id: string;
  sendAt: number; // ms
  status: 'queued' | 'sending' | 'failed';
  error: string | null;
  subject: string;
  to: string[];
}

export type MailEvent =
  | { type: 'inbox'; reason: 'exists' | 'expunge' | 'flags' }
  | { type: 'outbox'; id: string; status: 'sent' | 'failed'; error?: string };

export const mailKeys = {
  mailboxes: ['mail', 'mailboxes'] as const,
  folders: (mailbox: string) => ['mail', mailbox, 'folders'] as const,
  messages: (mailbox: string, folder: string, query: string) => ['mail', mailbox, 'messages', folder, query] as const,
  // Prefix for invalidating every list of a mailbox.
  allMessages: (mailbox: string) => ['mail', mailbox, 'messages'] as const,
  message: (mailbox: string, folder: string, uid: number, images: boolean) => ['mail', mailbox, 'message', folder, uid, images] as const,
  outbox: (mailbox: string) => ['mail', mailbox, 'outbox'] as const,
};

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();

export const mailApi = {
  mailboxes: () => api<string[]>('/mail/mailboxes'),
  folders: (mailbox: string, fresh = false) => api<Folder[]>(`/mail/folders?${qs({ mailbox, fresh: fresh ? 1 : undefined })}`),
  createFolder: (mailbox: string, path: string) => api<Folder[]>('/mail/folders', { body: { mailbox, path } }),
  messages: (mailbox: string, folder: string, page: number, q: string) => api<MessagePage>(`/mail/messages?${qs({ mailbox, folder, page, q })}`),
  message: (mailbox: string, folder: string, uid: number, images = false) =>
    api<MessageDetail>(`/mail/message?${qs({ mailbox, folder, uid, images: images ? 1 : undefined })}`),
  attachmentUrl: (mailbox: string, folder: string, uid: number, index: number, inline = false) =>
    `/api/mail/attachment?${qs({ mailbox, folder, uid, index, inline: inline ? 1 : undefined })}`,
  action: (mailbox: string, folder: string, uids: number[], action: MailAction, target?: string) =>
    api('/mail/actions', { body: { mailbox, folder, uids, action, target } }),
  eventsUrl: (mailbox: string) => `/api/mail/events?${qs({ mailbox })}`,

  // Sending goes through the outbox: delaySeconds gives an undo window,
  // sendAt (ms) schedules it.
  send: (mailbox: string, message: OutgoingMessage, opts: { delaySeconds?: number; sendAt?: number } = {}) =>
    api<{ id: string; sendAt: number }>('/mail/send', { body: { mailbox, message, ...opts } }),
  outbox: (mailbox: string) => api<OutboxItem[]>(`/mail/outbox?${qs({ mailbox })}`),
  cancelSend: (mailbox: string, id: string) => api<OutgoingMessage>(`/mail/outbox/${id}?${qs({ mailbox })}`, { method: 'DELETE' }),
  retrySend: (mailbox: string, id: string) => api(`/mail/outbox/${id}/retry?${qs({ mailbox })}`, { method: 'POST' }),

  saveDraft: (mailbox: string, message: OutgoingMessage, replaceUid?: number) =>
    api<{ uid: number | null }>('/mail/drafts', { body: { mailbox, message, replaceUid } }),
  deleteDraft: (mailbox: string, uid: number) => api(`/mail/drafts/${uid}?${qs({ mailbox })}`, { method: 'DELETE' }),
  signOut: (mailbox: string) => api('/mail/signout', { body: { mailbox } }),
};

// Bridge between the mail view and the composer (components/compose). The
// view calls openComposer(); <ComposerHost /> renders the composer windows.
export type ComposeRequest =
  | { mode: 'new'; mailbox: string; to?: string[] }
  | { mode: 'reply' | 'replyAll' | 'forward'; mailbox: string; folder: string; message: MessageDetail }
  // Reopen a draft from the Drafts folder, or a message whose send was undone.
  | { mode: 'draft'; mailbox: string; draftUid?: number; message: OutgoingMessage };

type Listener = (request: ComposeRequest) => void;
const listeners = new Set<Listener>();
export const openComposer = (request: ComposeRequest) => listeners.forEach((l) => l(request));
export const onComposeRequest = (listener: Listener) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
