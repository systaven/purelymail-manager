import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi, adminKeys } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useAction } from '@/lib/mutation';
import { DialogShell } from './shared';

// Adds a mailbox that already exists in PurelyMail to the panel. Mount with a
// fresh key each time so it starts empty.
export function AddExistingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const [address, setAddress] = useState('');
  const action = useAction((value: string) => adminApi.adoptMailbox(value), {
    invalidate: [adminKeys.mailboxes, adminKeys.overview],
    errorToast: false,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = address.trim().toLowerCase();
    if (!value) return;
    action.mutate(value, {
      onSuccess: () => {
        toast.success(t('added', { address: value }));
        onOpenChange(false);
      },
    });
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('addExistingTitle')}
      description={t('addExistingBody')}
      className="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="add-existing" disabled={action.isPending || !address.trim()}>
            {action.isPending && <Loader2 className="animate-spin" />}
            {t('add')}
          </Button>
        </>
      }
    >
      <form id="add-existing" onSubmit={submit} className="space-y-2">
        <Label htmlFor="add-existing-address">{t('addressLabel')}</Label>
        <Input
          id="add-existing-address"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="name@example.com"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          aria-invalid={action.error ? true : undefined}
          autoFocus
        />
        {action.error && <p className="text-sm text-destructive">{errorText(action.error)}</p>}
      </form>
    </DialogShell>
  );
}
