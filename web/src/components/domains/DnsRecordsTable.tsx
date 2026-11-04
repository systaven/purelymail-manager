import { CircleCheck, CircleDashed, CircleHelp } from 'lucide-react';
import { CopyButton } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/misc';
import type { DnsRecord } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { domainsMessages } from '@/lib/i18n/messages/domains';
import { cn } from '@/lib/utils';

// Most DNS providers want the host relative to the domain ("@" for the apex).
function relativeHost(name: string, domain: string) {
  if (name === domain) return '@';
  return name.endsWith(`.${domain}`) ? name.slice(0, -domain.length - 1) : name;
}

function Status({ found }: { found: boolean | null }) {
  const t = useT(domainsMessages);
  if (found === true) return <CircleCheck className="size-4 text-success" aria-label={t('found')} />;
  if (found === false) return <CircleDashed className="size-4 text-warning" aria-label={t('missing')} />;
  return <CircleHelp className="size-4 text-muted-foreground" aria-label={t('unknown')} />;
}

const PURPOSE_KEYS = { mx: 'mx', spf: 'spf', ownership: 'ownership', dkim: 'dkim', dmarc: 'dmarc' } as const;

export function DnsRecordsTable({ domain, records, loading }: { domain: string; records?: DnsRecord[]; loading?: boolean }) {
  const t = useT(domainsMessages);

  if (loading || !records) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-lg border">
      {records.map((record) => {
        const host = relativeHost(record.name, domain);
        return (
          <li key={`${record.type}-${record.name}-${record.content}`} className={cn('flex gap-3 px-3 py-2.5', record.found === false && 'bg-warning/5')}>
            <div className="pt-0.5">
              <Status found={record.found} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono font-medium">{record.type}</span>
                {t(PURPOSE_KEYS[record.purpose]) !== record.type && (
                  <span className="font-medium text-muted-foreground">{t(PURPOSE_KEYS[record.purpose])}</span>
                )}
                {record.priority !== undefined && (
                  <span className="text-muted-foreground">
                    {t('priority')} {record.priority}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-2 text-sm">
                <span className="text-xs text-muted-foreground">{t('host')}</span>
                <code className="truncate font-mono text-[13px]" title={record.name}>
                  {host}
                </code>
                <CopyButton value={host} label={`${t('copy')} ${t('host')}`} copiedText={t('copied')} className="size-7" />
                <span className="text-xs text-muted-foreground">{t('value')}</span>
                <code className="break-all font-mono text-[13px]">{record.content}</code>
                <CopyButton value={record.content} label={`${t('copy')} ${t('value')}`} copiedText={t('copied')} className="size-7" />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
