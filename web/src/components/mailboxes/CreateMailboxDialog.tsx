import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Globe, Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ErrorBanner } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { adminApi, adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { PasswordField } from './PasswordField';
import { copyText, DialogShell, MIN_PASSWORD } from './shared';

// Remount (new key) each time it opens so the form starts fresh.
export function CreateMailboxDialog({
  open,
  onOpenChange,
  defaultDomain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDomain?: string;
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
  const [reset, setReset] = useState(true);
  const [indexing, setIndexing] = useState(true);
  const [tried, setTried] = useState(false);
  const domain = chosen ?? (defaultDomain && names.includes(defaultDomain) ? defaultDomain : names[0]) ?? '';

  const action = useAction(adminApi.createMailbox, { invalidate: [adminKeys.mailboxes, adminKeys.overview], errorToast: false });

  const errors = {
    local: tried && !localPart.trim() ? t('localRequired') : null,
    domain: tried && !domain ? t('domainRequired') : null,
    password: tried && password.length < MIN_PASSWORD ? t('passwordTooShort') : null,
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
    if (!local || !domain || password.length < MIN_PASSWORD) return;
    const address = `${local}@${domain}`;
    action.mutate(
      { localPart: local, domain, password, enablePasswordReset: reset, enableSearchIndexing: indexing },
      {
        onSuccess: () => {
          const credentials = `${t('address')}: ${address}\n${t('password')}: ${password}\nIMAP: imap.purelymail.com:993 (SSL)\nSMTP: smtp.purelymail.com:465 (SSL)`;
          toast.success(t('created', { address }), {
            duration: 12000,
            action: { label: t('copyCredentials'), onClick: () => copyText(credentials, t('credentialsCopied')) },
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
          <Button type="submit" form="create-mailbox" disabled={action.isPending || noDomains || domains.isPending}>
            {action.isPending && <Loader2 className="animate-spin" />}
            {t('createMailbox')}
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

          <div className="space-y-1.5">
            <Label htmlFor="create-password">{t('password')}</Label>
            <PasswordField id="create-password" value={password} onChange={setPassword} error={errors.password} />
          </div>

          <div className="divide-y rounded-lg border">
            <ToggleRow id="create-reset" label={t('passwordReset')} hint={t('passwordResetHint')} checked={reset} onChange={setReset} />
            <ToggleRow id="create-indexing" label={t('searchIndexing')} hint={t('searchIndexingHint')} checked={indexing} onChange={setIndexing} />
          </div>

          {action.error && <ErrorBanner message={errorText(action.error)} />}
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
