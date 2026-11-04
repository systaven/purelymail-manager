import { ArrowRight, CircleAlert, CircleCheck, CircleSlash, FlaskConical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';
import { routingMessages } from '@/lib/i18n/messages/routing';
import { KindBadge, PatternChip, TargetChip } from './chips';
import type { TestResult } from './rules';

interface Props {
  value: string;
  onChange: (value: string) => void;
  result: TestResult | null;
  isInternal: (address: string) => boolean;
}

// "Which rule would handle this address?" — a client-side approximation.
export function AddressTester({ value, onChange, result, isInternal }: Props) {
  const t = useT(routingMessages);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-primary">
          <FlaskConical className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('testTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('testDescription')}</p>
        </div>
      </div>
      <Input
        className="mt-3"
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        aria-label={t('testTitle')}
        placeholder={t('testPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div aria-live="polite" className="empty:hidden">
        {result && <Result result={result} isInternal={isInternal} />}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{t('testApprox')}</p>
    </Card>
  );
}

function Result({ result, isInternal }: { result: TestResult; isInternal: (address: string) => boolean }) {
  const t = useT(routingMessages);
  if (result.type === 'rule') {
    const { rule } = result;
    return (
      <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
        <p className="flex items-center gap-1.5 text-xs font-medium text-success">
          <CircleCheck className="size-3.5" /> {t('testMatched')}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <PatternChip rule={rule} />
          <KindBadge rule={rule} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowRight className="size-3.5" /> {t('testDeliversTo')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {rule.targetAddresses.map((a) => (
            <TargetChip key={a} address={a} internal={isInternal(a)} />
          ))}
        </div>
        {result.hasMailbox && <p className="text-xs text-muted-foreground">{t('testOverridesMailbox')}</p>}
      </div>
    );
  }
  const [Icon, text, tone] =
    result.type === 'mailbox'
      ? [CircleCheck, t('testMailbox', { address: result.address }), 'text-success']
      : result.type === 'none'
        ? [CircleSlash, t('testNone'), 'text-destructive']
        : result.type === 'unknownDomain'
          ? [CircleAlert, t('testUnknownDomain', { domain: result.domain }), 'text-muted-foreground']
          : [CircleAlert, t('testInvalid'), 'text-muted-foreground'];
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}
