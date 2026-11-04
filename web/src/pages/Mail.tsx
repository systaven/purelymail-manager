import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, SquarePen } from 'lucide-react';
import { Dialog as DrawerPrimitive } from 'radix-ui';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useMailEvents, useNotificationSetting } from '@/components/mail/events';
import { FolderPane } from '@/components/mail/FolderPane';
import { ListSkeleton, MessageList, type ActKind } from '@/components/mail/MessageList';
import { OutboxView } from '@/components/mail/OutboxView';
import { Reader, ReaderPlaceholder, type ReplyMode } from '@/components/mail/Reader';
import { ShortcutsDialog } from '@/components/mail/ShortcutsDialog';
import {
  flatten,
  OUTBOX,
  specialUseOf,
  textToHtml,
  useFolderName,
  useFolders,
  useMailActions,
  useMailParams,
  useMessageList,
} from '@/components/mail/state';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { mailApi, mailKeys, openComposer, type MailAction, type MessageDetail, type MessageSummary } from '@/lib/mail-api';
import { buildThreads, type Thread } from '@/lib/mail-threads';
import { cn } from '@/lib/utils';

const MAILBOX_KEY = 'mail-mailbox';
const VIEW_KEY = 'mail-conversations';

const store = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not remembered.
    }
  },
};

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

const overlayOpen = () => Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]'));

export default function MailPage() {
  const t = useT(mailMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const { mailbox: requested, update } = useMailParams();
  const mailboxes = useQuery({ queryKey: mailKeys.mailboxes, queryFn: mailApi.mailboxes });
  const list = mailboxes.data ?? [];
  const remembered = store.get(MAILBOX_KEY);
  const mailbox = list.includes(requested) ? requested : remembered && list.includes(remembered) ? remembered : (list[0] ?? '');

  useEffect(() => {
    if (!mailbox) return;
    store.set(MAILBOX_KEY, mailbox);
    if (requested !== mailbox) update({ mailbox }, true);
  }, [mailbox, requested, update]);

  if (mailboxes.error) {
    return (
      <div className="p-4">
        <ErrorBanner message={errorText(mailboxes.error)} onRetry={() => mailboxes.refetch()} retryLabel={tc('retry')} />
      </div>
    );
  }
  if (mailboxes.isPending) {
    return (
      <div className="flex h-full">
        <div className="hidden w-[220px] shrink-0 space-y-2 border-r bg-sidebar p-3 lg:block">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
        <div className="w-full border-r md:w-[380px]">
          <ListSkeleton />
        </div>
      </div>
    );
  }
  if (!mailbox) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-16">
        <EmptyState
          icon={Inbox}
          title={t('noMailbox')}
          description={t('noMailboxBody')}
          action={
            <Link to="/mailboxes" className={buttonVariants({ variant: 'outline' })}>
              {t('goToMailboxes')}
            </Link>
          }
        />
      </div>
    );
  }
  return <MailView key={mailbox} mailbox={mailbox} mailboxes={list} />;
}

