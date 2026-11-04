import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { adminApi, adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useAction } from '@/lib/mutation';
import { PasswordField } from './PasswordField';
import { DialogShell, MIN_PASSWORD } from './shared';

// Sets a new password for a mailbox. Mount with key={address} so it starts empty.
export function ResetPasswordDialog({ address, onClose }: { address: string | null; onClose: () => void }) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const action = useAction((vars: { address: string; password: string }) => adminApi.updateMailbox(vars.address, { newPassword: vars.password }), {
    success: t('passwordChanged'),
    invalidate: address ? [adminKeys.mailbox(address)] : [],
    errorToast: false,
  });

  const localError = tried && password.length < MIN_PASSWORD ? t('passwordTooShort') : null;
  const error = localError ?? (action.error ? errorText(action.error) : null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!address || password.length < MIN_PASSWORD) return;
    action.mutate({ address, password }, { onSuccess: onClose });
  };

  return (
    <DialogShell
      open={address !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('resetPassword')}
      description={address ? t('resetDescription', { address }) : undefined}
      className="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="reset-password" disabled={action.isPending}>
            {action.isPending && <Loader2 className="animate-spin" />}
            {t('setPassword')}
          </Button>
        </>
      }
    >
      <form id="reset-password" onSubmit={submit} className="space-y-2">
        <Label htmlFor="reset-password-input">{t('newPassword')}</Label>
        <PasswordField id="reset-password-input" value={password} onChange={setPassword} error={error} autoFocus />
      </form>
    </DialogShell>
  );
}
