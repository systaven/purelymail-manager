import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Globe, Mailbox, Plus, Search, SearchX, X } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { AppPasswordDialog } from '@/components/mailboxes/AppPasswordDialog';
import { CreateMailboxDialog } from '@/components/mailboxes/CreateMailboxDialog';
import { MailboxList, MailboxListSkeleton } from '@/components/mailboxes/MailboxList';
import { MailboxSheet } from '@/components/mailboxes/MailboxSheet';
import { ResetPasswordDialog } from '@/components/mailboxes/ResetPasswordDialog';
import { splitAddress, useDeleteMailbox } from '@/components/mailboxes/shared';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/misc';
import { adminApi, adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { cn } from '@/lib/utils';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};
const dialogOpen = () => Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]'));

export default function MailboxesPage() {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const query = useQuery({ queryKey: adminKeys.mailboxes, queryFn: adminApi.mailboxes });
  const all = query.data;

  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [appFor, setAppFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setCreateKey((k) => k + 1);
    setCreating(true);
  };
  const remove = useDeleteMailbox((address) => setSelected((current) => (current === address ? null : current)));

  // Overview's quick action links to /users?new=1.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') !== '1') return;
    openCreate();
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  // "/" focuses search, "c" creates. The shell uses "g" then a letter to jump
  // between pages, so a key right after "g" is left alone.
  const lastKey = useRef({ key: '', at: 0 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const previous = lastKey.current;
      lastKey.current = { key: e.key, at: Date.now() };
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || dialogOpen()) return;
      if (previous.key === 'g' && Date.now() - previous.at < 1200) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'c') {
        e.preventDefault();
        openCreate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const domains = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of all ?? []) {
      const d = splitAddress(m.address)[1];
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [all]);

  // A filter for a domain that no longer has mailboxes falls back to all.
  const activeDomain = domain && domains.some(([d]) => d === domain) ? domain : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (all ?? []).filter((m) => {
      if (activeDomain && splitAddress(m.address)[1] !== activeDomain) return false;
      if (!q) return true;
      return [m.address, m.owner?.name, m.owner?.email].some((v) => v?.toLowerCase().includes(q));
    });
  }, [all, search, activeDomain]);

  const total = all?.length ?? 0;
  const filtering = Boolean(search.trim() || activeDomain);
  const countText = filtering ? t('countFiltered', { n: filtered.length, total }) : total === 1 ? t('countOne') : t('countMany', { n: total });
  const clearFilters = () => {
    setSearch('');
    setDomain(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={openCreate}>
            <Plus />
            {t('newMailbox')}
            <Kbd className="ml-1 hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground sm:inline-flex">C</Kbd>
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearch('');
                e.currentTarget.blur();
              }
            }}
            placeholder={t('searchPlaceholder')}
            aria-label={tc('search')}
            className="peer pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                searchRef.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t('clearFilters')}
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <Kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 peer-focus:invisible sm:inline-flex">/</Kbd>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 sm:contents">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className={cn('min-w-0 max-w-[65%] justify-start sm:max-w-64', activeDomain && 'border-primary/40')} disabled={!all}>
                <Globe className="text-muted-foreground" />
                <span className="truncate">{activeDomain ?? t('allDomains')}</span>
                <ChevronDown className="ml-auto text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              <DomainItem label={t('allDomains')} count={total} checked={!activeDomain} onSelect={() => setDomain(null)} />
              {domains.length > 0 && <DropdownMenuSeparator />}
              {domains.map(([d, n]) => (
                <DomainItem key={d} label={d} count={n} checked={activeDomain === d} onSelect={() => setDomain(d)} />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {all && <span className="shrink-0 text-sm tabular-nums text-muted-foreground sm:ml-auto">{countText}</span>}
        </div>
      </div>

      {query.isError ? (
        <ErrorBanner message={`${t('loadFailed')} ${errorText(query.error)}`} onRetry={() => query.refetch()} retryLabel={tc('retry')} />
      ) : !all ? (
        <MailboxListSkeleton />
      ) : total === 0 ? (
        <EmptyState
          icon={Mailbox}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Button onClick={openCreate}>
              <Plus />
              {t('newMailbox')}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t('noMatchesTitle')}
          description={t('noMatchesBody')}
          action={
            <Button variant="outline" onClick={clearFilters}>
              {t('clearFilters')}
            </Button>
          }
        />
      ) : (
        <MailboxList
          mailboxes={filtered}
          selected={selected}
          onOpen={setSelected}
          onResetPassword={setResetFor}
          onAppPassword={setAppFor}
          onDelete={remove.run}
        />
      )}

      <MailboxSheet
        address={selected}
        onClose={() => setSelected(null)}
        onResetPassword={setResetFor}
        onAppPassword={setAppFor}
        onDelete={remove.run}
        deleting={remove.pending}
        onRenamed={setSelected}
      />
      <CreateMailboxDialog key={createKey} open={creating} onOpenChange={setCreating} defaultDomain={activeDomain ?? undefined} />
      <ResetPasswordDialog key={`reset-${resetFor}`} address={resetFor} onClose={() => setResetFor(null)} />
      <AppPasswordDialog key={`app-${appFor}`} address={appFor} onClose={() => setAppFor(null)} />
    </div>
  );
}

function DomainItem({ label, count, checked, onSelect }: { label: string; count: number; checked: boolean; onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Check className={cn(!checked && 'invisible')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </DropdownMenuItem>
  );
}
