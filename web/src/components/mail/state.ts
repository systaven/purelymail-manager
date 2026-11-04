import { useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useT } from '@/lib/i18n';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { mailApi, mailKeys, type Folder, type MailAction, type MessagePage, type MessageSummary } from '@/lib/mail-api';

export const OUTBOX = ':outbox';
export type ListData = InfiniteData<MessagePage, number>;

// --- URL state -------------------------------------------------------------------

export function useMailParams() {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (patch: Record<string, string | number | null>, replace = false) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace }
      ),
    [setParams]
  );
  return {
    mailbox: params.get('mailbox') ?? '',
    folder: params.get('folder') || 'INBOX',
    q: params.get('q') ?? '',
    open: Number(params.get('open')) || null,
    update,
  };
}

// --- Queries ---------------------------------------------------------------------

export const useFolders = (mailbox: string, poll: boolean) =>
  useQuery({
    queryKey: mailKeys.folders(mailbox),
    queryFn: () => mailApi.folders(mailbox),
    enabled: Boolean(mailbox),
    refetchOnWindowFocus: true,
    refetchInterval: poll ? 60_000 : false,
  });

export const useMessageList = (mailbox: string, folder: string, q: string) =>
  useInfiniteQuery({
    queryKey: mailKeys.messages(mailbox, folder, q),
    queryFn: ({ pageParam }) => mailApi.messages(mailbox, folder, pageParam, q),
    initialPageParam: 0,
    getNextPageParam: (last: MessagePage) => ((last.page + 1) * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled: Boolean(mailbox) && folder !== OUTBOX,
    refetchOnWindowFocus: true,
  });

// Loaded messages of every page, without duplicates (pages shift as mail moves).
export function flatten(data: InfiniteData<MessagePage, unknown> | undefined): MessageSummary[] {
  const seen = new Set<number>();
  const out: MessageSummary[] = [];
  for (const page of data?.pages ?? []) {
    for (const m of page.messages) {
      if (!seen.has(m.uid)) {
        seen.add(m.uid);
        out.push(m);
      }
    }
  }
  return out;
}

// --- Folders ---------------------------------------------------------------------

const FALLBACK: Record<string, string> = { '\\Archive': 'Archive', '\\Trash': 'Trash', '\\Junk': 'Junk', '\\Sent': 'Sent', '\\Drafts': 'Drafts' };

export const specialPath = (folders: Folder[] | undefined, use: string) =>
  folders?.find((f) => f.specialUse === use)?.path ??
  folders?.find((f) => f.path.toLowerCase() === FALLBACK[use]?.toLowerCase())?.path ??
  (use === '\\Inbox' ? 'INBOX' : FALLBACK[use]);

export const specialUseOf = (folders: Folder[] | undefined, path: string) =>
  path.toUpperCase() === 'INBOX' ? '\\Inbox' : (folders?.find((f) => f.path === path)?.specialUse ?? null);

const SPECIAL_LABEL = {
  '\\Inbox': 'inbox',
  '\\Drafts': 'drafts',
  '\\Sent': 'sent',
  '\\Archive': 'archive',
  '\\Junk': 'junk',
  '\\Trash': 'trash',
} as const;

export function useFolderName() {
  const t = useT(mailMessages);
  return useCallback(
    (folder: Pick<Folder, 'path' | 'name' | 'specialUse'> | undefined, path = folder?.path ?? '') => {
      const use = path.toUpperCase() === 'INBOX' ? '\\Inbox' : folder?.specialUse;
      if (use && use in SPECIAL_LABEL) return t(SPECIAL_LABEL[use as keyof typeof SPECIAL_LABEL]);
      if (path === OUTBOX) return t('outbox');
      return folder?.name ?? path.split(/[/.]/).pop() ?? path;
    },
    [t]
  );
}

// --- Formatting -------------------------------------------------------------------

export function shortDate(iso: string, locale: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export const fullDate = (iso: string | number, locale: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const textToHtml = (text: string) => `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;

// --- Cache updates ----------------------------------------------------------------

export function patchLists(qc: QueryClient, mailbox: string, folder: string, fn: (m: MessageSummary) => MessageSummary | null) {
  qc.setQueriesData<ListData>({ queryKey: [...mailKeys.allMessages(mailbox), folder] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => {
            const messages = page.messages.map(fn).filter((m): m is MessageSummary => m !== null);
            return { ...page, messages, total: page.total - (page.messages.length - messages.length) };
          }),
        }
      : data
  );
}

export function patchFolder(qc: QueryClient, mailbox: string, path: string, delta: { total?: number; unseen?: number }) {
  qc.setQueryData<Folder[]>(mailKeys.folders(mailbox), (folders) =>
    folders?.map((f) =>
      f.path === path ? { ...f, total: Math.max(0, f.total + (delta.total ?? 0)), unseen: Math.max(0, f.unseen + (delta.unseen ?? 0)) } : f
    )
  );
}

// A message opened in the reader: the server marked it read.
export function markSeenLocally(qc: QueryClient, mailbox: string, folder: string, uid: number) {
  let changed = false;
  patchLists(qc, mailbox, folder, (m) => {
    if (m.uid !== uid || m.seen) return m;
    changed = true;
    return { ...m, seen: true };
  });
  if (changed) patchFolder(qc, mailbox, folder, { unseen: -1 });
}

const normId = (id: string | null) => (id ?? '').replace(/^<|>$/g, '').toLowerCase();

const INVERSE: Partial<Record<MailAction, MailAction>> = { read: 'unread', unread: 'read', star: 'unstar', unstar: 'star' };

// Read/star/move actions with optimistic cache updates, rollback and Undo toasts.
export function useMailActions(mailbox: string, folder: string, folders: Folder[] | undefined) {
  const qc = useQueryClient();
  const t = useT(mailMessages);
  const errorText = useErrorText();
  const folderName = useFolderName();

  return useCallback(
    async function run(
      messages: MessageSummary[],
      action: MailAction,
      opts: { target?: string; notify?: boolean } = {}
    ): Promise<boolean> {
      if (!messages.length) return false;
      const uids = messages.map((m) => m.uid);
      const set = new Set(uids);
      const destination =
        action === 'archive' ? specialPath(folders, '\\Archive')
        : action === 'trash' ? specialPath(folders, '\\Trash')
        : action === 'spam' ? specialPath(folders, '\\Junk')
        : action === 'notSpam' ? 'INBOX'
        : action === 'move' ? opts.target
        : undefined;
      const removes = action === 'delete' || destination !== undefined;
      const unread = messages.filter((m) => !m.seen).length;

      const listKey = [...mailKeys.allMessages(mailbox), folder];
      await qc.cancelQueries({ queryKey: listKey });
      const snapshot = qc.getQueriesData<ListData>({ queryKey: listKey });
      const folderSnapshot = qc.getQueryData<Folder[]>(mailKeys.folders(mailbox));

      if (removes) {
        patchLists(qc, mailbox, folder, (m) => (set.has(m.uid) ? null : m));
        patchFolder(qc, mailbox, folder, { total: -uids.length, unseen: -unread });
        if (destination) patchFolder(qc, mailbox, destination, { total: uids.length, unseen: unread });
      } else {
        const flag: Partial<MessageSummary> =
          action === 'read' ? { seen: true } : action === 'unread' ? { seen: false } : action === 'star' ? { flagged: true } : { flagged: false };
        patchLists(qc, mailbox, folder, (m) => (set.has(m.uid) ? { ...m, ...flag } : m));
        if (action === 'read') patchFolder(qc, mailbox, folder, { unseen: -unread });
        if (action === 'unread') patchFolder(qc, mailbox, folder, { unseen: messages.length - unread });
      }

      try {
        await mailApi.action(mailbox, folder, uids, action, opts.target);
      } catch (error) {
        snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        qc.setQueryData(mailKeys.folders(mailbox), folderSnapshot);
        toast.error(errorText(error));
        return false;
      } finally {
        qc.invalidateQueries({ queryKey: mailKeys.folders(mailbox) });
        if (destination) qc.invalidateQueries({ queryKey: [...mailKeys.allMessages(mailbox), destination] });
      }
      qc.invalidateQueries({ queryKey: listKey });

      const inverse = INVERSE[action];
      if (inverse) {
        if (opts.notify) {
          toast.success(t(`done_${action}` as 'done_read'), {
            action: { label: t('undo'), onClick: () => void run(messages, inverse) },
          });
        }
        return true;
      }
      if (action === 'delete') {
        toast.success(t('done_delete'));
        return true;
      }
      const label =
        action === 'move' ? t('done_move', { folder: folderName(folders?.find((f) => f.path === destination), destination) }) : t(`done_${action}` as 'done_archive');
      toast.success(label, {
        action: {
          label: t('undo'),
          onClick: async () => {
            // The moved copies get new uids in the destination; find them by Message-ID.
            try {
              const page = await mailApi.messages(mailbox, destination!, 0, '');
              const ids = new Set(messages.map((m) => normId(m.messageId)).filter(Boolean));
              const keys = new Set(messages.filter((m) => !m.messageId).map((m) => `${m.subject}|${m.date}`));
              const found = page.messages
                .filter((m) => (m.messageId ? ids.has(normId(m.messageId)) : keys.has(`${m.subject}|${m.date}`)))
                .slice(0, messages.length);
              if (!found.length) throw new Error(t('undoFailed'));
              await mailApi.action(mailbox, destination!, found.map((m) => m.uid), 'move', folder);
              toast.success(t('undone'));
            } catch (error) {
              toast.error(errorText(error));
            } finally {
              qc.invalidateQueries({ queryKey: mailKeys.allMessages(mailbox) });
              qc.invalidateQueries({ queryKey: mailKeys.folders(mailbox) });
            }
          },
        },
      });
      return true;
    },
    [qc, mailbox, folder, folders, t, errorText, folderName]
  );
}

export type RunAction = ReturnType<typeof useMailActions>;
