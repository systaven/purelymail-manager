import { useId, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, AtSign, ChevronRight, Info, Asterisk, Inbox, ShieldAlert } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Kbd } from '@/components/ui/misc';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { adminApi, adminKeys, type MailboxSummary, type NewRoutingRule, type RoutingRule } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { routingMessages } from '@/lib/i18n/messages/routing';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { PatternChip, TargetChip } from './chips';
import { EMAIL_RE, LOCAL_RE, MAX_TARGETS, interceptedMailboxes, parseAddresses, ruleKind, rulePattern, type RuleKind } from './rules';
import { TargetsInput } from './TargetsInput';

export type EditorTarget = { id?: number; rule?: Partial<NewRoutingRule> };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // id set → edit that rule; otherwise create (optionally prefilled, e.g. Duplicate).
  target: EditorTarget;
  domains: string[];
  mailboxes: MailboxSummary[];
  rules: RoutingRule[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-3';

export function RuleEditor({ open, onOpenChange, target, domains, mailboxes, rules }: Props) {
  const t = useT(routingMessages);
  const tc = useT(commonMessages);
  const ids = useId();
  const initial = target.rule ?? {};
  const editing = target.id !== undefined;

  const [chosenDomain, setDomainName] = useState(initial.domainName ?? '');
  // Domains may still be loading when the editor opens.
  const domainName = chosenDomain || domains[0] || '';
  const [kind, setKind] = useState<RuleKind>(initial.prefix !== undefined ? ruleKind(initial as NewRoutingRule) : 'exact');
  const [matchUser, setMatchUser] = useState(initial.matchUser ?? '');
  const [onlyUnknown, setOnlyUnknown] = useState(Boolean(initial.catchall));
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initial.catchall) && kind !== 'catchall');
  const [targets, setTargets] = useState<string[]>(initial.targetAddresses ?? []);
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const invalidate = [adminKeys.routing, adminKeys.overview];
  const create = useAction(adminApi.createRule, { success: t('created'), invalidate });
  const update = useAction(({ id, rule }: { id: number; rule: NewRoutingRule }) => adminApi.updateRule(id, rule), { success: t('updated'), invalidate });
  const pending = create.isPending || update.isPending;

  const rule: NewRoutingRule = {
    domainName,
    prefix: kind !== 'exact',
    matchUser: kind === 'catchall' ? '' : matchUser.trim(),
    targetAddresses: targets,
    catchall: kind === 'catchall' || onlyUnknown,
  };
  const mailboxAddresses = useMemo(() => mailboxes.map((m) => m.address.toLowerCase()).sort(), [mailboxes]);
  const internal = useMemo(() => new Set(mailboxAddresses), [mailboxAddresses]);

  // Problems that block saving, and warnings that don't.
  const addressError =
    kind === 'exact' && !rule.matchUser ? t('addressRequired') : rule.matchUser && !LOCAL_RE.test(rule.matchUser) ? t('invalidLocal') : null;
  const targetsError = !targets.length
    ? t('targetsRequired')
    : targets.some((a) => !EMAIL_RE.test(a))
      ? t('targetsInvalid')
      : targets.length > MAX_TARGETS
        ? t('targetsTooMany', { max: MAX_TARGETS })
        : null;
  const duplicate = rules.some((r) => r.id !== target.id && r.domainName === rule.domainName && r.prefix === rule.prefix && r.matchUser === rule.matchUser);
  const intercepted = addressError ? [] : interceptedMailboxes(rule, mailboxes).filter((m) => !targets.includes(m.address.toLowerCase()));
  const privateHit = intercepted.find((m) => m.owner);
  const blocked = Boolean(!domainName || addressError || duplicate || privateHit);

  const list = (items: string[]) =>
    items.length > 3 ? t('andMore', { list: items.slice(0, 3).join(', '), n: items.length - 3 }) : items.join(', ');

  const save = async () => {
    // Commit whatever is still being typed in the targets field.
    const typed = parseAddresses(draft).filter((a) => !targets.includes(a));
    const finalRule = { ...rule, targetAddresses: [...targets, ...typed] };
    if (typed.length) {
      setTargets(finalRule.targetAddresses);
      setDraft('');
    }
    setSubmitted(true);
    const finalTargetsOk = finalRule.targetAddresses.length > 0 && finalRule.targetAddresses.length <= MAX_TARGETS && finalRule.targetAddresses.every((a) => EMAIL_RE.test(a));
    if (blocked || !finalTargetsOk || pending) return;
    try {
      if (editing) await update.mutateAsync({ id: target.id!, rule: finalRule });
      else await create.mutateAsync(finalRule);
      onOpenChange(false);
    } catch {
      // useAction already showed the error; keep the editor open.
    }
  };

  const kinds: { value: RuleKind; label: string; icon: typeof AtSign }[] = [
    { value: 'exact', label: t('typeExact'), icon: AtSign },
    { value: 'prefix', label: t('typePrefix'), icon: Asterisk },
    { value: 'catchall', label: t('typeCatchall'), icon: Inbox },
  ];
  const help = { exact: t('typeExactHelp', { domain: domainName || 'example.com' }), prefix: t('typePrefixHelp', { domain: domainName || 'example.com' }), catchall: t('typeCatchallHelp', { domain: domainName || 'example.com' }) }[kind];
  const domainOptions = domains.includes(domainName) || !domainName ? domains : [domainName, ...domains];

  return (
    <Sheet open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <SheetContent
        title={editing ? t('editorEdit') : t('editorNew')}
        description={t('editorDescription')}
        onOpenAutoFocus={(e) => {
          // Start in the address field (or targets for a catch-all) rather than the close button.
          const field = document.getElementById(`${ids}-user`) ?? document.getElementById(`${ids}-targets`);
          if (field) {
            e.preventDefault();
            field.focus();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Let an open suggestion list close first.
          if (document.activeElement?.matches('[role="combobox"][aria-expanded="true"]')) e.preventDefault();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={pending || (submitted && blocked)}>
              {editing ? t('saveChanges') : t('create')}
              <Kbd className="hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground sm:inline-flex">{isMac ? '⌘↵' : 'Ctrl ↵'}</Kbd>
            </Button>
          </>
        }
      >
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {editing && <Note icon={Info}>{t('editNote')}</Note>}

          <div className="space-y-2">
            <Label htmlFor={`${ids}-domain`}>{t('domain')}</Label>
            <select id={`${ids}-domain`} className={selectClass} value={domainName} onChange={(e) => setDomainName(e.target.value)} disabled={!domainOptions.length}>
              {!domainOptions.length && <option value="">{t('noDomains')}</option>}
              {domainOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label id={`${ids}-kind`}>{t('match')}</Label>
            <RadioGroup.Root
              aria-labelledby={`${ids}-kind`}
              value={kind}
              onValueChange={(v) => {
                // The catch-all type sets the flag itself; don't carry it over silently.
                if (kind === 'catchall') setOnlyUnknown(false);
                setKind(v as RuleKind);
              }}
              className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
            >
              {kinds.map(({ value, label, icon: Icon }) => (
                <RadioGroup.Item
                  key={value}
                  value={value}
                  className="flex min-h-9 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-center text-xs font-medium leading-tight text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm sm:flex-row sm:gap-1.5"
                >
                  <Icon className="size-3.5 shrink-0" />
                  {label}
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
            <p className="text-xs text-muted-foreground">{help}</p>
          </div>

          {kind === 'catchall' ? (
            <Note icon={Info}>{t('catchallExplainer')}</Note>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`${ids}-user`}>{kind === 'exact' ? t('address') : t('addressStart')}</Label>
              <div
                className={cn(
                  'flex h-9 w-full items-center overflow-hidden rounded-md border border-input bg-background text-sm shadow-xs transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-3',
                  submitted && addressError && 'border-destructive'
                )}
              >
                <input
                  id={`${ids}-user`}
                  value={matchUser}
                  onChange={(e) => setMatchUser(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  placeholder={kind === 'exact' ? t('addressPlaceholder') : t('prefixPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(submitted && addressError) || undefined}
                  aria-describedby={`${ids}-user-error`}
                  className="h-full min-w-0 flex-1 bg-transparent px-1 pl-3 text-right outline-none placeholder:text-muted-foreground"
                />
                <span className="flex h-full max-w-[60%] shrink-0 items-center truncate border-l bg-muted px-3 text-muted-foreground">
                  {kind === 'prefix' && <span className="font-semibold text-primary">*</span>}@{domainName || '…'}
                </span>
              </div>
              {addressError && (submitted || matchUser) && (
                <p id={`${ids}-user-error`} className="text-xs text-destructive">
                  {addressError}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${ids}-targets`}>{t('targets')}</Label>
            <TargetsInput
              id={`${ids}-targets`}
              value={targets}
              onChange={setTargets}
              draft={draft}
              onDraftChange={setDraft}
              suggestions={mailboxAddresses}
              invalid={Boolean(submitted && targetsError && !draft.trim())}
              describedBy={`${ids}-targets-help`}
            />
            <p id={`${ids}-targets-help`} className={cn('text-xs', submitted && targetsError && !draft.trim() ? 'text-destructive' : 'text-muted-foreground')}>
              {submitted && targetsError && !draft.trim() ? targetsError : t('targetsHelp')}
            </p>
          </div>

          {kind !== 'catchall' && (
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
                className="flex w-full items-center gap-1.5 px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-3"
              >
                <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', showAdvanced && 'rotate-90')} />
                {t('advanced')}
              </button>
              {showAdvanced && (
                <div className="flex items-start justify-between gap-4 border-t px-3 py-3">
                  <div>
                    <Label htmlFor={`${ids}-only`}>{t('onlyUnknownLabel')}</Label>
                    <p className="mt-1 text-xs text-muted-foreground">{t('onlyUnknownHelp')}</p>
                  </div>
                  <Switch id={`${ids}-only`} checked={onlyUnknown} onCheckedChange={setOnlyUnknown} />
                </div>
              )}
            </div>
          )}

          {duplicate && <Note icon={AlertTriangle} tone="destructive">{t('duplicateExists', { pattern: rulePattern(rule) })}</Note>}
          {privateHit ? (
            <Note icon={ShieldAlert} tone="destructive">
              {t('interceptsPrivate', { address: privateHit.address })}
            </Note>
          ) : (
            intercepted.length > 0 && <Note icon={AlertTriangle} tone="warning">{t('interceptsMailboxes', { list: list(intercepted.map((m) => m.address)) })}</Note>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('preview')}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
              <span className="text-muted-foreground">{t('previewMailTo')}</span>
              <PatternChip rule={rule} />
              {rule.catchall && <span className="text-xs text-muted-foreground">{t('previewQualifier')}</span>}
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {targets.length ? (
                targets.map((a) => <TargetChip key={a} address={a} internal={internal.has(a)} className={cn(!EMAIL_RE.test(a) && 'text-destructive')} />)
              ) : (
                <span className="italic text-muted-foreground">{t('previewNoTargets')}</span>
              )}
            </div>
          </div>
          {/* Lets Enter in the address field submit. */}
          <button type="submit" hidden />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Note({ icon: Icon, tone = 'info', children }: { icon: typeof Info; tone?: 'info' | 'warning' | 'destructive'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
        tone === 'info' && 'bg-muted/50 text-muted-foreground',
        tone === 'warning' && 'border-warning/40 bg-warning/10 text-foreground',
        tone === 'destructive' && 'border-destructive/30 bg-destructive/10 text-destructive'
      )}
    >
      <Icon className={cn('mt-px size-3.5 shrink-0', tone === 'warning' && 'text-warning')} />
      <div>{children}</div>
    </div>
  );
}
