import { useState, type FormEvent } from 'react';
import type { UserResource } from '@clerk/react/types';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { cn } from '@/lib/utils';
import { InlineError, Pill, Row, SESSIONS_KEY, Section, Spinner, isClerkCode, useTask } from './shared';

const MIN_LENGTH = 8;

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  autoFocus,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  invalid?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
}) {
  const t = useT(accountMessages);
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t('hidePassword') : t('showPassword')}
        aria-pressed={shown}
        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

// 0–4, a rough guide shown under the new password.
function strength(password: string) {
  if (!password) return 0;
  let score = password.length >= MIN_LENGTH ? 1 : 0;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

function StrengthMeter({ password }: { password: string }) {
  const t = useT(accountMessages);
  const score = strength(password);
  const labels = [t('strengthTooShort'), t('strengthWeak'), t('strengthOk'), t('strengthGood'), t('strengthStrong')] as const;
  const color = score <= 1 ? 'bg-destructive' : score === 2 ? 'bg-warning' : 'bg-success';
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full bg-muted transition-colors', password && i <= Math.max(score, 1) && color)} />
        ))}
      </div>
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{password ? labels[score] : ''}</span>
    </div>
  );
}

function PasswordForm({ user, onClose }: { user: UserResource; onClose: () => void }) {
  const t = useT(accountMessages);
  const task = useTask();
  const queryClient = useQueryClient();
  const hasPassword = user.passwordEnabled;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [currentWrong, setCurrentWrong] = useState(false);

  const mismatch = again.length > 0 && next !== again;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (hasPassword && !current) return setLocalError(t('enterCurrentPassword'));
    if (next.length < MIN_LENGTH) return setLocalError(t('errPasswordTooShort'));
    if (next !== again) return setLocalError(t('passwordsDontMatch'));
    setLocalError(null);
    const result = await task.run(
      async () => {
        await user.updatePassword({
          ...(hasPassword ? { currentPassword: current } : {}),
          newPassword: next,
          signOutOfOtherSessions: signOutOthers,
        });
        await user.reload();
      },
      { success: hasPassword ? t('passwordChanged') : t('passwordSet'), inline: true, sensitive: true }
    );
    if (result.ok) {
      if (signOutOthers) void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      onClose();
    }
    else if (isClerkCode(result.error, 'form_password_incorrect')) {
      setCurrent('');
      setCurrentWrong(true);
      document.getElementById('acc-current-password')?.focus();
    }
  };

  const error = localError ?? task.error;

  return (
    <form onSubmit={submit} className="space-y-4 px-5 py-5" noValidate>
      {/* Lets password managers attach the new password to the right account. */}
      <input type="text" autoComplete="username" value={user.primaryEmailAddress?.emailAddress ?? ''} readOnly hidden />
      {hasPassword && (
        <div className="space-y-2 sm:max-w-sm">
          <Label htmlFor="acc-current-password">{t('currentPassword')}</Label>
          <PasswordInput id="acc-current-password" autoFocus value={current} onChange={(v) => (setCurrent(v), setCurrentWrong(false))} autoComplete="current-password" invalid={currentWrong} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="acc-new-password">{t('newPassword')}</Label>
          <PasswordInput id="acc-new-password" autoFocus={!hasPassword} value={next} onChange={setNext} autoComplete="new-password" describedBy="acc-pw-hint" />
          <StrengthMeter password={next} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-confirm-password">{t('confirmPassword')}</Label>
          <PasswordInput id="acc-confirm-password" value={again} onChange={setAgain} autoComplete="new-password" invalid={mismatch} />
          {mismatch && <p className="text-xs text-destructive">{t('passwordsDontMatch')}</p>}
        </div>
      </div>
      <p id="acc-pw-hint" className="text-xs text-muted-foreground">
        {t('passwordRules', { min: MIN_LENGTH })}
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
        <Switch checked={signOutOthers} onCheckedChange={setSignOutOthers} className="mt-0.5" aria-describedby="acc-signout-hint" />
        <span>
          <span className="block text-sm font-medium">{t('signOutOthers')}</span>
          <span id="acc-signout-hint" className="block text-xs text-muted-foreground">
            {t('signOutOthersHint')}
          </span>
        </span>
      </label>
      <InlineError message={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={task.pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={task.pending || !next || !again || (hasPassword && !current)}>
          {task.pending && <Spinner />} {hasPassword ? t('changePassword') : t('setPassword')}
        </Button>
      </div>
    </form>
  );
}

export function PasswordSection({ user }: { user: UserResource }) {
  const t = useT(accountMessages);
  const [open, setOpen] = useState(false);
  return (
    <Section id="password" title={t('password')} description={t('passwordHint')}>
      <Row
        icon={<KeyRound />}
        title={
          <span className="flex items-center gap-2">
            {t('password')}
            {user.passwordEnabled ? <Pill tone="success">{t('passwordOn')}</Pill> : <Pill>{t('passwordOff')}</Pill>}
          </span>
        }
        description={user.passwordEnabled ? t('passwordOnHint') : t('passwordOffHint')}
      >
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {user.passwordEnabled ? t('changePassword') : t('setPassword')}
          </Button>
        )}
      </Row>
      {open && <PasswordForm user={user} onClose={() => setOpen(false)} />}
    </Section>
  );
}
