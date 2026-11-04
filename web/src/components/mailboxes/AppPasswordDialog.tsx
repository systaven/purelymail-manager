import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useAction } from '@/lib/mutation';
import { DialogShell } from './shared';

// Groups of four so the password is easy to read or type on another device.
// Spans (not spaces) keep a selected copy free of gaps.
function GroupedSecret({ value }: { value: string }) {
  const groups = value.match(/.{1,4}/g) ?? [];
  return (
    <code className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-base font-medium tracking-wide sm:text-lg">
      {groups.map((group, i) => (
        <span key={i}>{group}</span>
      ))}
    </code>
  );
}

// Creates an app password and shows it once. Mount with key={address}.
export function AppPasswordDialog({ address, onClose }: { address: string | null; onClose: () => void }) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const action = useAction((vars: { address: string; name: string }) => adminApi.createAppPassword(vars.address, vars.name));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!address) return;
    action.mutate({ address, name: name.trim() }, { onSuccess: (result) => setSecret(result.appPassword) });
  };

  return (
    <DialogShell
      open={address !== null}
      onOpenChange={(open) => !open && onClose()}
      title={secret ? t('appCreatedTitle') : t('createAppPassword')}
      description={address ? (secret ? t('appCreatedBody', { address }) : t('appDescription', { address })) : undefined}
      className="max-w-md"
      guarded={Boolean(secret)}
      footer={
        secret ? (
          <Button onClick={onClose}>{t('done')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" form="app-password" disabled={action.isPending}>
              {action.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
              {t('create')}
            </Button>
          </>
        )
      }
    >
      {secret ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 pr-2">
            <div className="min-w-0 flex-1 py-0.5">
              <GroupedSecret value={secret} />
            </div>
            <CopyButton value={secret} label={t('copy')} copiedText={t('copied')} className="text-foreground" />
          </div>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            {t('appOnce')}
          </p>
        </div>
      ) : (
        <form id="app-password" onSubmit={submit} className="space-y-2">
          <Label htmlFor="app-password-name">
            {t('appName')} <span className="font-normal text-muted-foreground">({t('optional')})</span>
          </Label>
          <Input id="app-password-name" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('appNamePlaceholder')} />
        </form>
      )}
    </DialogShell>
  );
}
