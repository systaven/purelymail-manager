import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  Archive,
  Check,
  FolderInput,
  Inbox,
  ListFilter,
  Mail,
  MailOpen,
  Menu,
  Minus,
  Paperclip,
  PartyPopper,
  RefreshCw,
  SearchX,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { useLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { useErrorText } from '@/lib/i18n/useErrorText';
import type { Folder } from '@/lib/mail-api';
import { displayName, sameAddress, type Thread } from '@/lib/mail-threads';
import { cn } from '@/lib/utils';
import { MoveMenu } from './MoveMenu';
import { SearchBox } from './SearchBox';
import { fullDate, shortDate } from './state';

export type ActKind = 'archive' | 'delete' | 'read' | 'unread' | 'toggleRead' | 'toggleStar' | 'spam' | 'notSpam' | { move: string };

export interface ListProps {
  mailbox: string;
  folder: string;
  folderUse: string | null;
  folderLabel: string;
  unseen: number;
  folders: Folder[] | undefined;
  q: string;
  threads: Thread[];
  loading: boolean;
  error: unknown;
  refetch: () => void;
  refreshing: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  openId: string | null;
  cursorId: string | null;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  conversations: boolean;
  setConversations: (on: boolean) => void;
  onOpen: (thread: Thread) => void;
  act: (threads: Thread[], kind: ActKind) => void;
  onSearch: (q: string) => void;
  onOpenFolders: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

// "Dave, me (3)" — or the recipients in Sent/Drafts.
function people(thread: Thread, mailbox: string, outgoing: boolean, me: string) {
  if (outgoing) {
    const to = thread.latest.to.concat(thread.latest.cc);
    return to.length ? to.slice(0, 3).map(displayName).join(', ') : '—';
  }
  const names: string[] = [];
  for (const m of thread.messages) {
    const a = m.from[0];
    if (!a) continue;
    const name = sameAddress(a.address, mailbox) ? me : displayName(a);
    if (!names.includes(name)) names.push(name);
  }
  if (names.length > 3) return `${names[0]} … ${names.slice(-2).join(', ')}`;
  return names.join(', ') || '—';
}

function IconAction({ icon: Icon, label, onClick, active }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={cn('flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', active && 'text-warning hover:text-warning')}
    >
      <Icon className={cn('size-4', active && 'fill-current')} />
    </button>
  );
}

function Row({
  thread,
  props,
  outgoing,
}: {
  thread: Thread;
  props: ListProps;
  outgoing: boolean;
}) {
  const t = useT(mailMessages);
  const { locale } = useLocale();
  const { mailbox, folderUse, openId, cursorId, selected, setSelected, onOpen, act } = props;
  const latest = thread.latest;
  const unread = thread.unread > 0;
  const isSelected = selected.has(thread.id);
  const selecting = selected.size > 0;
  const avatarFrom = outgoing ? latest.to[0] : latest.from[0];
  const toggle = () => {
    const next = new Set(selected);
    if (isSelected) next.delete(thread.id);
    else next.add(thread.id);
    setSelected(next);
  };
  const inTrash = folderUse === '\\Trash' || folderUse === '\\Junk';

  return (
    <li
      data-thread={thread.id}
      className={cn(
        'group relative flex gap-3 border-b border-border/60 py-2.5 pl-3 pr-3 transition-colors hover:bg-accent/60',
        openId === thread.id && 'bg-selection hover:bg-selection',
        isSelected && 'bg-primary/10 hover:bg-primary/10',
        cursorId === thread.id && openId !== thread.id && 'shadow-[inset_2px_0_0_var(--color-primary)]'
      )}
    >
      {/* The whole row opens the conversation; the controls sit above this button. */}
      <button type="button" className="absolute inset-0 z-0 focus-visible:ring-inset" onClick={() => (selecting ? toggle() : onOpen(thread))} aria-label={latest.subject || t('noSubject')} />
      {unread && <span className="absolute left-1 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary" aria-label={t('unread')} />}

      <button
        type="button"
        onClick={toggle}
        className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={t('select')}
      >
        <span className={cn((isSelected || selecting) && 'hidden', 'pointer-fine:group-hover:hidden')}>
          <Avatar name={avatarFrom ? displayName(avatarFrom) : '?'} className="size-9" />
        </span>
        <span
          className={cn(
            'size-[18px] items-center justify-center rounded border-2 border-muted-foreground/50 bg-background',
            isSelected ? 'flex border-primary bg-primary text-primary-foreground' : selecting ? 'flex' : 'hidden pointer-fine:group-hover:flex'
          )}
        >
          {isSelected && <Check className="size-3" strokeWidth={3} />}
        </span>
      </button>

      <div className="pointer-events-none relative z-0 min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn('min-w-0 truncate text-sm', unread ? 'font-semibold text-foreground' : 'text-foreground/80')}>
            {outgoing && <span className="text-muted-foreground">{t('toPrefix')} </span>}
            {people(thread, mailbox, outgoing, t('me'))}
          </span>
          {thread.messages.length > 1 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{thread.messages.length}</span>}
          <time
            className={cn('ml-auto shrink-0 text-xs tabular-nums pointer-fine:group-hover:invisible', unread ? 'font-semibold text-primary' : 'text-muted-foreground')}
            title={fullDate(latest.date, locale)}
            dateTime={latest.date}
          >
            {shortDate(latest.date, locale)}
          </time>
        </div>
        <div className={cn('truncate text-[13px]', unread ? 'font-semibold text-foreground' : 'text-foreground/90')}>
          {latest.draft && folderUse !== '\\Drafts' && <span className="text-destructive">{t('draft')} · </span>}
          {latest.subject || <span className="text-muted-foreground">{t('noSubject')}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{latest.preview || ' '}</span>
          {thread.hasAttachments && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('hasAttachment')} />}
          {thread.flagged && <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-label={t('starred')} />}
        </div>
      </div>

      {/* Quick actions on pointer devices, over the date. */}
      <div className="absolute right-2 top-1.5 z-10 hidden items-center rounded-md bg-card/95 shadow-sm ring-1 ring-border backdrop-blur pointer-fine:group-hover:flex">
        {folderUse !== '\\Archive' && !inTrash && <IconAction icon={Archive} label={t('archive')} onClick={() => act([thread], 'archive')} />}
        <IconAction icon={Trash2} label={inTrash ? t('deleteForever') : t('delete')} onClick={() => act([thread], 'delete')} />
        <IconAction icon={unread ? MailOpen : Mail} label={unread ? t('markRead') : t('markUnread')} onClick={() => act([thread], 'toggleRead')} />
        <IconAction icon={Star} label={thread.flagged ? t('unstar') : t('star')} active={thread.flagged} onClick={() => act([thread], 'toggleStar')} />
      </div>
    </li>
  );
}

function BulkBar({ props }: { props: ListProps }) {
  const t = useT(mailMessages);
  const { threads, selected, setSelected, act, folders, folder, folderUse } = props;
  const chosen = threads.filter((th) => selected.has(th.id));
  const all = chosen.length === threads.length && threads.length > 0;
  const anyUnread = chosen.some((th) => th.unread > 0);
  const inTrash = folderUse === '\\Trash' || folderUse === '\\Junk';
  const btn = (Icon: LucideIcon, label: string, onClick: () => void) => (
    <Button variant="ghost" size="icon-sm" onClick={onClick} title={label} aria-label={label}>
      <Icon />
    </Button>
  );
  return (
    <div className="flex h-12 shrink-0 items-center gap-0.5 border-b bg-primary/5 px-2">
      <Button
        variant="ghost"
        size="icon-sm"
        role="checkbox"
        aria-checked={all ? true : 'mixed'}
        aria-label={t('selectAll')}
        title={t('selectAll')}
        onClick={() => setSelected(all ? new Set() : new Set(threads.map((th) => th.id)))}
      >
        <span className="flex size-[18px] items-center justify-center rounded border-2 border-primary bg-primary text-primary-foreground">
          {all ? <Check className="size-3" strokeWidth={3} /> : <Minus className="size-3" strokeWidth={3} />}
        </span>
      </Button>
      <span className="mr-auto pl-1 text-sm font-medium tabular-nums">{t('selectedCount', { n: chosen.length })}</span>
      {folderUse !== '\\Archive' && !inTrash && btn(Archive, t('archive'), () => act(chosen, 'archive'))}
      {btn(Trash2, inTrash ? t('deleteForever') : t('delete'), () => act(chosen, 'delete'))}
      {btn(anyUnread ? MailOpen : Mail, anyUnread ? t('markRead') : t('markUnread'), () => act(chosen, anyUnread ? 'read' : 'unread'))}
      {btn(Star, t('star'), () => act(chosen, 'toggleStar'))}
      <span className="hidden @xs:contents">
        {folderUse === '\\Junk'
          ? btn(ShieldCheck, t('notSpam'), () => act(chosen, 'notSpam'))
          : btn(ShieldAlert, t('spam'), () => act(chosen, 'spam'))}
      </span>
      <MoveMenu folders={folders} current={folder} onMove={(path) => act(chosen, { move: path })}>
        <Button variant="ghost" size="icon-sm" title={t('moveTo')} aria-label={t('moveTo')}>
          <FolderInput />
        </Button>
      </MoveMenu>
      {btn(X, t('clearSelection'), () => setSelected(new Set()))}
    </div>
  );
}

function Empty({ folderUse, q }: { folderUse: string | null; q: string }) {
  const t = useT(mailMessages);
  if (q) return <EmptyState icon={SearchX} title={t('noResults')} description={t('noResultsBody', { q })} />;
  if (folderUse === '\\Inbox') {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner">
          <PartyPopper className="size-8" />
        </span>
        <p className="text-base font-semibold">{t('inboxZero')}</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t('inboxZeroBody')}</p>
      </div>
    );
  }
  const map: Record<string, [LucideIcon, string]> = {
    '\\Sent': [Send, t('emptySent')],
    '\\Drafts': [Mail, t('emptyDrafts')],
    '\\Trash': [Trash2, t('emptyTrash')],
    '\\Junk': [ShieldCheck, t('emptyJunk')],
    '\\Archive': [Archive, t('emptyArchive')],
  };
  const [icon, title] = (folderUse && map[folderUse]) || [Inbox, t('emptyFolder')];
  return <EmptyState icon={icon} title={title} />;
}

