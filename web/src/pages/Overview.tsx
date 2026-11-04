import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Globe, Inbox, Mailbox, Route, Wallet, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { useLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { dashboardMessages } from '@/lib/i18n/messages/dashboard';
import { useErrorText } from '@/lib/i18n/useErrorText';

interface Overview {
  credit: string;
  domains: number;
  healthyDomains: number;
  mailboxes: number;
  rules: number;
}

function Stat({ icon: Icon, label, value, hint, to }: { icon: LucideIcon; label: string; value?: string; hint?: string; to?: string }) {
  const body = (
    <Card className="h-full p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value ?? <Skeleton className="h-9 w-20" />}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function OverviewPage() {
  const t = useT(dashboardMessages);
  const tc = useT(commonMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const query = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/account/overview') });
  const data = query.data;
  const failed = query.isError ? '—' : undefined;
  const number = (n?: number) => failed ?? (n === undefined ? undefined : n.toLocaleString(locale));
  const credit =
    failed ?? (data ? `$${Number(data.credit).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined);

  const actions: { label: string; to: string; icon: LucideIcon }[] = [
    { label: t('openMail'), to: '/mail', icon: Inbox },
    { label: t('addMailbox'), to: '/users?new=1', icon: Mailbox },
    { label: t('addDomain'), to: '/domains?new=1', icon: Globe },
    { label: t('addRule'), to: '/routing?new=1', icon: Route },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t('greeting')} description={t('subtitle')} />
      {query.isError && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>
            {t('loadFailed')} {errorText(query.error)}
          </span>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            {tc('retry')}
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Wallet} label={t('credit')} value={credit} />
        <Stat
          icon={Globe}
          label={t('domains')}
          value={number(data?.domains)}
          hint={data ? t('dnsHealthy', { n: data.healthyDomains, total: data.domains }) : undefined}
          to="/domains"
        />
        <Stat icon={Mailbox} label={t('mailboxes')} value={number(data?.mailboxes)} to="/users" />
        <Stat icon={Route} label={t('rules')} value={number(data?.rules)} to="/routing" />
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold">{t('quickActions')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="group flex items-center gap-3 rounded-xl border bg-card p-4 text-sm font-medium shadow-xs transition-colors hover:bg-accent"
          >
            <action.icon className="size-4 text-primary" />
            <span className="flex-1">{action.label}</span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
