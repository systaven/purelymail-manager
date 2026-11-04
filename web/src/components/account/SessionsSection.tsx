import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useClerk } from '@clerk/react';
import type { SessionWithActivitiesResource, UserResource } from '@clerk/react/types';
import { LogOut, Monitor, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { ErrorBanner } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/misc';
import { useLocale, useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { InlineError, Pill, SESSIONS_KEY, Section, Spinner, relativeTime, useClerkErrorText, useTask } from './shared';

function deviceIcon(session: SessionWithActivitiesResource) {
  const a = session.latestActivity;
  if (/ipad|tablet/i.test(a?.deviceType ?? '')) return Tablet;
  return a?.isMobile ? Smartphone : Monitor;
}

function SessionRow({
  session,
  current,
  onRevoked,
}: {
  session: SessionWithActivitiesResource;
  current: boolean;
  onRevoked: () => void;
}) {
  const t = useT(accountMessages);
  const { locale } = useLocale();
  const task = useTask();
  const a = session.latestActivity ?? ({} as SessionWithActivitiesResource['latestActivity']);
  const Icon = deviceIcon(session);
  const browser = [a.browserName, a.browserVersion?.split('.')[0]].filter(Boolean).join(' ') || t('unknownBrowser');
  const title = a.deviceType ? t('browserOnDevice', { browser, device: a.deviceType }) : browser;
  const place = [a.city, a.country].filter(Boolean).join(', ');
  const lastActive = session.lastActiveAt ? new Date(session.lastActiveAt) : null;

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 sm:items-center">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary sm:mt-0">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <span className="truncate">{title}</span>
          {current && <Pill tone="success">{t('thisDevice')}</Pill>}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
          {place && <span>{place}</span>}
          {place && a.ipAddress && <span aria-hidden>·</span>}
          {a.ipAddress && <span className="font-mono">{a.ipAddress}</span>}
          {(place || a.ipAddress) && <span aria-hidden>·</span>}
          {current ? (
            <span className="text-success">{t('activeNow')}</span>
          ) : (
            lastActive && (
              <time dateTime={lastActive.toISOString()} title={lastActive.toLocaleString(locale)}>
                {t('lastActive', { when: relativeTime(lastActive, locale) })}
              </time>
            )
          )}
        </p>
        <InlineError message={task.error} className="mt-1" />
      </div>
      {!current && (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 text-muted-foreground"
          disabled={task.pending}
          aria-label={t('signOutDevice', { device: title })}
          onClick={async () => {
            const result = await task.run(() => session.revoke(), { success: t('deviceSignedOut'), inline: true });
            if (result.ok) onRevoked();
          }}
        >
          {task.pending ? <Spinner /> : <LogOut />}
          <span className="hidden sm:inline">{t('signOut')}</span>
        </Button>
      )}
    </div>
  );
}

export function SessionsSection({ user }: { user: UserResource }) {
  const t = useT(accountMessages);
  const clerk = useClerk();
  const confirm = useConfirm();
  const errorText = useClerkErrorText();
  const queryClient = useQueryClient();
  const all = useTask();
  const currentId = clerk.session?.id;

  const sessions = useQuery({
    queryKey: [...SESSIONS_KEY, user.id],
    queryFn: () => user.getSessions(),
    staleTime: 30_000,
  });

  const active = (sessions.data ?? [])
    .filter((s) => s.status === 'active' || !s.status)
    .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || +new Date(b.lastActiveAt) - +new Date(a.lastActiveAt));
  const others = active.filter((s) => s.id !== currentId);
  const refetch = () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });

  const signOutOthers = async () => {
    const ok = await confirm({
      title: t('signOutAllTitle'),
      description: t('signOutAllBody', { count: others.length }),
      confirmLabel: t('signOutAll'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    await all.run(async () => {
      const results = await Promise.allSettled(others.map((s) => s.revoke()));
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) throw (failed as PromiseRejectedResult).reason;
    }, { success: t('othersSignedOut') });
    void refetch();
  };

  return (
    <Section
      id="devices"
      title={t('devices')}
      description={t('devicesHint')}
      action={
        others.length > 0 && (
          <Button size="sm" variant="outline" onClick={signOutOthers} disabled={all.pending}>
            {all.pending ? <Spinner /> : <LogOut />} {t('signOutAll')}
          </Button>
        )
      }
    >
      {sessions.isPending &&
        [0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      {sessions.isError && (
        <div className="p-4">
          <ErrorBanner message={errorText(sessions.error)} onRetry={() => sessions.refetch()} retryLabel={t('retry')} />
        </div>
      )}
      {active.map((session) => (
        <SessionRow key={session.id} session={session} current={session.id === currentId} onRevoked={refetch} />
      ))}
    </Section>
  );
}
