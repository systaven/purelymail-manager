import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Ellipsis,
  File,
  FileArchive,
  FileImage,
  FileText,
  FolderInput,
  Forward,
  ImageOff,
  Mail,
  MailOpen,
  Pencil,
  Printer,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ErrorBanner } from '@/components/ui/feedback';
import { Avatar, Badge, Kbd, Skeleton } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { useLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailMessages } from '@/lib/i18n/messages/mail';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { mailApi, mailKeys, type Address, type Attachment, type Folder, type MessageDetail, type MessageSummary } from '@/lib/mail-api';
import { displayName, sameAddress, type Thread } from '@/lib/mail-threads';
import { cn } from '@/lib/utils';
import type { ActKind } from './MessageList';
import { htmlDocument, MessageBody } from './MessageBody';
import { MoveMenu } from './MoveMenu';
import { formatSize, fullDate, markSeenLocally, shortDate } from './state';

export type ReplyMode = 'reply' | 'replyAll' | 'forward';

export const useMessageDetail = (mailbox: string, folder: string, uid: number, images = false, enabled = true) =>
  useQuery({
    queryKey: mailKeys.message(mailbox, folder, uid, images),
    queryFn: () => mailApi.message(mailbox, folder, uid, images),
    enabled,
    staleTime: Infinity,
  });

const formatAddress = (a: Address) => (a.name ? `${a.name} <${a.address}>` : a.address);

