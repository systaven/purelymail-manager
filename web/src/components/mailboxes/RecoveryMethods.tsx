import { useState, type FormEvent } from 'react';
import { Info, Loader2, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Section } from '@/components/ui/sheet';
import { adminApi, adminKeys, type ResetMethod } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';

type Editing = { kind: 'new' } | { kind: 'edit'; method: ResetMethod } | null;

export function RecoveryMethods({ address, methods, active }: { address: string; methods: ResetMethod[]; active: boolean }) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Editing>(null);
  const remove = useAction((target: string) => adminApi.deleteRecovery(address, target), {
    success: t('recoveryRemoved'),
    invalidate: [adminKeys.mailbox(address)],
  });

  const onRemove = async (method: ResetMethod) => {
    const ok = await confirm({
      title: t('removeRecoveryTitle'),
      description: t('removeRecoveryBody', { target: method.target }),
      confirmLabel: t('remove'),
      cancelLabel: tc('cancel'),
      destructive: true,
    });
    if (ok) remove.mutate(method.target);
  };

  return (
    <Section title={t('recovery')} description={t('recoveryHint')}>
      {!active && methods.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {t('recoveryInactive')}
        </p>
      )}
      {methods.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {methods.map((method) =>
            editing?.kind === 'edit' && editing.method.target === method.target ? (
              <li key={method.target} className="p-3">
                <RecoveryForm address={address} initial={method} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={method.target} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  {method.type === 'phone' ? <Phone className="size-4" /> : <Mail className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{method.target}</p>
                  {method.description && <p className="truncate text-xs text-muted-foreground">{method.description}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={t('editRecovery')}
                  title={t('editRecovery')}
                  onClick={() => setEditing({ kind: 'edit', method })}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t('remove')}
                  title={t('remove')}
                  disabled={remove.isPending && remove.variables === method.target}
                  onClick={() => onRemove(method)}
                >
                  {remove.isPending && remove.variables === method.target ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </li>
            )
          )}
        </ul>
      )}
      {editing?.kind === 'new' ? (
        <div className="rounded-lg border p-3">
          <RecoveryForm address={address} onDone={() => setEditing(null)} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {methods.length === 0 && <p className="text-sm text-muted-foreground">{t('noRecovery')}</p>}
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditing({ kind: 'new' })}>
            <Plus />
            {t('addRecovery')}
          </Button>
        </div>
      )}
    </Section>
  );
}

function RecoveryForm({ address, initial, onDone }: { address: string; initial?: ResetMethod; onDone: () => void }) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const [type, setType] = useState<ResetMethod['type']>(initial?.type ?? 'email');
  const [target, setTarget] = useState(initial?.target ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tried, setTried] = useState(false);
  const save = useAction((method: ResetMethod & { existingTarget?: string }) => adminApi.setRecovery(address, method), {
    success: t('recoverySaved'),
    invalidate: [adminKeys.mailbox(address)],
  });
  const missing = tried && !target.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!target.trim()) return;
    save.mutate(
      {
        type,
        target: target.trim(),
        description: description.trim() || undefined,
        allowMfaReset: initial?.allowMfaReset,
        existingTarget: initial?.target,
      },
      { onSuccess: onDone }
    );
  };

  const types = [
    { value: 'email' as const, label: t('typeEmail'), icon: Mail },
    { value: 'phone' as const, label: t('typePhone'), icon: Phone },
  ];

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {/* Segmented control for the method type */}
      <div role="radiogroup" className="inline-flex rounded-lg bg-muted p-0.5">
        {types.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={type === value}
            onClick={() => setType(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors',
              type === value && 'bg-background text-foreground shadow-xs'
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="recovery-target">{type === 'email' ? t('targetEmail') : t('targetPhone')}</Label>
          <Input
            id="recovery-target"
            autoFocus
            type={type === 'email' ? 'email' : 'tel'}
            inputMode={type === 'email' ? 'email' : 'tel'}
            placeholder={type === 'email' ? 'name@example.com' : '+1 555 0100'}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-invalid={missing || undefined}
          />
          {missing && <p className="text-xs text-destructive">{t('targetRequired')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recovery-description">
            {t('recoveryDescription')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </Label>
          <Input
            id="recovery-description"
            maxLength={100}
            placeholder={t('recoveryDescriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {tc('save')}
        </Button>
      </div>
    </form>
  );
}
