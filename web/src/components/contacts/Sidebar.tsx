import { BookUser, Check, ChevronsUpDown, Tag, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, Kbd, Skeleton } from '@/components/ui/misc';
import type { AddressBook } from '@/lib/dav-api';
import { useT } from '@/lib/i18n';
import { contactsMessages } from '@/lib/i18n/messages/contacts';
import { cn } from '@/lib/utils';

export type View = { kind: 'all' } | { kind: 'group'; name: string } | { kind: 'book'; href: string };

export function Sidebar({
  mailbox,
  mailboxes,
  onMailbox,
  books,
  bookCounts,
  groups,
  total,
  view,
  onView,
  onNew,
  loading,
}: {
  mailbox: string;
  mailboxes: string[];
  onMailbox: (mailbox: string) => void;
  books: AddressBook[];
  bookCounts: Map<string, number>;
  groups: { name: string; count: number }[];
  total: number;
  view: View;
  onView: (view: View) => void;
  onNew: () => void;
  loading: boolean;
}) {
  const t = useT(contactsMessages);

  const row = (key: string, label: string, Icon: LucideIcon, count: number | null, active: boolean, onClick: () => void) => (
    <button
      key={key}
      onClick={onClick}
      className={cn(
        'group flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors pointer-fine:h-8 hover:bg-sidebar-accent',
        active ? 'bg-sidebar-accent font-medium text-foreground' : 'text-sidebar-foreground'
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-3">
        {mailboxes.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-10 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm hover:bg-sidebar-accent" aria-label={t('switchMailbox')}>
                <Avatar name={mailbox} className="size-6 text-[10px]" />
                <span className="min-w-0 flex-1 truncate font-medium">{mailbox}</span>
                <ChevronsUpDown className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t('mailboxes')}</DropdownMenuLabel>
              {mailboxes.map((m) => (
                <DropdownMenuItem key={m} onSelect={() => onMailbox(m)}>
                  <Avatar name={m} className="size-5 text-[9px]" />
                  <span className="min-w-0 flex-1 truncate">{m}</span>
                  {m === mailbox && <Check />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex h-10 items-center gap-2 px-1.5 text-sm">
            <Avatar name={mailbox} className="size-6 text-[10px]" />
            <span className="min-w-0 flex-1 truncate font-medium">{mailbox}</span>
          </div>
        )}
        <Button className="h-10 w-full justify-start rounded-lg" onClick={onNew} disabled={loading && !books.length}>
          <UserPlus />
          <span className="flex-1 text-left">{t('newContact')}</span>
          <Kbd className="hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground pointer-fine:inline-flex">N</Kbd>
        </Button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" aria-label={t('browse')}>
        {row('all', t('allContacts'), Users, loading ? null : total, view.kind === 'all', () => onView({ kind: 'all' }))}

        {loading ? (
          <div className="space-y-2 px-2 pt-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        ) : (
          <>
            {groups.length > 0 && <div className="px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground">{t('groups')}</div>}
            {groups.map((g) =>
              row(`g:${g.name}`, g.name, Tag, g.count, view.kind === 'group' && view.name === g.name, () => onView({ kind: 'group', name: g.name }))
            )}
            {books.length > 1 && <div className="px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground">{t('addressBooks')}</div>}
            {books.length > 1 &&
              books.map((b) => row(`b:${b.href}`, b.name, BookUser, bookCounts.get(b.href) ?? 0, view.kind === 'book' && view.href === b.href, () => onView({ kind: 'book', href: b.href })))}
          </>
        )}
      </nav>
    </div>
  );
}
