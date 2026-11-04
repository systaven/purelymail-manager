import { useEffect, useState, type FormEvent } from 'react';
import type { EmailAddressResource, UserResource } from '@clerk/react/types';
import { CheckCircle2, Mail, MoreHorizontal, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { useSession } from '@/lib/session';
import { CodeInput } from './CodeInput';
import { InlineError, Pill, Section, Spinner, useRefreshServerSession, useTask } from './shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 30;

const isVerified = (e: EmailAddressResource) => e.verification?.status === 'verified';

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return [left, () => setLeft(RESEND_SECONDS)] as const;
}

// Enter the code sent to `address` (step 2 of adding, or verifying later).
function VerifyPanel({ user, emailId, onDone, onCancel }: { user: UserResource; emailId: string; onDone: () => void; onCancel: () => void }) {
  const t = useT(accountMessages);
  const verify = useTask();
  const resend = useTask();
  const [code, setCode] = useState('');
  const [cooldown, startCooldown] = useCountdown();
  const email = user.emailAddresses.find((e) => e.id === emailId);

  useEffect(() => startCooldown(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!email) return null;

  const submit = async (value = code) => {
    if (value.length !== 6 || verify.pending) return;
    const result = await verify.run(
      async () => {
        await email.attemptVerification({ code: value });
        await user.reload();
      },
      { success: t('emailVerified', { email: email.emailAddress }), inline: true }
    );
    if (result.ok) onDone();
    else setCode('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-3 bg-muted/40 px-5 py-4"
    >
      <div>
        <p className="text-sm font-medium">{t('enterCode')}</p>
        <p id={`code-hint-${emailId}`} className="mt-0.5 text-sm text-muted-foreground">
          {t('codeSentTo', { email: email.emailAddress })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CodeInput
          autoFocus
          value={code}
          onChange={setCode}
          onComplete={(v) => void submit(v)}
          disabled={verify.pending}
          invalid={Boolean(verify.error)}
          aria-label={t('verificationCode')}
          aria-describedby={`code-hint-${emailId}`}
        />
        <Button type="submit" disabled={code.length !== 6 || verify.pending}>
          {verify.pending && <Spinner />} {t('verify')}
        </Button>
      </div>
      <InlineError message={verify.error} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
          disabled={cooldown > 0 || resend.pending}
          onClick={async () => {
            const result = await resend.run(() => email.prepareVerification({ strategy: 'email_code' }), { success: t('codeResent') });
            if (result.ok) startCooldown();
          }}
        >
          {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resendCode')}
        </button>
        <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}

function AddEmailForm({ user, onAdded, onCancel }: { user: UserResource; onAdded: (id: string) => void; onCancel: () => void }) {
  const t = useT(accountMessages);
  const add = useTask();
  const [value, setValue] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = value.trim();
    if (!EMAIL_RE.test(address)) return add.setError(t('errEmailInvalid'));
    if (user.emailAddresses.some((x) => x.emailAddress.toLowerCase() === address.toLowerCase())) return add.setError(t('emailAlreadyAdded'));
    const result = await add.run(
      async () => {
        const created = await user.createEmailAddress({ email: address });
        await user.reload();
        await created.prepareVerification({ strategy: 'email_code' });
        return created.id;
      },
      { inline: true, sensitive: true }
    );
    if (result.ok) onAdded(result.value);
  };

  return (
    <form onSubmit={submit} className="space-y-3 bg-muted/40 px-5 py-4">
      <div className="space-y-2">
        <Label htmlFor="acc-new-email">{t('newEmail')}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="acc-new-email"
            type="email"
            autoFocus
            autoComplete="email"
            placeholder="name@example.com"
            value={value}
            aria-invalid={Boolean(add.error) || undefined}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
            className="sm:max-w-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={!value.trim() || add.pending}>
              {add.pending && <Spinner />} {t('sendCode')}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={add.pending}>
              {t('cancel')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('newEmailHint')}</p>
      </div>
      <InlineError message={add.error} />
    </form>
  );
}

function EmailRow({ user, email, onVerify }: { user: UserResource; email: EmailAddressResource; onVerify: () => void }) {
  const t = useT(accountMessages);
  const { isAdmin } = useSession();
  const confirm = useConfirm();
  const refreshSession = useRefreshServerSession();
  const task = useTask();
  const primary = user.primaryEmailAddressId === email.id;
  const verified = isVerified(email);

  const makePrimary = async () => {
    const ok = await confirm({
      title: t('makePrimaryTitle', { email: email.emailAddress }),
      description: (
        <div className="space-y-2">
          <p>{t('makePrimaryBody')}</p>
          {isAdmin && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-foreground">{t('makePrimaryAdminWarning')}</p>}
        </div>
      ),
      confirmLabel: t('makePrimary'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    const result = await task.run(
      async () => {
        await user.update({ primaryEmailAddressId: email.id });
        await user.reload();
      },
      { success: t('primaryChanged', { email: email.emailAddress }), sensitive: true }
    );
    if (result.ok) await refreshSession();
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('removeEmailTitle', { email: email.emailAddress }),
      description: t('removeEmailBody'),
      confirmLabel: t('remove'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    await task.run(
      async () => {
        await email.destroy();
        await user.reload();
      },
      { success: t('emailRemoved', { email: email.emailAddress }), sensitive: true }
    );
  };

  const resumeVerify = async () => {
    const result = await task.run(() => email.prepareVerification({ strategy: 'email_code' }));
    if (result.ok) onVerify();
  };

  const hasActions = !primary;

  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
        <Mail className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={email.emailAddress}>
          {email.emailAddress}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {primary && (
            <Pill tone="primary">
              <Star className="size-3" /> {t('primary')}
            </Pill>
          )}
          {verified ? (
            <Pill tone="success">
              <CheckCircle2 className="size-3" /> {t('verified')}
            </Pill>
          ) : (
            <Pill tone="warning">{t('unverified')}</Pill>
          )}
        </div>
      </div>
      {task.pending && <Spinner className="text-muted-foreground" />}
      {!verified && !task.pending && (
        <Button size="sm" variant="outline" onClick={resumeVerify}>
          {t('verify')}
        </Button>
      )}
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('emailActions', { email: email.emailAddress })} disabled={task.pending}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {verified && (
              <>
                <DropdownMenuItem onSelect={makePrimary}>
                  <Star /> {t('makePrimary')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={remove} className="text-destructive focus:text-destructive [&_svg]:text-destructive">
              <Trash2 /> {t('remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function EmailSection({ user }: { user: UserResource }) {
  const t = useT(accountMessages);
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  // Primary first, then verified, then the rest in the order they were added.
  const emails = [...user.emailAddresses].sort(
    (a, b) =>
      Number(b.id === user.primaryEmailAddressId) - Number(a.id === user.primaryEmailAddressId) ||
      Number(isVerified(b)) - Number(isVerified(a))
  );

  return (
    <Section
      id="emails"
      title={t('emails')}
      description={t('emailsHint')}
      action={
        !adding &&
        !verifying && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> {t('addEmail')}
          </Button>
        )
      }
    >
      {emails.map((email) => (
        <div key={email.id}>
          <EmailRow user={user} email={email} onVerify={() => setVerifying(email.id)} />
          {verifying === email.id && (
            <VerifyPanel user={user} emailId={email.id} onDone={() => setVerifying(null)} onCancel={() => setVerifying(null)} />
          )}
        </div>
      ))}
      {emails.length === 0 && <p className="px-5 py-4 text-sm text-muted-foreground">{t('noEmails')}</p>}
      {adding && (
        <AddEmailForm
          user={user}
          onCancel={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false);
            setVerifying(id);
          }}
        />
      )}
    </Section>
  );
}
