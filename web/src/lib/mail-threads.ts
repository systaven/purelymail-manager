import type { Address, MessageSummary } from './mail-api';

// Groups a folder's loaded messages into conversations: messages linked by
// Message-ID / In-Reply-To / References (union-find), and, for messages with
// no such headers, by normalized subject.

export interface Thread {
  id: string; // smallest uid: stable while the thread stays loaded
  messages: MessageSummary[]; // oldest first
  latest: MessageSummary;
  uids: number[];
  unread: number;
  flagged: boolean;
  hasAttachments: boolean;
}

const PREFIX = /^\s*((re|fwd?|aw|wg|sv|vs|antw|rif|tr|r|回复|回覆|答复|答覆|转发|轉寄|转寄|轉發|返信|転送)\s*(\[\d+\])?\s*[:：]\s*)+/i;

export const normalizeSubject = (subject: string) => subject.replace(PREFIX, '').trim().toLowerCase().replace(/\s+/g, ' ');

const normId = (id: string | null | undefined) => (id ? id.trim().replace(/^<|>$/g, '').toLowerCase() : '');

export function buildThreads(messages: MessageSummary[], conversations = true): Thread[] {
  const make = (list: MessageSummary[]): Thread => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.uid - b.uid);
    return {
      id: String(Math.min(...sorted.map((m) => m.uid))),
      messages: sorted,
      latest: sorted[sorted.length - 1],
      uids: sorted.map((m) => m.uid),
      unread: sorted.filter((m) => !m.seen).length,
      flagged: sorted.some((m) => m.flagged),
      hasAttachments: sorted.some((m) => m.hasAttachments),
    };
  };
  if (!conversations) return messages.map((m) => make([m]));

  const parent = messages.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // Every message id (own or referenced) joins the group of the first message that mentions it.
  const owner = new Map<string, number>();
  const bySubject = new Map<string, number>();
  messages.forEach((m, i) => {
    const ids = [m.messageId, m.inReplyTo, ...m.references].map(normId).filter(Boolean);
    for (const id of ids) {
      const o = owner.get(id);
      if (o === undefined) owner.set(id, i);
      else union(o, i);
    }
  });
  // Replies without thread headers fall back to the subject (but two
  // newsletters with the same subject stay apart).
  messages.forEach((m, i) => {
    const subject = normalizeSubject(m.subject);
    if (subject && !bySubject.has(subject)) bySubject.set(subject, i);
  });
  messages.forEach((m, i) => {
    if (m.inReplyTo || m.references.length) return;
    if (m.messageId && !PREFIX.test(m.subject)) return;
    const o = bySubject.get(normalizeSubject(m.subject));
    if (o !== undefined) union(o, i);
  });

  const groups = new Map<number, MessageSummary[]>();
  messages.forEach((m, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(m);
    else groups.set(root, [m]);
  });
  // Same order as the list (newest uid first).
  const newest = (t: Thread) => Math.max(...t.uids);
  return [...groups.values()].map(make).sort((a, b) => newest(b) - newest(a));
}

export const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const displayName = (a: Address) => a.name?.trim() || a.address.split('@')[0] || a.address;
