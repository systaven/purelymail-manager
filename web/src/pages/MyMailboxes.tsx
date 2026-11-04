import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Forward, KeyRound, Lock, Mailbox, MoreHorizontal, Plus, Server, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { AddressText, DialogShell } from '@/components/mailboxes/shared';
import { PasswordField } from '@/components/mailboxes/PasswordField';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CopyButton, EmptyState, ErrorBanner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, Badge, Skeleton } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { meApi, meKeys, type MyAccount } from '@/lib/me-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { myMailboxesMessages } from '@/lib/i18n/messages/myMailboxes';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';

const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;

// PurelyMail's servers for mail apps.
const SERVERS = [
  { key: 'incoming', host: 'imap.purelymail.com', port: '993', security: 'SSL/TLS' },
  { key: 'outgoing', host: 'smtp.purelymail.com', port: '465', security: 'SSL/TLS' },
] as const;

function CreateDialog({ account, open, onOpenChange }: { account: MyAccount; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(myMailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const { requiresApproval, allowedDomains } = account.limits;
  const [local, setLocal] = useState('');
  const [domain, setDomain] = useState(allowedDomains[0] ?? '');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useAction(meApi.create, {
    success: (r) => (r.status === 'requested' ? t('requested') : t('created', { address: `${local.trim().toLowerCase()}@${domain}` })),
    invalidate: [meKeys.account],
    errorToast: false,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const localPart = local.trim().toLowerCase();
    if (!LOCAL_RE.test(localPart)) return setError(t('invalidAddress'));
    if (!requiresApproval && password.length < MIN_PASSWORD) return setError(t('passwordTooShort'));
    setError(null);
    create.mutate(
      requiresApproval ? { localPart, domain, note: note.trim() || undefined } : { localPart, domain, password },
      {
        onSuccess: () => {
          onOpenChange(false);
          setLocal('');
          setPassword('');
          setNote('');
        },
        onError: (err) => setError(errorText(err)),
      }
    );
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={requiresApproval ? t('requestMailbox') : t('newMailbox')}
      description={requiresApproval ? t('approvalHint') : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="create-mailbox" disabled={create.isPending || !local.trim()}>
            {requiresApproval ? t('sendRequest') : t('create')}
          </Button>
        </>
      }
    >
      <form id="create-mailbox" onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="local">{t('address')}</Label>
          <div className="flex items-center rounded-md border border-input bg-background shadow-xs focus-within:border-primary focus-within:ring-3 focus-within:ring-ring">
            <input
              id="local"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder={t('localPlaceholder')}
              className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none focus-visible:ring-0"
            />
            <span className="text-sm text-muted-foreground">@</span>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="h-9 max-w-[55%] truncate bg-transparent pl-1 pr-2 text-sm outline-none focus-visible:ring-0"
              aria-label="Domain"
            >
              {allowedDomains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        {requiresApproval ? (
          <div className="space-y-2">
            <Label htmlFor="note">{t('note')}</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} maxLength={300} />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="password">{t('password')}</Label>
            <PasswordField id="password" value={password} onChange={setPassword} />
          </div>
        )}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      </form>
    </DialogShell>
  );
}

function PasswordDialog({ address, onClose }: { address: string | null; onClose: () => void }) {
  const t = useT(myMailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useAction((vars: { address: string; password: string }) => meApi.setPassword(vars.address, vars.password), {
    success: t('passwordChanged'),
    errorToast: false,
  });
  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(t('passwordTooShort'));
    save.mutate({ address: address!, password }, { onSuccess: close, onError: (err) => setError(errorText(err)) });
  };
  return (
    <DialogShell
      open={Boolean(address)}
      onOpenChange={(open) => !open && close()}
      title={t('changePassword')}
      description={address ?? undefined}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="change-password" disabled={save.isPending}>
            {tc('save')}
          </Button>
        </>
      }
    >
      <form id="change-password" onSubmit={submit} className="space-y-2">
        <Label htmlFor="new-password">{t('newPassword')}</Label>
        <PasswordField id="new-password" value={password} onChange={setPassword} error={error} autoFocus />
      </form>
    </DialogShell>
  );
}

function ForwardingDialog({ address, onClose }: { address: string | null; onClose: () => void }) {
  const t = useT(myMailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const current = useQuery({ queryKey: meKeys.forwarding(address ?? ''), queryFn: () => meApi.forwarding(address!), enabled: Boolean(address) });
  const [draft, setDraft] = useState<{ targets: string; keepCopy: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useAction((vars: { address: string; targets: string[]; keepCopy: boolean }) => meApi.setForwarding(vars.address, vars), {
    success: t('forwardingSaved'),
    invalidate: address ? [meKeys.forwarding(address)] : [],
    errorToast: false,
  });

  const value = draft ?? { targets: current.data?.targets.join(', ') ?? '', keepCopy: current.data?.keepCopy ?? true };
  const close = () => {
    setDraft(null);
    setError(null);
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const targets = value.targets.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const bad = targets.filter((s) => !EMAIL_RE.test(s));
    if (bad.length) return setError(t('invalidTargets', { value: bad.join(', ') }));
    save.mutate({ address: address!, targets, keepCopy: value.keepCopy }, { onSuccess: close, onError: (err) => setError(errorText(err)) });
  };

  return (
    <DialogShell
      open={Boolean(address)}
      onOpenChange={(open) => !open && close()}
      title={t('forwarding')}
      description={t('forwardingHint')}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="forwarding" disabled={save.isPending || current.isPending}>
            {t('save')}
          </Button>
        </>
      }
    >
      {current.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <form id="forwarding" onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targets">{t('forwardTo')}</Label>
            <Input id="targets" autoFocus value={value.targets} onChange={(e) => setDraft({ ...value, targets: e.target.value })} placeholder={t('forwardPlaceholder')} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            {t('keepCopy')}
            <Switch checked={value.keepCopy} onCheckedChange={(keepCopy) => setDraft({ ...value, keepCopy })} />
          </label>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </form>
      )}
    </DialogShell>
  );
}

function ConnectCard({ address }: { address: string }) {
  const t = useT(myMailboxesMessages);
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center gap-2">
        <Server className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{t('connect')}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('connectHint')}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {SERVERS.map((s) => (
          <dl key={s.key} className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
            <dt className="mb-2 text-xs font-medium text-muted-foreground">{t(s.key)}</dt>
            {[
              [t('server'), s.host],
              [t('port'), s.port],
              [t('security'), s.security],
              [t('username'), address],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="flex min-w-0 items-center gap-1">
                  <code className="truncate font-mono text-[13px]">{value}</code>
                  <CopyButton value={value} label={t('copy')} copiedText={t('copied')} className="size-6" />
                </span>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </div>
  );
}

export default function MyMailboxesPage() {
  const t = useT(myMailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const confirm = useConfirm();
  const account = useQuery({ queryKey: meKeys.account, queryFn: meApi.account });
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [forwardingFor, setForwardingFor] = useState<string | null>(null);

  const cancel = useAction(meApi.cancelRequest, { success: t('requestCancelled'), invalidate: [meKeys.account] });
  const remove = useAction(meApi.remove, { invalidate: [meKeys.account] });

  const data = account.data;
  const used = data ? data.mailboxes.length + data.requests.length : 0;
  const full = data ? used >= data.limits.maxMailboxes : false;
  const noDomains = data ? data.limits.allowedDomains.length === 0 : false;

  const askDelete = async (address: string) => {
    const ok = await confirm({
      title: t('deleteTitle', { address }),
      description: t('deleteBody'),
      confirmLabel: t('deleteMailbox'),
      cancelLabel: tc('cancel'),
      destructive: true,
      typeToConfirm: { value: address, prompt: t('typeToConfirm', { value: address }) },
    });
    if (ok) remove.mutate(address, { onSuccess: () => toast.success(t('deleted', { address })) });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          data && (
            <Button onClick={() => setCreating(true)} disabled={full || noDomains}>
              <Plus /> {data.limits.requiresApproval ? t('requestMailbox') : t('newMailbox')}
            </Button>
          )
        }
      />

      {account.isError && <ErrorBanner message={errorText(account.error)} onRetry={() => account.refetch()} retryLabel={tc('retry')} />}
      {account.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Usage */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{t('usage', { used, max: data.limits.maxMailboxes })}</span>
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <span
                className={cn('block h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
                style={{ width: `${Math.min(100, (used / Math.max(1, data.limits.maxMailboxes)) * 100)}%` }}
              />
            </span>
            {(full || noDomains) && <span className="text-xs text-muted-foreground">{noDomains ? t('noDomains') : t('quotaReached')}</span>}
          </div>

          {data.mailboxes.length === 0 && data.requests.length === 0 && (
            <EmptyState
              icon={Mailbox}
              title={t('noMailboxes')}
              description={noDomains ? t('noDomains') : t('noMailboxesBody')}
              action={
                !noDomains &&
                !full && (
                  <Button onClick={() => setCreating(true)}>
                    <Plus /> {data.limits.requiresApproval ? t('requestMailbox') : t('newMailbox')}
                  </Button>
                )
              }
            />
          )}

          {(data.mailboxes.length > 0 || data.requests.length > 0) && (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {data.mailboxes.map((address) => (
                <li key={address} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={address} />
                  <div className="min-w-0 flex-1">
                    <AddressText address={address} className="block truncate text-sm" />
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" /> {t('private')}
                    </span>
                  </div>
                  <div className="hidden gap-1 sm:flex">
                    <Button variant="ghost" size="sm" onClick={() => setPasswordFor(address)}>
                      <KeyRound /> {t('changePassword')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setForwardingFor(address)}>
                      <Forward /> {t('forwarding')}
                    </Button>
                  </div>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={address}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setPasswordFor(address)}>
                        <KeyRound /> {t('changePassword')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setForwardingFor(address)}>
                        <Forward /> {t('forwarding')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => askDelete(address)} className="text-destructive data-[highlighted]:text-destructive [&_svg]:text-destructive">
                        <Trash2 /> {t('deleteMailbox')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
              {data.requests.map((request) => (
                <li key={request.id} className="flex items-center gap-3 bg-muted/30 px-4 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
                    <Clock className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <AddressText address={request.mailbox} className="block truncate text-sm" />
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t('pendingHint')}</span>
                  </div>
                  <Badge className="hidden sm:inline-flex">{t('pending')}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => cancel.mutate(request.id)} disabled={cancel.isPending}>
                    {t('cancelRequest')}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {data.mailboxes.length > 0 && <ConnectCard address={data.mailboxes[0]} />}

          <CreateDialog key={data.limits.allowedDomains.join()} account={data} open={creating} onOpenChange={setCreating} />
        </div>
      )}

      <PasswordDialog address={passwordFor} onClose={() => setPasswordFor(null)} />
      <ForwardingDialog key={forwardingFor ?? ''} address={forwardingFor} onClose={() => setForwardingFor(null)} />
    </div>
  );
}
