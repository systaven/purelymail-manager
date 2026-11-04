import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { adminApi, adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { membersMessages } from '@/lib/i18n/messages/members';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { memberKeys, membersApi, type MemberDefaults } from '@/lib/members-api';
import { useAction } from '@/lib/mutation';
import { DomainChecklist } from './shared';

function Field({ id, label, hint, children }: { id?: string; label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <label htmlFor={id} className="min-w-0 sm:max-w-xs">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </label>
      <div className="min-w-0 sm:w-[22rem] sm:shrink-0">{children}</div>
    </div>
  );
}

function DefaultsForm({ initial, domains }: { initial: MemberDefaults; domains: string[] }) {
  const t = useT(membersMessages);
  const tc = useT(commonMessages);
  const [draft, setDraft] = useState(initial);
  const [quota, setQuota] = useState(String(initial.maxMailboxes));
  const members = useQuery({ queryKey: memberKeys.members, queryFn: membersApi.members });

  const n = Number(quota);
  const validQuota = quota !== '' && Number.isInteger(n) && n >= 0 && n <= 1000;
  const next = { ...draft, maxMailboxes: n };
  const dirty =
    n !== initial.maxMailboxes ||
    draft.requiresApproval !== initial.requiresApproval ||
    [...draft.openDomains].sort().join() !== [...initial.openDomains].sort().join();

  const save = useAction(membersApi.saveDefaults, { success: t('defaultsSaved'), invalidate: [memberKeys.defaults, memberKeys.members] });
  const reset = () => {
    setDraft(initial);
    setQuota(String(initial.maxMailboxes));
  };

  const followers = members.data?.filter((m) => Object.values(m.overrides).every((v) => v === null)).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (validQuota && dirty) save.mutate(next);
      }}
    >
      <Card className="divide-y">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold">{t('defaultsTitle')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('defaultsHint')}</p>
          {members.data && (
            <p className="mt-2 text-xs text-muted-foreground">{t('followers', { n: followers ?? 0, total: members.data.length })}</p>
          )}
        </div>
        <Field id="def-quota" label={t('defQuota')} hint={t('defQuotaHint')}>
          <Input
            id="def-quota"
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            className="w-28"
            value={quota}
            aria-invalid={!validQuota}
            onChange={(e) => setQuota(e.target.value)}
          />
        </Field>
        <Field id="def-approval" label={t('defApproval')} hint={t('defApprovalHint')}>
          <Switch id="def-approval" checked={draft.requiresApproval} onCheckedChange={(requiresApproval) => setDraft({ ...draft, requiresApproval })} />
        </Field>
        <Field label={t('openDomains')} hint={t('openDomainsHint')}>
          <div className="space-y-2">
            <DomainChecklist domains={domains} value={draft.openDomains} onChange={(openDomains) => setDraft({ ...draft, openDomains })} />
            {!draft.openDomains.length && domains.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="size-3.5 shrink-0 text-warning" /> {t('noOpenDomains')}
              </p>
            )}
          </div>
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2 bg-muted/30 px-5 py-3">
          {dirty && <span className="mr-auto text-xs text-muted-foreground">{t('unsaved')}</span>}
          <Button variant="ghost" onClick={reset} disabled={!dirty || save.isPending}>
            {t('discard')}
          </Button>
          <Button type="submit" disabled={!dirty || !validQuota || save.isPending}>
            {tc('save')}
          </Button>
        </div>
      </Card>
    </form>
  );
}

export function DefaultsTab() {
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const defaults = useQuery({ queryKey: memberKeys.defaults, queryFn: membersApi.defaults });
  const domains = useQuery({ queryKey: adminKeys.domains, queryFn: adminApi.domains });
  const error = defaults.error ?? domains.error;

  if (error)
    return (
      <ErrorBanner
        message={errorText(error)}
        onRetry={() => {
          defaults.refetch();
          domains.refetch();
        }}
        retryLabel={tc('retry')}
      />
    );

  if (!defaults.data || !domains.data)
    return (
      <Card className="space-y-6 p-5">
        <Skeleton className="h-5 w-48" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex justify-between gap-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </Card>
    );

  // Remount on new server data so the form starts from what was saved.
  return <DefaultsForm key={JSON.stringify(defaults.data)} initial={defaults.data} domains={domains.data.filter((d) => !d.isShared).map((d) => d.name)} />;
}
