import { forwardRef, useEffect, type RefObject } from 'react';
import { Download, MoreHorizontal, PanelLeft, RefreshCw, Search, SearchX, UserRound, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Kbd, Skeleton } from '@/components/ui/misc';
import type { Contact } from '@/lib/dav-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { contactsMessages } from '@/lib/i18n/messages/contacts';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { cn } from '@/lib/utils';
import { ContactAvatar } from './ContactAvatar';
import { displayName, isCompanyOnly, type Section } from './utils';

export const SearchField = forwardRef<HTMLInputElement, { value: string; onChange: (q: string) => void; onDone?: () => void }>(({ value, onChange, onDone }, ref) => {
  const t = useT(contactsMessages);
  return (
    <div className="group/search flex h-9 items-center gap-2 rounded-lg border bg-background px-2.5 transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-3">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
            e.currentTarget.blur();
          } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
            // Hand over to the list: j/k and Enter work from here.
            e.preventDefault();
            e.currentTarget.blur();
            onDone?.();
          }
        }}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange('')}
          className="-mr-1 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={t('clearSearch')}
        >
          <X className="size-4" />
        </button>
      ) : (
        <Kbd className="hidden group-focus-within/search:hidden pointer-fine:inline-flex">/</Kbd>
      )}
    </div>
  );
});
SearchField.displayName = 'SearchField';

function ListSkeleton() {
  return (
    <div aria-hidden className="pt-2">
      <Skeleton className="mx-4 my-2 h-3 w-4" />
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${40 + ((i * 37) % 40)}%` }} />
            <Skeleton className="h-3" style={{ width: `${30 + ((i * 23) % 35)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ contact, active, onOpen }: { contact: Contact; active: boolean; onOpen: (c: Contact) => void }) {
  const t = useT(contactsMessages);
  const name = displayName(contact);
  const secondary = [contact.emails[0]?.value, isCompanyOnly(contact) ? '' : contact.organization, contact.phones[0]?.value].find((v) => v && v !== name);
  return (
    <li className="[contain-intrinsic-size:auto_56px] [content-visibility:auto]">
      <button
        type="button"
        data-contact={contact.href}
        onClick={() => onOpen(contact)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2 text-left transition-colors focus-visible:ring-inset',
          active ? 'bg-selection' : 'hover:bg-accent/60'
        )}
      >
        <ContactAvatar name={name} photo={contact.photo} className="size-9 text-[13px]" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm', active ? 'font-semibold' : 'font-medium')}>{name || <span className="text-muted-foreground">{t('noName')}</span>}</span>
          {secondary && <span className="block truncate text-[13px] text-muted-foreground">{secondary}</span>}
        </span>
      </button>
    </li>
  );
}

export function ContactList({
  title,
  sections,
  total,
  q,
  onSearch,
  onSearchDone,
  searchRef,
  selected,
  onOpen,
  onNew,
  onOpenNav,
  onExport,
  loading,
  error,
  refetch,
  refreshing,
  isGroup,
}: {
  title: string;
  sections: Section[];
  total: number;
  q: string;
  onSearch: (q: string) => void;
  onSearchDone: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  selected: string | null;
  onOpen: (c: Contact) => void;
  onNew: () => void;
  onOpenNav: () => void;
  onExport: () => void;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  refreshing: boolean;
  isGroup: boolean;
}) {
  const t = useT(contactsMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const shown = sections.reduce((n, s) => n + s.contacts.length, 0);

  // Keep the selected contact in view (j/k, back/forward).
  useEffect(() => {
    if (selected) document.querySelector(`[data-contact="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected, shown]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-2 @5xl:pl-4">
        <Button variant="ghost" size="icon" className="@5xl:hidden" onClick={onOpenNav} aria-label={t('browse')}>
          <PanelLeft />
        </Button>
        <h1 className="min-w-0 truncate text-base font-semibold tracking-tight">{title}</h1>
        {!loading && !error && <span className="text-sm tabular-nums text-muted-foreground">{q ? `${shown}/${total}` : total}</span>}
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={refetch} aria-label={tc('refresh')} title={tc('refresh')} className="text-muted-foreground">
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('more')} title={t('more')} className="text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onNew}>
                <UserPlus />
                {t('newContact')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExport} disabled={!shown}>
                <Download />
                {t('exportAll')}
                <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{shown}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="shrink-0 border-b px-3 pb-2.5">
        <SearchField ref={searchRef} value={q} onChange={onSearch} onDone={onSearchDone} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-contact-scroller>
        {error ? (
          <div className="p-3">
            <ErrorBanner message={errorText(error)} onRetry={refetch} retryLabel={tc('retry')} />
          </div>
        ) : loading ? (
          <ListSkeleton />
        ) : shown === 0 ? (
          <div className="p-4">
            {q ? (
              <EmptyState icon={SearchX} title={t('noResults')} description={t('noResultsBody', { q })} />
            ) : isGroup ? (
              <EmptyState icon={Users} title={t('noGroupContacts')} />
            ) : (
              <EmptyState
                icon={UserRound}
                title={t('noContacts')}
                description={t('noContactsBody')}
                action={
                  <Button onClick={onNew}>
                    <UserPlus />
                    {t('newContact')}
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <>
            {sections.map((s) => (
              <section key={s.key} aria-label={s.key}>
                <h2 className="sticky top-0 z-10 border-b border-border/50 bg-background/90 px-4 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
                  {s.key}
                </h2>
                <ul>
                  {s.contacts.map((c) => (
                    <Row key={c.href} contact={c} active={c.href === selected} onOpen={onOpen} />
                  ))}
                </ul>
              </section>
            ))}
            <div className="h-24 @3xl:h-4" />
          </>
        )}
      </div>
    </div>
  );
}
