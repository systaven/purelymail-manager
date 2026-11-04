import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Globe, Info, Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ErrorBanner } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { ApiClientError } from '@/lib/api';
import { adminApi, adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { PasswordField } from './PasswordField';
import { DialogShell, MIN_PASSWORD } from './shared';

// Remount (new key) each time it opens so the form starts fresh. Without a
// password the server sets a random one; onConnect opens the mail-app guide.
export function CreateMailboxDialog({
  open,
  onOpenChange,
  defaultDomain,
  onConnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDomain?: string;
  onConnect?: (address: string) => void;
}) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const domains = useQuery({ queryKey: adminKeys.domains, queryFn: adminApi.domains, enabled: open });
  // Own domains first (the default), then PurelyMail's shared ones.
  const names = (domains.data ?? []).map((d) => d.name);
  const shared = new Set((domains.data ?? []).filter((d) => d.isShared).map((d) => d.name));

  const [localPart, setLocalPart] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [setNow, setSetNow] = useState(false);
  const [reset, setReset] = useState(true);
  const [indexing, setIndexing] = useState(true);
  const [tried, setTried] = useState(false);
  const domain = chosen ?? (defaultDomain && names.includes(defaultDomain) ? defaultDomain : names[0]) ?? '';

  const action = useAction(adminApi.createMailbox, { invalidate: [adminKeys.mailboxes, adminKeys.overview], errorToast: false });
  const adopt = useAction((vars: { address: string; password?: string }) => adminApi.adoptMailbox(vars.address, vars.password), {
    invalidate: [adminKeys.mailboxes, adminKeys.overview],
    errorToast: false,
  });

  // Checks, shortly after typing stops, whether the address already exists in
  // PurelyMail. If it does, the dialog adds it to the panel instead.
  const typed = localPart.trim() && domain ? `${localPart.trim().toLowerCase()}@${domain}` : '';
  const [checked, setChecked] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setChecked(typed), 400);
    return () => clearTimeout(timer);
  }, [typed]);
  const check = useQuery({
    queryKey: ['admin', 'mailbox-check', checked],
    queryFn: () => adminApi.checkMailbox(checked),
    enabled: open && checked.includes('@'),
    staleTime: 30_000,
    retry: false,
  });
  // Creating can also find out (the check's list is cached for a minute).
  const createFoundIt = action.error instanceof ApiClientError && action.error.code === 'mailbox_exists' && action.variables && `${action.variables.localPart}@${action.variables.domain}` === typed;
  const current = check.data?.address === typed ? check.data : null;
  const existing = Boolean((current?.exists && !current.managed) || createFoundIt);
  const alreadyInPanel = Boolean(current?.managed);
  const [keepPassword, setKeepPassword] = useState(true);
  // A new mailbox gets a password only if asked; an existing one when replacing it.
  const needsPassword = existing ? !keepPassword : setNow;

  const errors = {
    local: tried && !localPart.trim() ? t('localRequired') : alreadyInPanel ? t('alreadyInPanel') : null,
    domain: tried && !domain ? t('domainRequired') : null,
    password: tried && needsPassword && password.length < MIN_PASSWORD ? t('passwordTooShort') : null,
  };

  // Pasting a whole address fills in both halves.
  const onLocalChange = (value: string) => {
    const at = value.indexOf('@');
    if (at >= 0) {
      const host = value.slice(at + 1).trim().toLowerCase();
      if (names.includes(host)) setChosen(host);
      value = value.slice(0, at);
    }
    setLocalPart(value.replace(/\s/g, ''));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const local = localPart.trim();
    if (!local || !domain || alreadyInPanel || (needsPassword && password.length < MIN_PASSWORD)) return;
    const address = `${local}@${domain}`;
    if (existing) {
      adopt.mutate(
        { address: address.toLowerCase(), password: keepPassword ? undefined : password },
        {
          onSuccess: () => {
            toast.success(keepPassword ? t('added', { address }) : t('addedWithPassword', { address }));
            onOpenChange(false);
          },
        }
      );
      return;
    }
    action.mutate(
      { localPart: local, domain, password: setNow ? password : undefined, enablePasswordReset: reset, enableSearchIndexing: indexing },
      {
        onSuccess: () => {
          const created = address.toLowerCase();
          toast.success(t('created', { address: created }), {
            duration: 12000,
            action: onConnect ? { label: t('connectApp'), onClick: () => onConnect(created) } : undefined,
          });
          onOpenChange(false);
        },
      }
    );
  };

  const noDomains = domains.isSuccess && names.length === 0;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('newMailbox')}
      description={t('createDescription')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="create-mailbox" disabled={action.isPending || adopt.isPending || noDomains || domains.isPending || alreadyInPanel}>
            {(action.isPending || adopt.isPending) && <Loader2 className="animate-spin" />}
            {existing ? t('addToPanel') : t('createMailbox')}
          </Button>
        </>
      }
    >
      {domains.isError ? (
        <ErrorBanner message={errorText(domains.error)} onRetry={() => domains.refetch()} retryLabel={tc('retry')} />
      ) : noDomains ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          <Globe className="size-5 text-primary" />
          {t('noDomains')}
          <Link to="/domains?new=1" className={buttonVariants({ variant: 'outline', size: 'sm' })} onClick={() => onOpenChange(false)}>
            {t('goToDomains')}
          </Link>
        </div>
      ) : (
        <form id="create-mailbox" onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="create-local">{t('address')}</Label>
            <div
              className={cn(
                'flex h-9 w-full items-center rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-3',
                (errors.local || errors.domain) && 'border-destructive'
              )}
            >
              <input
                id="create-local"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={localPart}
                onChange={(e) => onLocalChange(e.target.value)}
                placeholder={t('localPlaceholder')}
                aria-invalid={Boolean(errors.local) || undefined}
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <span className="select-none px-0.5 text-sm text-muted-foreground">@</span>
              {domains.isPending ? (
                <Skeleton className="mx-2 h-4 w-28" />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-full min-w-0 max-w-[60%] items-center gap-1 rounded-r-md px-2.5 text-sm outline-none hover:bg-accent focus-visible:bg-accent">
                    <span className={cn('truncate', !domain && 'text-muted-foreground')}>{domain || t('chooseDomain')}</span>
                    <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                    {names.map((name) => (
                      <DropdownMenuItem key={name} onSelect={() => setChosen(name)}>
                        <Check className={cn(name !== domain && 'invisible')} />
                        {name}
                        {shared.has(name) && <span className="ml-auto pl-3 text-xs text-muted-foreground">{t('sharedDomain')}</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {(errors.local || errors.domain) && <p className="text-xs text-destructive">{errors.local ?? errors.domain}</p>}
          </div>

          {existing && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="flex gap-2 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{t('existsInPurelymail')}</span>
              </p>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                {[
                  { keep: true, title: t('addKeepPassword'), hint: t('addKeepPasswordHint') },
                  { keep: false, title: t('addSetPassword'), hint: t('addSetPasswordHint') },
                ].map((option) => (
                  <button
                    key={String(option.keep)}
                    type="button"
                    role="radio"
                    aria-checked={keepPassword === option.keep}
                    onClick={() => setKeepPassword(option.keep)}
                    className={cn(
                      'rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-accent/50',
                      keepPassword === option.keep && 'border-primary ring-2 ring-primary/20'
                    )}
                  >
                    <span className="block text-sm font-medium">{option.title}</span>
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {existing && needsPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="create-password">{t('newPassword')}</Label>
              <PasswordField id="create-password" value={password} onChange={setPassword} error={errors.password} />
            </div>
          )}

          {!existing && (
            <div className="divide-y rounded-lg border">
              <div>
                <ToggleRow id="create-set-password" label={t('setPasswordNow')} hint={t('setPasswordNowHint')} checked={setNow} onChange={setSetNow} />
                {setNow && (
                  <div className="px-3 pb-3">
                    <Label htmlFor="create-password" className="sr-only">
                      {t('password')}
                    </Label>
                    <PasswordField id="create-password" value={password} onChange={setPassword} error={errors.password} autoFocus />
                  </div>
                )}
              </div>
              <ToggleRow id="create-reset" label={t('passwordReset')} hint={t('passwordResetHint')} checked={reset} onChange={setReset} />
              <ToggleRow id="create-indexing" label={t('searchIndexing')} hint={t('searchIndexingHint')} checked={indexing} onChange={setIndexing} />
            </div>
          )}

          {action.error && !createFoundIt && <ErrorBanner message={errorText(action.error)} />}
          {adopt.error && <ErrorBanner message={errorText(adopt.error)} />}
        </form>
      )}
    </DialogShell>
  );
}

function ToggleRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
