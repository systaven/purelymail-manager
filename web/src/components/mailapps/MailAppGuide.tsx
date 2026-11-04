import { useState, type FormEvent, type ReactNode } from 'react';
import { Dialog as Primitive } from 'radix-ui';
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Eye, EyeOff, FileDown, KeyRound, Loader2, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { generatePassword } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { mailAppsMessages } from '@/lib/i18n/messages/mailApps';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { cn } from '@/lib/utils';
import { CLIENTS, SERVERS, type ClientId, type MailClient } from './clients';
import { downloadMobileConfig } from './mobileconfig';

const MIN_PASSWORD = 10;
type Step = 'app' | 'password' | 'settings' | 'done';
const STEPS = ['app', 'password', 'settings'] as const;
type T = ReturnType<typeof useT<(typeof mailAppsMessages)['en']>>;

// A step-by-step guide for using one mailbox in a mail app: pick the app, set
// a password (or keep the current one), then see that app's steps and the
// IMAP/SMTP settings. Full screen on phones.
export function MailAppGuide({
  address,
  open,
  onOpenChange,
  setPassword,
}: {
  address: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Replaces the mailbox password (member or admin endpoint).
  setPassword: (password: string) => Promise<unknown>;
}) {
  return (
    <Primitive.Root open={open && Boolean(address)} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Primitive.Content
          // A password may be on screen: only the close button or Esc closes it.
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-popover text-popover-foreground shadow-2xl outline-none focus-visible:ring-0 animate-in',
            'inset-0 h-dvh w-full',
            'sm:inset-auto sm:left-1/2 sm:top-[6vh] sm:h-auto sm:max-h-[88dvh] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-xl sm:border'
          )}
        >
          {address && <Guide address={address} setPassword={setPassword} onClose={() => onOpenChange(false)} />}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

function Guide({ address, setPassword, onClose }: { address: string; setPassword: (password: string) => Promise<unknown>; onClose: () => void }) {
  const t = useT(mailAppsMessages);
  const [step, setStep] = useState<Step>('app');
  const [clientId, setClientId] = useState<ClientId | null>(null);
  // The password set in this guide, shown in the settings; null = unknown.
  const [password, setKnownPassword] = useState<string | null>(null);
  const client = CLIENTS.find((c) => c.id === clientId) ?? null;
  const index = step === 'done' ? STEPS.length : STEPS.indexOf(step);

  const chooseApp = (id: ClientId) => {
    setClientId(id);
    // Already set a password in this guide (another app): go straight on.
    setStep(password ? 'settings' : 'password');
  };

  return (
    <>
      <header className="border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Send className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <Primitive.Title className="text-base font-semibold">{t('title')}</Primitive.Title>
            <Primitive.Description className="truncate text-sm text-muted-foreground">{address}</Primitive.Description>
          </div>
          <Primitive.Close className="-mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t('close')}>
            <X className="size-4" />
          </Primitive.Close>
        </div>
        <Stepper t={t} index={index} />
      </header>

      {step === 'app' && <AppStep t={t} selected={clientId} onChoose={chooseApp} onCancel={onClose} />}
      {step === 'password' && client && (
        <PasswordStep
          t={t}
          address={address}
          hasPassword={Boolean(password)}
          setPassword={setPassword}
          onBack={() => setStep('app')}
          onDone={(pw) => {
            if (pw) setKnownPassword(pw);
            setStep('settings');
          }}
        />
      )}
      {step === 'settings' && client && (
        <SettingsStep
          t={t}
          address={address}
          client={client}
          password={password}
          onNewPassword={() => setStep('password')}
          onBack={() => setStep(password ? 'app' : 'password')}
          onDone={() => setStep('done')}
        />
      )}
      {step === 'done' && client && <DoneStep t={t} address={address} client={client} onAnother={() => setStep('app')} onClose={onClose} />}
    </>
  );
}

function Stepper({ t, index }: { t: T; index: number }) {
  const labels = [t('stepApp'), t('stepPassword'), t('stepSettings')];
  return (
    <ol className="mt-4 flex items-center gap-2" aria-label={labels.join(' · ')}>
      {labels.map((label, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors',
                state === 'done' && 'bg-primary text-primary-foreground',
                state === 'current' && 'bg-primary/15 text-primary ring-2 ring-primary/40',
                state === 'todo' && 'bg-muted text-muted-foreground'
              )}
            >
              {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn('truncate text-xs font-medium', state === 'todo' ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
            {i < labels.length - 1 && <span className={cn('h-px min-w-3 flex-1 rounded', i < index ? 'bg-primary/60' : 'bg-border')} />}
          </li>
        );
      })}
    </ol>
  );
}

function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6', className)}>{children}</div>;
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">{children}</div>;
}

