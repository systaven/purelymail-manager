import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Globe, History, KeyRound, LogIn, Mailbox, Route, Search, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { adminApi, adminKeys, type AuditEntry } from '@/lib/admin-api';
import { useLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { settingsMessages } from '@/lib/i18n/messages/settings';
import { useErrorText } from '@/lib/i18n/useErrorText';

const PAGE_SIZE = 100;

function iconFor(action: string): LucideIcon {
  if (action.startsWith('domain.')) return Globe;
  if (action.startsWith('routing.')) return Route;
  if (action.includes('app_password') || action.includes('recovery')) return KeyRound;
  if (action.startsWith('mailbox.')) return Mailbox;
  if (action.startsWith('auth.')) return LogIn;
  return History;
}

// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS".
const parseAt = (at: string) => new Date(`${at.replace(' ', 'T')}Z`);

function relative(date: Date, locale: string) {
  const seconds = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds), 'second');
}

export default function SettingsPage() {
  const t = useT(settingsMessages);
  const tc = useT(commonMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const [filter, setFilter] = useState('');

  const log = useInfiniteQuery({
    queryKey: adminKeys.audit,
    queryFn: ({ pageParam }) => adminApi.audit(pageParam || undefined),
    initialPageParam: 0,
    getNextPageParam: (last: AuditEntry[]) => (last.length === PAGE_SIZE ? last[last.length - 1].id : undefined),
  });

  const label = (action: string) => (action in settingsMessages.en ? t(action as keyof typeof settingsMessages.en) : action);
  const entries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = log.data?.pages.flat() ?? [];
    return q ? all.filter((e) => [e.actor, e.target ?? '', label(e.action)].some((v) => v.toLowerCase().includes(q))) : all;
  }, [log.data, filter, t]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('activity')}</h2>
          <p className="text-xs text-muted-foreground">{t('activityHint')}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('filter')} className="pl-8" />
        </div>
      </div>

      {log.isError && <ErrorBanner message={errorText(log.error)} onRetry={() => log.refetch()} retryLabel={tc('retry')} />}
      {log.isPending && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {log.data && entries.length === 0 && <EmptyState icon={History} title={t('noActivity')} />}

      {entries.length > 0 && (
        <ol className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {entries.map((entry) => {
            const Icon = iconFor(entry.action);
            const at = parseAt(entry.at);
            return (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{label(entry.action)}</span>
                    {entry.target && <span className="ml-1.5 break-all font-mono text-[13px] text-muted-foreground">{entry.target}</span>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.actor}</p>
                </div>
                <time dateTime={at.toISOString()} title={at.toLocaleString(locale)} className="shrink-0 text-xs text-muted-foreground">
                  {relative(at, locale)}
                </time>
              </li>
            );
          })}
        </ol>
      )}

      {log.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => log.fetchNextPage()} disabled={log.isFetchingNextPage}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
