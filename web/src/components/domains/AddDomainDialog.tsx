import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi, adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { domainsMessages } from '@/lib/i18n/messages/domains';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { DnsRecordsTable } from './DnsRecordsTable';

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function Steps({ step }: { step: 1 | 2 }) {
  const t = useT(domainsMessages);
  return (
    <ol className="flex items-center gap-2 text-xs font-medium">
      {[t('stepDomain'), t('stepDns')].map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-6 bg-border" />}
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full border text-[11px]',
              step > i + 1 ? 'border-primary bg-primary text-primary-foreground' : step === i + 1 ? 'border-primary text-primary' : 'text-muted-foreground'
            )}
          >
            {i + 1}
          </span>
          <span className={step === i + 1 ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

// Two steps: the domain name, then the DNS records to publish (checked live)
// before PurelyMail is asked to add it.
export function AddDomainDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: (domain: string) => void }) {
  const t = useT(domainsMessages);
  const errorText = useErrorText();
  const [input, setInput] = useState('');
  const [domain, setDomain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const records = useQuery({
    queryKey: adminKeys.records(domain ?? ''),
    queryFn: () => adminApi.records(domain!),
    enabled: Boolean(domain),
    staleTime: 0,
  });
  const add = useAction((name: string) => adminApi.addDomain(name), {
    success: (_r) => t('added', { domain: domain ?? '' }),
    invalidate: [adminKeys.domains, adminKeys.overview],
    errorToast: false,
  });

  const reset = () => {
    setInput('');
    setDomain(null);
    setError(null);
    add.reset();
  };

  const next = (e: FormEvent) => {
    e.preventDefault();
    const name = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
    if (!DOMAIN_RE.test(name)) return setError(t('domainHint'));
    setError(null);
    setDomain(name);
  };

  const submit = () =>
    add.mutate(domain!, {
      onSuccess: () => {
        onAdded(domain!);
        onOpenChange(false);
        reset();
      },
      onError: (err) => setError(errorText(err)),
    });

  const ownership = records.data?.find((r) => r.purpose === 'ownership');
  const ownershipFound = ownership?.found === true;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className={cn('flex max-h-[80vh] flex-col', domain && 'max-w-2xl')}>
        <div className="space-y-3 border-b px-5 py-4">
          <DialogTitle>{t('addDomain')}</DialogTitle>
          <Steps step={domain ? 2 : 1} />
        </div>

        {!domain ? (
          <form onSubmit={next} className="space-y-4 px-5 py-5">
            <div className="space-y-2">
              <Label htmlFor="domain">{t('domainLabel')}</Label>
              <Input
                id="domain"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder={t('domainPlaceholder')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-invalid={Boolean(error)}
              />
              <DialogDescription className={cn('text-xs', error && 'text-destructive')}>{error ?? t('domainHint')}</DialogDescription>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!input.trim()}>
                {t('next')}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <p className="text-sm text-muted-foreground">{t('wizardDnsHint')}</p>
              <DnsRecordsTable domain={domain} records={records.data} loading={records.isPending} />
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" /> {t('cloudflareNote')}
              </p>
              {records.data && (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                    ownershipFound ? 'bg-success/10 text-success' : 'bg-warning/10 text-foreground'
                  )}
                >
                  {ownershipFound ? <CircleCheck className="size-4" /> : <Info className="size-4 text-warning" />}
                  {ownershipFound ? t('readyToAdd') : t('ownershipMissing')}
                </div>
              )}
              {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
              <Button variant="ghost" onClick={() => setDomain(null)}>
                {t('back')}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => records.refetch()} disabled={records.isFetching}>
                  <RefreshCw className={cn(records.isFetching && 'animate-spin')} /> {t('checkAgain')}
                </Button>
                <Button variant={ownershipFound ? 'default' : 'secondary'} onClick={submit} disabled={add.isPending}>
                  {add.isPending ? t('adding') : ownershipFound ? t('addNow') : t('tryAnyway')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
