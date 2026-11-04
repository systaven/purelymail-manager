import { useQuery } from '@tanstack/react-query';
import { Info, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Section, Sheet, SheetContent } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { adminApi, adminKeys, type Domain } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { domainsMessages } from '@/lib/i18n/messages/domains';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { DnsRecordsTable } from './DnsRecordsTable';

function SettingRow({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  const id = `setting-${label}`;
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function DomainSheet({ domain, onClose }: { domain: Domain | null; onClose: () => void }) {
  const t = useT(domainsMessages);
  const tc = useT(commonMessages);
  const confirm = useConfirm();
  const name = domain?.name ?? '';

  const records = useQuery({ queryKey: adminKeys.records(name), queryFn: () => adminApi.records(name), enabled: Boolean(domain), staleTime: 0 });
  const update = useAction((settings: Parameters<typeof adminApi.updateDomain>[1]) => adminApi.updateDomain(name, settings), {
    success: t('saved'),
    invalidate: [adminKeys.domains],
  });
  const recheck = useAction(() => adminApi.updateDomain(name, { recheckDns: true }), {
    success: t('recheckDone'),
    invalidate: [adminKeys.domains, adminKeys.overview],
  });
  const remove = useAction(() => adminApi.deleteDomain(name), {
    success: t('deleted', { domain: name }),
    invalidate: [adminKeys.domains, adminKeys.mailboxes, adminKeys.overview],
  });

  const askDelete = async () => {
    const ok = await confirm({
      title: t('deleteConfirmTitle', { domain: name }),
      description: t('deleteConfirmBody', { domain: name }),
      confirmLabel: t('deleteDomain'),
      cancelLabel: tc('cancel'),
      destructive: true,
      typeToConfirm: { value: name, prompt: t('typeToConfirm', { value: name }) },
    });
    if (ok) remove.mutate(undefined, { onSuccess: onClose });
  };

  return (
    <Sheet open={Boolean(domain)} onOpenChange={(open) => !open && onClose()}>
      {domain && (
        <SheetContent title={domain.name} description={domain.isShared ? t('shared') : undefined} className="sm:max-w-xl">
          <div className="space-y-8">
            <Section title={t('dnsRecords')} description={t('dnsRecordsHint')}>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => records.refetch()} disabled={records.isFetching}>
                  <RefreshCw className={cn(records.isFetching && 'animate-spin')} /> {t('checkAgain')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => recheck.mutate(undefined)} disabled={recheck.isPending}>
                  {t('recheckPurelymail')}
                </Button>
              </div>
              <DnsRecordsTable domain={domain.name} records={records.data} loading={records.isPending} />
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" /> {t('cloudflareNote')}
              </p>
            </Section>

            <Section title={t('settings')}>
              <SettingRow
                label={t('allowAccountReset')}
                hint={t('allowAccountResetHint')}
                checked={domain.allowAccountReset}
                disabled={update.isPending}
                onChange={(allowAccountReset) => update.mutate({ allowAccountReset })}
              />
              <SettingRow
                label={t('subaddressing')}
                hint={t('subaddressingHint')}
                checked={domain.symbolicSubaddressing}
                disabled={update.isPending}
                onChange={(symbolicSubaddressing) => update.mutate({ symbolicSubaddressing })}
              />
            </Section>

            <Section title={t('dangerZone')}>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('deleteDomain')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('deleteDomainHint')}</p>
                </div>
                <Button variant="destructive" size="sm" onClick={askDelete} disabled={remove.isPending}>
                  <Trash2 /> {t('deleteDomain')}
                </Button>
              </div>
            </Section>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
