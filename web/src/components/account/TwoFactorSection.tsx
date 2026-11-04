import { useState } from 'react';
import type { TOTPResource, UserResource } from '@clerk/react/types';
import { Download, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { CopyButton } from '@/components/ui/feedback';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { useBrand } from '@/lib/session';
import { CodeInput } from './CodeInput';
import { QrCode } from './QrCode';
import { InlineError, Pill, Row, Section, Spinner, useInstanceSettings, useTask } from './shared';

// Codes that can't reach Clerk because the instance doesn't offer TOTP.
const UNAVAILABLE = new Set(['feature_not_enabled', 'authenticator_app_not_enabled', 'not_allowed_access', 'second_factors_disabled']);
const isUnavailable = (error: unknown) =>
  Boolean((error as { errors?: { code?: string }[] } | null)?.errors?.some((e) => e.code && (UNAVAILABLE.has(e.code) || e.code.includes('not_enabled'))));

// The key, grouped in fours so it's easier to type by hand.
const groupSecret = (secret: string) => secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useT(accountMessages);
  const brand = useBrand();
  const text = codes.join('\n');
  const download = () => {
    const blob = new Blob([`${brand.name} — ${t('backupCodes')}\n\n${text}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brand.name.replace(/[^\w-]+/g, '-').toLowerCase()}-backup-codes.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="space-y-4 bg-muted/40 px-5 py-5">
      <div>
        <p className="text-sm font-medium">{t('backupCodes')}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('backupCodesHint')}</p>
      </div>
      <ul className="grid max-w-md grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border bg-card px-4 py-3 font-mono text-sm sm:grid-cols-2" aria-label={t('backupCodes')}>
        {codes.map((code) => (
          <li key={code} className="tabular-nums tracking-wider">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast.success(t('copied'));
            } catch {
              // Clipboard blocked: the download still works.
            }
          }}
        >
          {t('copyAll')}
        </Button>
        <Button size="sm" variant="outline" onClick={download}>
          <Download /> {t('downloadTxt')}
        </Button>
        <Button size="sm" className="ml-auto" onClick={onDone}>
          {t('savedThem')}
        </Button>
      </div>
    </div>
  );
}

function SetupPanel({ user, totp, onCancel, onVerified }: { user: UserResource; totp: TOTPResource; onCancel: () => void; onVerified: (codes: string[]) => void }) {
  const t = useT(accountMessages);
  const verify = useTask();
  const [code, setCode] = useState('');
  const [showKey, setShowKey] = useState(false);

  const submit = async (value = code) => {
    if (value.length !== 6 || verify.pending) return;
    const result = await verify.run(
      async () => {
        const verified = await user.verifyTOTP({ code: value });
        await user.reload();
        return verified.backupCodes ?? [];
      },
      { success: t('totpEnabled'), inline: true }
    );
    if (result.ok) onVerified(result.value);
    else setCode('');
  };

  return (
    <div className="grid gap-6 bg-muted/40 px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-2 sm:items-start">
        {totp.uri && <QrCode value={totp.uri} label={t('qrLabel')} />}
      </div>
      <div className="min-w-0 space-y-5">
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">1</span>
            <div className="min-w-0">
              <p className="font-medium">{t('totpStep1')}</p>
              <p className="mt-0.5 text-muted-foreground">{t('totpStep1Hint')}</p>
              {totp.secret &&
                (showKey ? (
                  <div className="mt-2 flex items-center gap-1 rounded-md border bg-card py-1 pl-3 pr-1">
                    <code className="min-w-0 flex-1 break-all font-mono text-[13px] tracking-wide">{groupSecret(totp.secret)}</code>
                    <CopyButton value={totp.secret} label={t('copyKey')} copiedText={t('copied')} />
                  </div>
                ) : (
                  <button type="button" className="mt-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setShowKey(true)}>
                    {t('cantScan')}
                  </button>
                ))}
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">2</span>
            <div className="min-w-0 flex-1">
              <label htmlFor="acc-totp-code" className="font-medium">
                {t('totpStep2')}
              </label>
              <form
                className="mt-2 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <CodeInput
                  id="acc-totp-code"
                  value={code}
                  onChange={setCode}
                  onComplete={(v) => void submit(v)}
                  disabled={verify.pending}
                  invalid={Boolean(verify.error)}
                />
                <Button type="submit" disabled={code.length !== 6 || verify.pending}>
                  {verify.pending && <Spinner />} {t('turnOn')}
                </Button>
              </form>
              <InlineError message={verify.error} className="mt-2" />
            </div>
          </li>
        </ol>
        <Button variant="ghost" size="sm" className="-ml-3 text-muted-foreground" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}

export function TwoFactorSection({ user }: { user: UserResource }) {
  const t = useT(accountMessages);
  const settings = useInstanceSettings();
  const confirm = useConfirm();
  const start = useTask();
  const regen = useTask();
  const off = useTask();
  const [totp, setTotp] = useState<TOTPResource | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [unavailable, setUnavailable] = useState(settings.authenticatorApp === false && !user.totpEnabled);

  if (unavailable) {
    return (
      <Section id="two-factor" title={t('twoFactor')} description={t('twoFactorHint')}>
        <Row icon={<ShieldCheck />} title={t('twoFactorUnavailable')} description={t('twoFactorUnavailableHint')} />
      </Section>
    );
  }

  const setup = async () => {
    const result = await start.run(() => user.createTOTP(), { sensitive: true, inline: true });
    if (result.ok) setTotp(result.value);
    else if (isUnavailable(result.error)) setUnavailable(true);
  };

  const regenerate = async () => {
    const ok = await confirm({
      title: t('regenerateTitle'),
      description: t('regenerateBody'),
      confirmLabel: t('regenerate'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    const result = await regen.run(() => user.createBackupCode(), { sensitive: true });
    if (result.ok) setCodes(result.value.codes);
  };

  const turnOff = async () => {
    const ok = await confirm({
      title: t('totpOffTitle'),
      description: t('totpOffBody'),
      confirmLabel: t('turnOff'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    await off.run(
      async () => {
        await user.disableTOTP();
        await user.reload();
      },
      { success: t('totpDisabled'), sensitive: true }
    );
    setCodes(null);
  };

  const enabled = user.totpEnabled;

  return (
    <Section id="two-factor" title={t('twoFactor')} description={t('twoFactorHint')}>
      <Row
        icon={<Smartphone />}
        title={
          <span className="flex items-center gap-2">
            {t('authenticatorApp')}
            {enabled ? <Pill tone="success">{t('on')}</Pill> : <Pill>{t('off')}</Pill>}
          </span>
        }
        description={enabled ? t('authenticatorOnHint') : t('authenticatorOffHint')}
      >
        {enabled ? (
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={turnOff} disabled={off.pending}>
            {off.pending && <Spinner />} {t('turnOff')}
          </Button>
        ) : (
          !totp &&
          !codes && (
            <Button size="sm" onClick={setup} disabled={start.pending}>
              {start.pending && <Spinner />} {t('setUp')}
            </Button>
          )
        )}
      </Row>
      {start.error && (
        <div className="px-5 py-3">
          <InlineError message={start.error} />
        </div>
      )}
      {totp && !enabled && (
        <SetupPanel
          user={user}
          totp={totp}
          onCancel={() => setTotp(null)}
          onVerified={(backup) => {
            setTotp(null);
            setCodes(backup);
          }}
        />
      )}
      {enabled && (
        <Row
          icon={<KeyRound />}
          title={t('backupCodes')}
          description={user.backupCodeEnabled ? t('backupCodesOnHint') : t('backupCodesOffHint')}
        >
          {!codes && (
            <Button size="sm" variant="outline" onClick={regenerate} disabled={regen.pending}>
              {regen.pending && <Spinner />} {t('regenerate')}
            </Button>
          )}
        </Row>
      )}
      {codes && codes.length > 0 && <BackupCodes codes={codes} onDone={() => setCodes(null)} />}
    </Section>
  );
}