export function ListSkeleton() {
  return (
    <ul aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i} className="flex gap-3 border-b border-border/60 px-3 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ListHeader({ title, count, onOpenFolders, children }: { title: string; count?: number; onOpenFolders: () => void; children?: ReactNode }) {
  const t = useT(mailMessages);
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 px-2 @5xl:pl-4">
      <Button variant="ghost" size="icon" className="@5xl:hidden" onClick={onOpenFolders} aria-label={t('folders')}>
        <Menu />
      </Button>
      <h1 className="min-w-0 truncate text-base font-semibold tracking-tight">{title}</h1>
      {count ? <span className="text-sm text-muted-foreground tabular-nums">{count}</span> : null}
      <div className="ml-auto flex items-center">{children}</div>
    </div>
  );
}

export function MessageList(props: ListProps) {
  const t = useT(mailMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const { threads, loading, error, refetch, refreshing, hasMore, loadingMore, loadMore, selected, folderUse, q, openId, cursorId } = props;
  const sentinel = useRef<HTMLDivElement>(null);
  const outgoing = folderUse === '\\Sent' || folderUse === '\\Drafts';

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && !loadingMore && loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  // Keep the keyboard cursor / open conversation visible.
  useEffect(() => {
    const id = cursorId ?? openId;
    if (id) document.querySelector(`[data-thread="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursorId, openId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selected.size > 0 ? (
        <BulkBar props={props} />
      ) : (
        <ListHeader title={props.folderLabel} count={props.unseen || undefined} onOpenFolders={props.onOpenFolders}>
          <Button variant="ghost" size="icon-sm" onClick={refetch} aria-label={tc('refresh')} title={tc('refresh')} className="text-muted-foreground">
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('view')} title={t('view')} className="text-muted-foreground">
                <ListFilter />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('view')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={props.conversations ? 'threads' : 'messages'} onValueChange={(v) => props.setConversations(v === 'threads')}>
                <DropdownMenuRadioItem value="threads">{t('viewConversations')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="messages">{t('viewMessages')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ListHeader>
      )}
      <div className="shrink-0 border-b px-3 pb-2.5">
        <SearchBox ref={props.searchRef} value={q} onSearch={props.onSearch} placeholder={t('searchPlaceholder', { folder: props.folderLabel })} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error ? (
          <div className="p-3">
            <ErrorBanner message={errorText(error)} onRetry={refetch} retryLabel={tc('retry')} />
          </div>
        ) : loading ? (
          <ListSkeleton />
        ) : threads.length === 0 ? (
          <div className="p-4">
            <Empty folderUse={folderUse} q={q} />
          </div>
        ) : (
          <>
            <ul>
              {threads.map((thread) => (
                <Row key={thread.id} thread={thread} props={props} outgoing={outgoing} />
              ))}
            </ul>
            {hasMore && (
              <div ref={sentinel} className="flex justify-center p-4">
                <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? tc('loading') : t('loadMore')}
                </Button>
              </div>
            )}
            <div className="h-20 @3xl:h-4" />
          </>
        )}
      </div>
    </div>
  );
}
