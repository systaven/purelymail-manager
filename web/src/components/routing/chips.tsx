import { ExternalLink, Inbox } from 'lucide-react';
import type { NewRoutingRule } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { routingMessages } from '@/lib/i18n/messages/routing';
import { cn } from '@/lib/utils';
import { ruleKind, type RuleKind } from './rules';

// The rule's address pattern: sales@d, support-*@d, *@d.
export function PatternChip({ rule, className }: { rule: Pick<NewRoutingRule, 'prefix' | 'matchUser' | 'domainName'>; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-baseline rounded-md border bg-background px-2 py-0.5 text-sm font-medium', className)}>
      <span className="truncate">
        {rule.matchUser}
        {rule.prefix && <span className="font-semibold text-primary">*</span>}
        <span className="text-muted-foreground">@{rule.domainName}</span>
      </span>
    </span>
  );
}

const KIND_STYLE: Record<RuleKind, string> = {
  exact: 'bg-secondary text-secondary-foreground',
  prefix: 'bg-primary/10 text-primary',
  catchall: 'bg-warning/20 text-foreground',
};

export function KindBadge({ rule }: { rule: Pick<NewRoutingRule, 'prefix' | 'matchUser' | 'catchall'> }) {
  const t = useT(routingMessages);
  const kind = ruleKind(rule);
  const label = { exact: t('kindExact'), prefix: t('kindPrefix'), catchall: t('kindCatchall') }[kind];
  const hint = { exact: t('kindExactHint'), prefix: t('kindPrefixHint'), catchall: t('kindCatchallHint') }[kind];
  return (
    <>
      <span title={hint} className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium', KIND_STYLE[kind])}>
        {label}
      </span>
      {rule.catchall && kind !== 'catchall' && (
        <span title={t('onlyUnknownHint')} className="inline-flex shrink-0 items-center rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
          {t('onlyUnknown')}
        </span>
      )}
    </>
  );
}

// A delivery target: mailboxes on the account vs. external forwards.
export function TargetChip({ address, internal, className }: { address: string; internal: boolean; className?: string }) {
  const t = useT(routingMessages);
  const Icon = internal ? Inbox : ExternalLink;
  return (
    <span
      title={`${address} · ${internal ? t('internalTarget') : t('externalTarget')}`}
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-sm',
        internal ? 'bg-accent text-accent-foreground' : 'border border-dashed text-foreground',
        className
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', internal ? 'text-primary' : 'text-muted-foreground')} />
      <span className="truncate">{address}</span>
    </span>
  );
}