function StepHeading({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AppStep({ t, selected, onChoose, onCancel }: { t: T; selected: ClientId | null; onChoose: (id: ClientId) => void; onCancel: () => void }) {
  return (
    <>
      <Body>
        <StepHeading title={t('appTitle')} hint={t('appHint')} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {CLIENTS.map(({ id, icon: Icon, tone }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChoose(id)}
              className={cn(
                'group flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition-[border-color,background-color,box-shadow] hover:border-primary/40 hover:bg-accent/40 focus-visible:border-primary',
                selected === id && 'border-primary ring-2 ring-primary/20'
              )}
            >
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tone)}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(id)}</span>
                <span className="block truncate text-xs text-muted-foreground">{t(`${id}Hint`)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </Body>
      <Footer>
        <span />
        <Button variant="outline" onClick={onCancel}>
          {t('close')}
        </Button>
      </Footer>
    </>
  );
}

function PasswordStep({
  t,
  address,
  hasPassword,
  setPassword,
  onBack,
  onDone,
}: {
  t: T;
  address: string;
  hasPassword: boolean;
  setPassword: (password: string) => Promise<unknown>;
  onBack: () => void;
  onDone: (password: string | null) => void;
}) {
  const errorText = useErrorText();
  const [mode, setMode] = useState<'generate' | 'custom'>('generate');
  const [generated, setGenerated] = useState(() => generatePassword());
  const [custom, setCustom] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = mode === 'generate' ? generated : custom;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (value.length < MIN_PASSWORD) return setError(t('pwTooShort'));
    setError(null);
    setSaving(true);
    try {
      await setPassword(value);
      toast.success(t('pwSaved'));
      onDone(value);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Body>
        <form id="mailapp-password" onSubmit={submit} noValidate>
          <StepHeading title={t('pwTitle')} hint={t('pwIntro', { address })} />
          <div role="radiogroup" aria-label={t('pwTitle')} className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'generate', icon: Sparkles, title: t('pwGenerate'), hint: t('pwGenerateHint') },
                { value: 'custom', icon: KeyRound, title: t('pwCustom'), hint: t('pwCustomHint') },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                onClick={() => {
                  setMode(option.value);
                  setError(null);
                }}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40',
                  mode === option.value && 'border-primary bg-primary/5 ring-2 ring-primary/20 hover:bg-primary/5'
                )}
              >
                <option.icon className={cn('mt-0.5 size-4 shrink-0', mode === option.value ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4">
            {mode === 'generate' ? (
              <div className="flex items-center gap-1 rounded-lg border bg-muted/50 py-1.5 pl-3 pr-1.5">
                <code className="min-w-0 flex-1 break-all font-mono text-[15px] font-medium tracking-wide">{generated}</code>
                <CopyButton value={generated} label={t('copy')} copiedText={t('copied')} />
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('pwRegenerate')} title={t('pwRegenerate')} onClick={() => setGenerated(generatePassword())}>
                  <RefreshCw />
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Input
                    autoFocus
                    type={visible ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    value={custom}
                    placeholder={t('pwPlaceholder')}
                    onChange={(e) => setCustom(e.target.value)}
                    aria-invalid={Boolean(error) || undefined}
                    aria-label={t('pwPlaceholder')}
                    className={cn('h-10 pr-10', visible && custom && 'font-mono')}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    className="absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={visible ? t('pwHide') : t('pwShow')}
                    title={visible ? t('pwHide') : t('pwShow')}
                  >
                    {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {custom.length > 0 && custom.length < MIN_PASSWORD && !error && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {custom.length}/{MIN_PASSWORD}
                  </p>
                )}
              </div>
            )}
            {error && <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>

          <div className="mt-4 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{t('pwWarnTitle')}</p>
              <p className="mt-0.5 text-muted-foreground">{t('pwWarnBody')}</p>
            </div>
          </div>

          <div className="mt-4 text-center sm:text-left">
            <Button variant="link" className="h-auto px-0 text-muted-foreground hover:text-primary" onClick={() => onDone(null)}>
              {hasPassword ? t('pwKeep') : t('pwSkip')}
            </Button>
          </div>
        </form>
      </Body>
      <Footer>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> {t('back')}
        </Button>
        <Button type="submit" form="mailapp-password" disabled={saving || (mode === 'custom' && !custom)}>
          {saving && <Loader2 className="animate-spin" />}
          {t('pwSave')}
        </Button>
      </Footer>
    </>
  );
}

function SettingsStep({
  t,
  address,
  client,
  password,
  onNewPassword,
  onBack,
  onDone,
}: {
  t: T;
  address: string;
  client: MailClient;
  password: string | null;
  onNewPassword: () => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const appName = t(client.id);
  return (
    <>
      <Body className="space-y-6">
        <div className="flex items-center gap-3">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', client.tone)}>
            <client.icon className="size-5" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">{t('settingsTitle', { app: appName })}</h2>
        </div>

        {client.apple && (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t('profileTitle')}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{t('profileBody')}</p>
              </div>
              <Button
                className="sm:shrink-0"
                onClick={() => {
                  downloadMobileConfig({ address, password, description: t('profileDescription', { address }) });
                  toast.success(t('downloaded'));
                }}
              >
                <FileDown /> {t('profileDownload')}
              </Button>
            </div>
            <ul className="mt-3 space-y-1.5 border-t border-primary/15 pt-3 text-xs text-muted-foreground">
              <li>{client.id === 'iphone' ? t('profileIos') : t('profileMac')}</li>
              <li>{password ? t('profileHasPassword') : t('profileNoPassword')}</li>
              <li>{t('profileUnsigned')}</li>
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold">{client.apple ? t('manualTitle') : t('stepsTitle')}</h3>
          <ol className="space-y-3">
            {client.steps.map((key, i) => (
              <li key={key} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="pt-0.5 leading-relaxed">{t(key)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">{t('settingsTable')}</h3>
          <SettingsTable t={t} address={address} password={password} onNewPassword={onNewPassword} />
        </section>
      </Body>
      <Footer>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> {t('back')}
        </Button>
        <Button onClick={onDone}>
          {t('done')} <Check />
        </Button>
      </Footer>
    </>
  );
}

function Row({ label, value, copy, t, children }: { label: string; value?: string; copy?: boolean; t: T; children?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 px-3 py-1.5">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        {children ?? <code className="min-w-0 truncate font-mono text-[13px]">{value}</code>}
        {copy && value && <CopyButton value={value} label={`${t('copy')} ${label}`} copiedText={t('copied')} className="size-7" />}
      </span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <p className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">{title}</p>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function SettingsTable({ t, address, password, onNewPassword }: { t: T; address: string; password: string | null; onNewPassword: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-3">
      <Group title={t('account')}>
        <Row t={t} label={t('username')} value={address} copy />
        <Row t={t} label={t('password')}>
          {password ? (
            <>
              <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{visible ? password : '•'.repeat(14)}</code>
              <span className="flex shrink-0 items-center">
                <Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label={visible ? t('pwHide') : t('pwShow')} title={visible ? t('pwHide') : t('pwShow')} onClick={() => setVisible((v) => !v)}>
                  {visible ? <EyeOff /> : <Eye />}
                </Button>
                <CopyButton value={password} label={`${t('copy')} ${t('password')}`} copiedText={t('copied')} className="size-7" />
              </span>
            </>
          ) : (
            <>
              <span className="min-w-0 truncate text-sm text-muted-foreground">{t('yourPassword')}</span>
              <Button variant="link" size="sm" className="h-7 shrink-0 px-1" onClick={onNewPassword}>
                {t('newPasswordLink')}
              </Button>
            </>
          )}
        </Row>
        {password && <p className="bg-success/10 px-3 py-2 text-xs text-foreground">{t('savedNote')}</p>}
      </Group>
      <div className="grid gap-3 sm:grid-cols-2">
        <Group title={t('incoming')}>
          <Row t={t} label={t('server')} value={SERVERS.imap.host} copy />
          <Row t={t} label={t('port')} value={String(SERVERS.imap.port)} copy />
          <Row t={t} label={t('security')} value={SERVERS.imap.security} />
        </Group>
        <Group title={t('outgoing')}>
          <Row t={t} label={t('server')} value={SERVERS.smtp.host} copy />
          <Row t={t} label={t('port')} value={String(SERVERS.smtp.port)} copy>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <code className="font-mono text-[13px]">{SERVERS.smtp.port}</code>
              <span className="text-xs text-muted-foreground">{t('altPort')}</span>
            </span>
          </Row>
          <Row t={t} label={t('security')} value={SERVERS.smtp.security} />
        </Group>
      </div>
      <Group title={t('dav')}>
        <Row t={t} label={t('server')} value={SERVERS.dav.url} copy />
      </Group>
    </div>
  );
}

function DoneStep({ t, address, client, onAnother, onClose }: { t: T; address: string; client: MailClient; onAnother: () => void; onClose: () => void }) {
  return (
    <>
      <Body className="flex flex-col items-center justify-center py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="size-7" strokeWidth={2.5} />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">{t('doneTitle')}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('doneBody', { address, app: t(client.id) })}</p>
        <div className="mt-5 flex max-w-sm gap-3 rounded-lg border bg-muted/40 p-3 text-left text-sm">
          <Send className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{t('doneTest')}</p>
        </div>
      </Body>
      <Footer>
        <Button variant="ghost" onClick={onAnother}>
          {t('anotherApp')}
        </Button>
        <Button onClick={onClose}>{t('close')}</Button>
      </Footer>
    </>
  );
}
