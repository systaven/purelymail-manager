import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Globe, Plus, Search } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { AddDomainDialog } from '@/components/domains/AddDomainDialog';
import { DomainSheet } from '@/components/domains/DomainSheet';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Badge, Kbd, Skeleton } from '@/components/ui/misc';
import { adminApi, adminKeys, type Domain } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { domainsMessages } from '@/lib/i18n/messages/domains';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { cn } from '@/lib/utils';

const CHECKS = [
  ['passesMx', 'mx'],
  ['passesSpf', 'spf'],
  ['passesDkim', 'dkim'],
  ['passesDmarc', 'dmarc'],
] as const;

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function DnsPills({ domain }: { domain: Domain }) {
  const t = useT(domainsMessages);
  return (
    <div className="flex flex-wrap gap-1">
      {CHECKS.map(([key, label]) => {
        const ok = domain.dnsSummary?.[key];
        return (
          <span
            key={key}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
              ok ? 'bg-success/10 text-success' : 'bg-warning/15 text-foreground'
            )}
          >
            <span className={cn('size-1.5 rounded-full', ok ? 'bg-success' : 'bg-warning')} />
            {t(label)}
          </span>
        );
      })}
    </div>
  );
}

export default function DomainsPage() {
  const t = useT(domainsMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const domains = useQuery({ queryKey: adminKeys.domains, queryFn: adminApi.domains });

  // Overview's "Add a domain" links here with ?new=1.
  useEffect(() => {
    if (params.get('new')) {
      setAdding(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || adding || selected) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'c') {
        e.preventDefault();
        setAdding(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adding, selected]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (domains.data ?? []).filter((d) => d.name.includes(q));
  }, [domains.data, query]);

  // Read the selected domain from fresh data so the sheet updates after changes.
  const current = domains.data?.find((d) => d.name === selected) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> {t('addDomain')}
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} className="pl-8 pr-8" />
          <Kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
        </div>
        {domains.data && <span className="text-sm text-muted-foreground">{t('count', { n: list.length })}</span>}
      </div>

      {domains.isError && <ErrorBanner message={errorText(domains.error)} onRetry={() => domains.refetch()} retryLabel={tc('retry')} />}

      {domains.isPending && (
        <div className="divide-y rounded-xl border bg-card">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      )}

      {domains.data && domains.data.length === 0 && (
        <EmptyState
          icon={Globe}
          title={t('noDomains')}
          description={t('noDomainsBody')}
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus /> {t('addDomain')}
            </Button>
          }
        />
      )}

      {domains.data && domains.data.length > 0 && list.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t('noMatches')}</p>}

      {list.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {list.map((domain) => {
            // PurelyMail's shared domains: shown for reference, not configurable.
            if (domain.isShared)
              return (
                <li key={domain.name} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Globe className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{domain.name}</span>
                      <Badge>{t('shared')}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t('sharedHint')}</span>
                  </span>
                </li>
              );
            const failing = CHECKS.filter(([key]) => !domain.dnsSummary?.[key]).length;
            return (
              <li key={domain.name}>
                <button
                  onClick={() => setSelected(domain.name)}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50"
                >
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', failing ? 'bg-warning/15 text-warning' : 'bg-success/10 text-success')}>
                    <Globe className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{domain.name}</span>
                      {domain.isShared && <Badge>{t('shared')}</Badge>}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{failing ? t('someFail', { n: failing }) : t('allPass')}</span>
                  </span>
                  <span className="hidden sm:block">
                    <DnsPills domain={domain} />
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <AddDomainDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(name) => {
          queryClient.invalidateQueries({ queryKey: adminKeys.records(name) });
          setSelected(name);
        }}
      />
      <DomainSheet domain={current} onClose={() => setSelected(null)} />
    </div>
  );
}
