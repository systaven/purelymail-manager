import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Clock, Inbox, MailX, Search, UsersRound } from 'lucide-react';
import { EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Avatar, Badge, Kbd, Skeleton } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { membersMessages } from '@/lib/i18n/messages/members';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { memberKeys, memberLabel, membersApi, type Member } from '@/lib/members-api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { MemberSheet } from './MemberSheet';
import { MemberBadges, useRelativeTime } from './shared';

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function Usage({ member, className }: { member: Member; className?: string }) {
  const t = useT(membersMessages);
  const used = member.mailboxes + member.pendingRequests;
  const max = member.limits.maxMailboxes;
  const full = used >= max;
  return (
    <span className={cn('flex flex-col items-end gap-1', className)} title={t('usageTitle')}>
      <span className="flex items-center gap-1.5 text-sm tabular-nums">
        <Inbox className="size-3.5 text-muted-foreground" />
        {member.mailboxes}
        <span className="text-muted-foreground">/ {max}</span>
      </span>
      <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-muted sm:block">
        <span
          className={cn('block h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${max ? Math.min(100, (used / max) * 100) : 100}%` }}
        />
      </span>
    </span>
  );
}

export function MembersTab() {
  const t = useT(membersMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const relative = useRelativeTime();
  const { session } = useSession();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const members = useQuery({ queryKey: memberKeys.members, queryFn: membersApi.members });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || selected) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (members.data ?? []).filter((m) => !q || `${m.name ?? ''} ${m.email ?? ''}`.toLowerCase().includes(q));
  }, [members.data, query]);

  const isSelf = (m: Member) => Boolean(session?.email && m.email?.toLowerCase() === session.email.toLowerCase());
  const current = members.data?.find((m) => m.clerkUserId === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} className="pl-8 sm:pr-8" />
          <Kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
        </div>
        {members.data && <span className="shrink-0 text-sm text-muted-foreground">{t('count', { n: list.length })}</span>}
      </div>

      {members.isError && <ErrorBanner message={errorText(members.error)} onRetry={() => members.refetch()} retryLabel={tc('retry')} />}

      {members.isPending && (
        <div className="divide-y rounded-xl border bg-card">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      )}

      {members.data?.length === 0 && <EmptyState icon={UsersRound} title={t('noMembers')} description={t('noMembersBody')} />}
      {!!members.data?.length && !list.length && <p className="py-10 text-center text-sm text-muted-foreground">{t('noMatches')}</p>}

      {list.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {list.map((m) => (
            <li key={m.clerkUserId}>
              <button
                onClick={() => setSelected(m.clerkUserId)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 sm:gap-4',
                  m.disabled && 'opacity-70'
                )}
              >
                <Avatar name={memberLabel(m)} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium">{memberLabel(m)}</span>
                    <MemberBadges member={m} isSelf={isSelf(m)} />
                    {!m.limits.mailApps && (
                      <Badge className="gap-1 bg-muted text-muted-foreground" title={t('noMailAppsTitle')}>
                        <MailX className="size-3" /> {t('noMailApps')}
                      </Badge>
                    )}
                    {m.pendingRequests > 0 && <Badge className="bg-warning/15 text-foreground">{t('pendingCount', { n: m.pendingRequests })}</Badge>}
                  </span>
                  {m.name && m.email && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{m.email}</span>}
                </span>
                <span className="hidden w-28 items-center justify-end gap-1.5 text-xs text-muted-foreground md:flex">
                  <Clock className="size-3.5" />
                  {relative(m.lastSeenAt) ?? t('neverSeen')}
                </span>
                <Usage member={m} className="w-16 shrink-0" />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <MemberSheet key={current?.clerkUserId} member={current} isSelf={current ? isSelf(current) : false} onClose={() => setSelected(null)} />
    </div>
  );
}