function printMessage(detail: MessageDetail, locale: string, labels: { from: string; to: string; cc: string; date: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const row = (k: string, v: string) => (v ? `<div><b>${esc(k)}:</b> ${esc(v)}</div>` : '');
  const head = `<h2 style="margin:0 0 8px">${esc(detail.subject)}</h2><div style="font-size:12px;color:#555;margin-bottom:16px;border-bottom:1px solid #ddd;padding-bottom:12px">${row(labels.from, detail.from.map(formatAddress).join(', '))}${row(labels.to, detail.to.map(formatAddress).join(', '))}${row(labels.cc, detail.cc.map(formatAddress).join(', '))}${row(labels.date, fullDate(detail.date, locale))}</div>`;
  const body = detail.html ?? `<pre style="white-space:pre-wrap;font:inherit">${esc(detail.text)}</pre>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.srcdoc = htmlDocument(head + body, false, 'html{overflow:visible}');
  frame.onload = () => {
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  document.body.appendChild(frame);
}

function attachmentIcon(type: string): LucideIcon {
  if (type.startsWith('image/')) return FileImage;
  if (type === 'application/pdf' || type.startsWith('text/')) return FileText;
  if (/zip|compressed|tar|rar|7z/.test(type)) return FileArchive;
  return File;
}

function Attachments({ mailbox, folder, uid, items }: { mailbox: string; folder: string; uid: number; items: Attachment[] }) {
  const t = useT(mailMessages);
  const shown = items.filter((a) => !a.inline);
  if (!shown.length) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t('attachmentsCount', { n: shown.length })}</p>
      <div className="flex flex-wrap gap-2">
        {shown.map((a) => {
          const Icon = attachmentIcon(a.contentType);
          const viewable = a.contentType.startsWith('image/') || a.contentType === 'application/pdf';
          return (
            <div key={a.index} className="flex h-12 max-w-full items-center rounded-lg border bg-card pr-1 text-sm shadow-xs sm:max-w-72">
              <a
                href={mailApi.attachmentUrl(mailbox, folder, uid, a.index, viewable)}
                target={viewable ? '_blank' : undefined}
                rel="noopener noreferrer"
                download={viewable ? undefined : a.filename}
                className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-l-lg pl-3 hover:bg-accent/60"
                title={a.filename}
              >
                <Icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.filename}</span>
                  <span className="block text-xs text-muted-foreground">{formatSize(a.size)}</span>
                </span>
              </a>
              <a
                href={mailApi.attachmentUrl(mailbox, folder, uid, a.index)}
                download={a.filename}
                className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t('download')}
                title={t('download')}
              >
                <Download className="size-4" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Recipients({ detail, mailbox }: { detail: MessageDetail; mailbox: string }) {
  const t = useT(mailMessages);
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const all = [...detail.to, ...detail.cc, ...detail.bcc];
  const name = (a: Address) => (sameAddress(a.address, mailbox) ? t('me') : displayName(a));
  const summary = all.length === 0 ? t('undisclosed') : all.length <= 3 ? all.map(name).join(', ') : t('andOthers', { names: all.slice(0, 2).map(name).join(', '), n: all.length - 2 });
  const rows: [string, string][] = [
    [t('from'), detail.from.map(formatAddress).join(', ')],
    [t('to'), detail.to.map(formatAddress).join(', ')],
    [t('cc'), detail.cc.map(formatAddress).join(', ')],
    [t('bcc'), detail.bcc.map(formatAddress).join(', ')],
    [t('replyTo'), detail.replyTo.map(formatAddress).join(', ')],
    [t('date'), fullDate(detail.date, locale)],
  ];
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex max-w-full items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <span className="truncate">{t('toSummary', { names: summary })}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
        </dl>
      )}
    </>
  );
}

function MessageCard({
  mailbox,
  folder,
  uid,
  summary,
  expanded,
  onToggle,
  isLast,
  onReply,
  onEditDraft,
}: {
  mailbox: string;
  folder: string;
  uid: number;
  summary?: MessageSummary;
  expanded: boolean;
  onToggle: () => void;
  isLast: boolean;
  onReply: (mode: ReplyMode, detail: MessageDetail) => void;
  onEditDraft?: (detail: MessageDetail) => void;
}) {
  const t = useT(mailMessages);
  const tc = useT(commonMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const [images, setImages] = useState(false);
  const mountedAt = useRef(Date.now());
  const query = useMessageDetail(mailbox, folder, uid, images, expanded);
  // Keep showing the image-less version while the one with images loads.
  const fallback = useMessageDetail(mailbox, folder, uid, false, expanded && images);
  const detail = query.data ?? (images ? fallback.data : undefined);

  const unseen = useRef(summary ? !summary.seen : false);
  useEffect(() => {
    if (!query.data) return;
    // Opening marks it read on the server; a copy from the cache needs telling.
    if (unseen.current && query.dataUpdatedAt < mountedAt.current) void mailApi.action(mailbox, folder, [uid], 'read').catch(() => {});
    unseen.current = false;
    markSeenLocally(qc, mailbox, folder, uid);
  }, [query.data, query.dataUpdatedAt, qc, mailbox, folder, uid]);

  const from = detail?.from[0] ?? summary?.from[0];
  const sender = from ? displayName(from) : t('unknownSender');
  const date = detail?.date ?? summary?.date;

  if (!expanded) {
    return (
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-accent/50 @3xl:px-6">
        <Avatar name={sender} className="size-8" />
        <span className={cn('w-32 shrink-0 truncate text-sm sm:w-40', summary && !summary.seen ? 'font-semibold' : 'font-medium')}>{sender}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{summary?.preview}</span>
        {date && <span className="shrink-0 text-xs text-muted-foreground">{shortDate(date, locale)}</span>}
      </button>
    );
  }

  return (
    <article className={cn('px-4 py-4 @3xl:px-6', !isLast && 'border-b')}>
      <header className="flex items-start gap-3">
        <button type="button" onClick={onToggle} className="shrink-0" aria-label={t('collapse')} tabIndex={-1}>
          <Avatar name={sender} className="size-9" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 truncate text-sm">
              <span className="font-semibold">{sender}</span>
              {from?.address && <span className="hidden text-xs text-muted-foreground @xl:inline"> &lt;{from.address}&gt;</span>}
            </span>
            {date && (
              <Tooltip content={fullDate(date, locale)} side="top">
                <time dateTime={date} className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {shortDate(date, locale)}
                </time>
              </Tooltip>
            )}
          </div>
          {detail ? <Recipients detail={detail} mailbox={mailbox} /> : <Skeleton className="mt-1 h-3 w-32" />}
        </div>
        {detail && (
          <div className="-mr-2 -mt-1 flex shrink-0">
            {onEditDraft ? (
              <Button variant="ghost" size="icon-sm" onClick={() => onEditDraft(detail)} aria-label={t('editDraft')} title={t('editDraft')}>
                <Pencil />
              </Button>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={() => onReply('reply', detail)} aria-label={t('reply')} title={t('reply')}>
                <Reply />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t('more')} className="text-muted-foreground">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onReply('reply', detail)}>
                  <Reply /> {t('reply')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onReply('replyAll', detail)}>
                  <ReplyAll /> {t('replyAll')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onReply('forward', detail)}>
                  <Forward /> {t('forward')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => printMessage(detail, locale, { from: t('from'), to: t('to'), cc: t('cc'), date: t('date') })}>
                  <Printer /> {t('print')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <div className="mt-4 @3xl:pl-12">
        {query.error && !detail ? (
          <ErrorBanner message={errorText(query.error)} onRetry={() => query.refetch()} retryLabel={tc('retry')} />
        ) : !detail ? (
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : (
          <>
            {(detail.blockedImages > 0 || detail.listUnsubscribe) && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {detail.blockedImages > 0 && !images && (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    <ImageOff className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1">{t('imagesHidden')}</span>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setImages(true)}>
                      {t('showImages')}
                    </Button>
                  </div>
                )}
                {detail.listUnsubscribe && (
                  <a href={detail.listUnsubscribe} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    {t('unsubscribe')}
                  </a>
                )}
              </div>
            )}
            <MessageBody html={detail.html} text={detail.text} images={images && Boolean(query.data)} />
            <Attachments mailbox={mailbox} folder={folder} uid={uid} items={detail.attachments} />
            {isLast && !onEditDraft && (
              <div className="mt-6 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => onReply('reply', detail)}>
                  <Reply /> {t('reply')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => onReply('replyAll', detail)}>
                  <ReplyAll /> {t('replyAll')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => onReply('forward', detail)}>
                  <Forward /> {t('forward')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export function Reader({
  mailbox,
  folder,
  folderUse,
  folderLabel,
  folders,
  uid,
  thread,
  onClose,
  onPrev,
  onNext,
  act,
  onReply,
  onEditDraft,
}: {
  mailbox: string;
  folder: string;
  folderUse: string | null;
  folderLabel: string;
  folders: Folder[] | undefined;
  uid: number;
  thread: Thread | undefined;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  act: (kind: ActKind) => void;
  onReply: (mode: ReplyMode, detail: MessageDetail) => void;
  onEditDraft: (uid: number, detail: MessageDetail) => void;
}) {
  const t = useT(mailMessages);
  const tc = useT(commonMessages);
  const { locale } = useLocale();
  const latest = useMessageDetail(mailbox, folder, uid);
  const messages = thread?.messages ?? [];
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([uid, ...messages.filter((m) => !m.seen).map((m) => m.uid)]));
  const subject = thread?.latest.subject ?? latest.data?.subject ?? '';
  const flagged = thread ? thread.flagged : Boolean(latest.data?.flagged);
  const inTrash = folderUse === '\\Trash' || folderUse === '\\Junk';
  const isDrafts = folderUse === '\\Drafts';
  const unread = thread ? thread.unread > 0 : false;
  const uids = thread ? thread.uids : [uid];

  const iconBtn = (Icon: LucideIcon, label: string, onClick: () => void, opts: { className?: string; shortcut?: string; active?: boolean } = {}) => (
    <Tooltip
      side="bottom"
      content={
        <span className="flex items-center gap-1.5">
          {label}
          {opts.shortcut && <Kbd className="h-4 border-background/20 bg-background/15 text-background">{opts.shortcut}</Kbd>}
        </span>
      }
    >
      <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} className={cn('text-muted-foreground hover:text-foreground', opts.className)}>
        <Icon className={cn(opts.active && 'fill-warning text-warning')} />
      </Button>
    </Tooltip>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b px-2">
        <span className="@3xl:hidden">{iconBtn(ArrowLeft, tc('back'), onClose, { shortcut: 'U' })}</span>
        <span className="hidden @3xl:contents">{iconBtn(X, tc('close'), onClose, { shortcut: 'Esc' })}</span>
        <div className="mx-1 h-5 w-px bg-border" />
        {!inTrash && folderUse !== '\\Archive' && !isDrafts && iconBtn(Archive, t('archive'), () => act('archive'), { shortcut: 'E' })}
        {iconBtn(Trash2, inTrash ? t('deleteForever') : t('delete'), () => act('delete'), { shortcut: '#' })}
        {!isDrafts &&
          (folderUse === '\\Junk'
            ? iconBtn(ShieldCheck, t('notSpam'), () => act('notSpam'), { shortcut: '!' })
            : iconBtn(ShieldAlert, t('spam'), () => act('spam'), { className: 'hidden @md:inline-flex', shortcut: '!' }))}
        {iconBtn(unread ? MailOpen : Mail, unread ? t('markRead') : t('markUnread'), () => act(unread ? 'read' : 'unread'), {
          shortcut: unread ? '⇧I' : '⇧U',
        })}
        <MoveMenu folders={folders} current={folder} onMove={(path) => act({ move: path })}>
          <Button variant="ghost" size="icon-sm" aria-label={t('moveTo')} title={t('moveTo')} className="text-muted-foreground hover:text-foreground">
            <FolderInput />
          </Button>
        </MoveMenu>
        {iconBtn(Star, flagged ? t('unstar') : t('star'), () => act('toggleStar'), { active: flagged, shortcut: 'S' })}
        <div className="ml-auto flex items-center">
          {latest.data && (
            <span className="hidden @md:contents">
              {iconBtn(Printer, t('print'), () => printMessage(latest.data!, locale, { from: t('from'), to: t('to'), cc: t('cc'), date: t('date') }))}
            </span>
          )}
          {iconBtn(ChevronUp, t('newer'), () => onPrev?.(), { className: cn(!onPrev && 'pointer-events-none opacity-40'), shortcut: 'K' })}
          {iconBtn(ChevronDown, t('older'), () => onNext?.(), { className: cn(!onNext && 'pointer-events-none opacity-40'), shortcut: 'J' })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-4xl pb-16">
          <div className="px-4 pb-2 pt-5 @3xl:px-6">
            <h2 className="text-xl font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">{subject || <span className="text-muted-foreground">{t('noSubject')}</span>}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge className="bg-accent text-accent-foreground">{folderLabel}</Badge>
              {flagged && <Badge className="bg-warning/15 text-foreground">{t('starred')}</Badge>}
              {uids.length > 1 && <Badge>{t('messagesCount', { n: uids.length })}</Badge>}
            </div>
          </div>
          {(messages.length ? messages : [undefined]).map((m) => {
            const id = m?.uid ?? uid;
            return (
              <MessageCard
                key={id}
                mailbox={mailbox}
                folder={folder}
                uid={id}
                summary={m}
                expanded={expanded.has(id)}
                isLast={id === (thread?.latest.uid ?? uid)}
                onToggle={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onReply={onReply}
                onEditDraft={isDrafts ? (detail) => onEditDraft(id, detail) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReaderPlaceholder({ hasMail }: { hasMail: boolean }) {
  const t = useT(mailMessages);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Mail className="size-7" />
      </span>
      <p className="text-sm font-medium text-foreground">{hasMail ? t('selectConversation') : t('nothingSelected')}</p>
      <p className="hidden items-center gap-1.5 text-xs pointer-fine:flex">
        <Kbd>J</Kbd> <Kbd>K</Kbd> {t('toNavigate')} · <Kbd>?</Kbd> {t('forShortcuts')}
      </p>
    </div>
  );
}