function MailView({ mailbox, mailboxes }: { mailbox: string; mailboxes: string[] }) {
  const t = useT(mailMessages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const errorText = useErrorText();
  const folderName = useFolderName();
  const { folder, q, open, update } = useMailParams();
  const notifications = useNotificationSetting();
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [conversations, setConversationsState] = useState(() => store.get(VIEW_KEY) !== '0');
  const searchRef = useRef<HTMLInputElement>(null);
  // True when the open conversation was pushed onto history, so closing can go back.
  const pushedOpen = useRef(false);

  const connected = useMailEvents(mailbox, notifications.on, (uid) => {
    pushedOpen.current = false;
    update({ folder: null, q: null, open: uid });
  });
  const folders = useFolders(mailbox, !connected);
  const outbox = useQuery({
    queryKey: mailKeys.outbox(mailbox),
    queryFn: () => mailApi.outbox(mailbox),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.length ? 30_000 : false),
  });
  const messageList = useMessageList(mailbox, folder, q);
  const run = useMailActions(mailbox, folder, folders.data);

  const current = folders.data?.find((f) => f.path === folder);
  const folderUse = specialUseOf(folders.data, folder);
  const folderLabel = folderName(current, folder);
  const isTrashLike = folderUse === '\\Trash' || folderUse === '\\Junk';
  const isDrafts = folderUse === '\\Drafts';

  const messages = useMemo(() => flatten(messageList.data), [messageList.data]);
  const threads = useMemo(() => buildThreads(messages, conversations), [messages, conversations]);
  const openThread = open ? threads.find((th) => th.uids.includes(open)) : undefined;
  const openIndex = openThread ? threads.indexOf(openThread) : -1;

  // Reset per-folder state.
  useEffect(() => {
    setSelected(new Set());
    setCursor(null);
  }, [folder, q]);

  // Drop selections that left the list.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(threads.map((th) => th.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [threads]);

  const setConversations = (on: boolean) => {
    setConversationsState(on);
    store.set(VIEW_KEY, on ? '1' : '0');
  };

  // --- Navigation -----------------------------------------------------------------

  const selectFolder = (path: string) => {
    setDrawer(false);
    pushedOpen.current = false;
    update({ folder: path === 'INBOX' ? null : path, q: null, open: null });
  };

  const fetchDetail = useCallback(
    (uid: number) => qc.fetchQuery({ queryKey: mailKeys.message(mailbox, folder, uid, false), queryFn: () => mailApi.message(mailbox, folder, uid), staleTime: Infinity }),
    [qc, mailbox, folder]
  );

  const editDraft = useCallback(
    (uid: number, d: MessageDetail) =>
      openComposer({
        mode: 'draft',
        mailbox,
        draftUid: uid,
        message: {
          to: d.to.map((a) => a.address),
          cc: d.cc.map((a) => a.address),
          bcc: d.bcc.map((a) => a.address),
          subject: d.subject,
          html: d.html ?? textToHtml(d.text),
          text: d.text,
          attachments: [],
        },
      }),
    [mailbox]
  );

  const openConversation = useCallback(
    (thread: Thread) => {
      setCursor(thread.id);
      if (isDrafts) {
        fetchDetail(thread.latest.uid)
          .then((d) => editDraft(thread.latest.uid, d))
          .catch((e) => toast.error(errorText(e)));
        return;
      }
      if (open) update({ open: thread.latest.uid }, true);
      else {
        pushedOpen.current = true;
        update({ open: thread.latest.uid });
      }
    },
    [isDrafts, fetchDetail, editDraft, errorText, open, update]
  );

  const closeReader = useCallback(() => {
    if (pushedOpen.current) {
      pushedOpen.current = false;
      navigate(-1);
    } else update({ open: null }, true);
  }, [navigate, update]);

  // Back button closed the reader.
  useEffect(() => {
    if (!open) pushedOpen.current = false;
  }, [open]);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (openThread) {
        const next = threads[openIndex + delta];
        if (next) update({ open: next.latest.uid }, true);
        else if (delta === 1 && messageList.hasNextPage) messageList.fetchNextPage();
        if (next) setCursor(next.id);
        return;
      }
      const index = cursor ? threads.findIndex((th) => th.id === cursor) : -1;
      const next = threads[index === -1 ? (delta === 1 ? 0 : threads.length - 1) : index + delta];
      if (next) setCursor(next.id);
      else if (delta === 1 && messageList.hasNextPage) messageList.fetchNextPage();
    },
    [openThread, openIndex, threads, cursor, update, messageList]
  );

  const reply = useCallback(
    (mode: ReplyMode, detail: MessageDetail) => openComposer({ mode, mailbox, folder, message: detail }),
    [mailbox, folder]
  );

  // --- Actions --------------------------------------------------------------------

  const act = useCallback(
    async (targets: Thread[], kind: ActKind) => {
      if (!targets.length) return;
      const bulk = targets.length > 1 || selected.size > 0;
      const all = targets.flatMap((th) => th.messages);
      let msgs: MessageSummary[] = all;
      let action: MailAction;
      let target: string | undefined;
      if (typeof kind === 'object') {
        action = 'move';
        target = kind.move;
      } else if (kind === 'toggleStar') {
        const starred = all.filter((m) => m.flagged);
        action = targets.every((th) => th.flagged) ? 'unstar' : 'star';
        msgs = action === 'unstar' ? starred : targets.filter((th) => !th.flagged).map((th) => th.latest);
      } else if (kind === 'toggleRead') {
        action = targets.some((th) => th.unread > 0) ? 'read' : 'unread';
      } else if (kind === 'delete') {
        action = isTrashLike ? 'delete' : 'trash';
      } else {
        action = kind;
      }
      if (action === 'read') msgs = all.filter((m) => !m.seen);
      if (action === 'unread') msgs = all.filter((m) => m.seen);
      if (action === 'spam' && folderUse === '\\Junk') return;
      if (action === 'notSpam' && folderUse !== '\\Junk') return;

      if (action === 'delete') {
        const ok = await confirm({
          title: t('deleteForeverTitle', { n: targets.length }),
          description: t('deleteForeverBody'),
          confirmLabel: t('deleteForever'),
          cancelLabel: t('cancel'),
          destructive: true,
        });
        if (!ok) return;
      }

      const removes = !['read', 'unread', 'star', 'unstar'].includes(action);
      if (removes) {
        // Advance to the next conversation when the open one goes away.
        if (openThread && targets.includes(openThread)) {
          const rest = threads.filter((th) => !targets.includes(th));
          const after = threads.slice(openIndex + 1).find((th) => !targets.includes(th));
          const before = threads.slice(0, openIndex).reverse().find((th) => !targets.includes(th));
          const next = after ?? before;
          if (next && rest.length) {
            update({ open: next.latest.uid }, true);
            setCursor(next.id);
          } else closeReader();
        }
        setSelected(new Set());
      } else if (action === 'unread' && openThread && targets.includes(openThread)) {
        closeReader();
      }
      if (msgs.length) await run(msgs, action, { target, notify: bulk || removes });
    },
    [selected.size, isTrashLike, folderUse, confirm, t, openThread, openIndex, threads, update, closeReader, run]
  );

  // --- Keyboard -------------------------------------------------------------------

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  const afterG = useRef(0);
  keys.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || overlayOpen()) return;
    // "g" + letter belongs to the app shell's navigation.
    if (e.key === 'g') return void (afterG.current = Date.now());
    if (Date.now() - afterG.current < 1200) return void (afterG.current = 0);
    // Enter on a focused button or link activates it.
    if (e.key === 'Enter' && (e.target as HTMLElement).closest?.('button, a, [role="button"]')) return;
    const cursorThread = cursor ? threads.find((th) => th.id === cursor) : undefined;
    const focus = openThread ?? cursorThread;
    const targets = selected.size ? threads.filter((th) => selected.has(th.id)) : focus ? [focus] : [];
    const withLatest = (mode: ReplyMode) => {
      const uid = openThread?.latest.uid ?? open;
      if (!uid || isDrafts) return;
      fetchDetail(uid)
        .then((d) => reply(mode, d))
        .catch((err) => toast.error(errorText(err)));
    };
    const handlers: Record<string, () => void> = {
      j: () => step(1),
      k: () => step(-1),
      ArrowDown: () => !open && step(1),
      ArrowUp: () => !open && step(-1),
      Enter: () => !open && (cursorThread ?? threads[0]) && openConversation(cursorThread ?? threads[0]),
      o: () => !open && (cursorThread ?? threads[0]) && openConversation(cursorThread ?? threads[0]),
      u: () => open && closeReader(),
      Escape: () => (selected.size ? setSelected(new Set()) : open ? closeReader() : setCursor(null)),
      e: () => folderUse !== '\\Archive' && !isTrashLike && act(targets, 'archive'),
      '#': () => act(targets, 'delete'),
      Delete: () => act(targets, 'delete'),
      s: () => act(targets, 'toggleStar'),
      U: () => act(targets, 'unread'),
      I: () => act(targets, 'read'),
      r: () => withLatest('reply'),
      a: () => withLatest('replyAll'),
      f: () => withLatest('forward'),
      c: () => openComposer({ mode: 'new', mailbox }),
      x: () => {
        if (!focus) return;
        const next = new Set(selected);
        if (next.has(focus.id)) next.delete(focus.id);
        else next.add(focus.id);
        setSelected(next);
      },
      '!': () => act(targets, folderUse === '\\Junk' ? 'notSpam' : 'spam'),
      '/': () => searchRef.current?.focus(),
      '?': () => setHelp(true),
    };
    const handler = handlers[e.key];
    if (!handler || (e.key.length === 1 && e.key.toLowerCase() !== e.key && !e.shiftKey)) return;
    if (folder === OUTBOX && !['c', '?', '/'].includes(e.key)) return;
    e.preventDefault();
    handler();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Layout ---------------------------------------------------------------------

  const folderPane = (
    <FolderPane
      mailbox={mailbox}
      mailboxes={mailboxes}
      folders={folders.data}
      loading={folders.isPending}
      current={folder}
      outboxCount={outbox.data?.length ?? 0}
      onSelect={selectFolder}
      onMailbox={(m) => {
        setDrawer(false);
        update({ mailbox: m, folder: null, q: null, open: null });
      }}
      onCompose={() => {
        setDrawer(false);
        openComposer({ mode: 'new', mailbox });
      }}
      notifications={notifications}
    />
  );

  const showReader = Boolean(open) && folder !== OUTBOX;

  return (
    <div className="@container relative h-full overflow-hidden">
      <div className="flex h-full">
        <aside className="hidden w-[220px] shrink-0 border-r bg-sidebar @5xl:block">{folderPane}</aside>

        <section
          className={cn(
            'min-w-0 flex-col border-r bg-background @3xl:w-[340px] @3xl:flex-none @5xl:w-[380px] @7xl:w-[420px]',
            showReader ? 'hidden @3xl:flex' : 'flex flex-1'
          )}
        >
          {folder === OUTBOX ? (
            <OutboxView mailbox={mailbox} items={outbox.data ?? []} loading={outbox.isPending} onOpenFolders={() => setDrawer(true)} />
          ) : (
            <MessageList
              mailbox={mailbox}
              folder={folder}
              folderUse={folderUse}
              folderLabel={folderLabel}
              unseen={folderUse === '\\Inbox' ? (current?.unseen ?? 0) : 0}
              folders={folders.data}
              q={q}
              threads={threads}
              loading={messageList.isPending}
              error={messageList.error}
              refetch={() => {
                messageList.refetch();
                qc.invalidateQueries({ queryKey: mailKeys.folders(mailbox) });
              }}
              refreshing={messageList.isRefetching && !messageList.isFetchingNextPage}
              hasMore={Boolean(messageList.hasNextPage)}
              loadingMore={messageList.isFetchingNextPage}
              loadMore={() => messageList.fetchNextPage()}
              openId={openThread?.id ?? null}
              cursorId={cursor}
              selected={selected}
              setSelected={setSelected}
              conversations={conversations}
              setConversations={setConversations}
              onOpen={openConversation}
              act={act}
              onSearch={(next) => {
                pushedOpen.current = false;
                update({ q: next || null, open: null });
              }}
              onOpenFolders={() => setDrawer(true)}
              searchRef={searchRef}
            />
          )}
        </section>

        <section className={cn('min-w-0 flex-1 flex-col bg-background', showReader ? 'flex' : 'hidden @3xl:flex')}>
          {showReader && open ? (
            <Reader
              key={openThread?.id ?? open}
              mailbox={mailbox}
              folder={folder}
              folderUse={folderUse}
              folderLabel={folderLabel}
              folders={folders.data}
              uid={openThread?.latest.uid ?? open}
              thread={openThread}
              onClose={closeReader}
              onPrev={openIndex > 0 ? () => step(-1) : undefined}
              onNext={openThread && (openIndex < threads.length - 1 || messageList.hasNextPage) ? () => step(1) : undefined}
              act={(kind) => {
                if (openThread) act([openThread], kind);
                else {
                  // Opened from a link, not in the loaded list: act on the message alone.
                  const d = qc.getQueryData<MessageDetail>(mailKeys.message(mailbox, folder, open, false));
                  if (!d) return;
                  const single: Thread = { id: String(open), messages: [{ ...d, preview: '' }], latest: { ...d, preview: '' }, uids: [open], unread: 0, flagged: d.flagged, hasAttachments: d.hasAttachments };
                  act([single], kind);
                  if (typeof kind === 'object' || !['read', 'unread', 'toggleStar', 'toggleRead'].includes(kind)) closeReader();
                }
              }}
              onReply={reply}
              onEditDraft={editDraft}
            />
          ) : (
            <ReaderPlaceholder hasMail={threads.length > 0} />
          )}
        </section>
      </div>

      {/* Folders as a drawer when there is no room for the column. */}
      <DrawerPrimitive.Root open={drawer} onOpenChange={setDrawer}>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <DrawerPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-sidebar shadow-xl outline-none data-[state=open]:animate-in"
          >
            <DrawerPrimitive.Title className="sr-only">{t('folders')}</DrawerPrimitive.Title>
            {folderPane}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>

      {!showReader && (
        <Button
          size="icon"
          className="absolute bottom-5 right-5 z-20 size-14 rounded-2xl shadow-lg @3xl:hidden [&_svg]:size-6"
          onClick={() => openComposer({ mode: 'new', mailbox })}
          aria-label={t('compose')}
        >
          <SquarePen />
        </Button>
      )}

      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </div>
  );
}
