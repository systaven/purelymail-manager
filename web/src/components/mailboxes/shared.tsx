import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { adminApi, adminKeys, type Owner } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';

export const MIN_PASSWORD = 10;

export function splitAddress(address: string): [local: string, domain: string] {
  const at = address.lastIndexOf('@');
  return at < 0 ? [address, ''] : [address.slice(0, at), address.slice(at + 1)];
}

export const ownerName = (owner: Owner | null) => owner?.name || owner?.email || null;

export async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    // Clipboard blocked (e.g. not HTTPS).
  }
}

// "local@domain" with the local part emphasised.
export function AddressText({ address, className }: { address: string; className?: string }) {
  const [local, domain] = splitAddress(address);
  return (
    <span className={cn('min-w-0 truncate', className)} title={address}>
      <span className="font-medium text-foreground">{local}</span>
      <span className="text-muted-foreground">@{domain}</span>
    </span>
  );
}

export function MemberBadge({ owner, className }: { owner: Owner; className?: string }) {
  const t = useT(mailboxesMessages);
  const name = ownerName(owner);
  return (
    <span
      className={cn('inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground', className)}
      title={name ? t('belongsTo', { owner: owner.email && owner.name ? `${owner.name} <${owner.email}>` : name }) : undefined}
    >
      <Lock className="size-3 shrink-0" />
      <span className="shrink-0">{t('member')}</span>
      {name && <span className="truncate font-normal">· {name}</span>}
    </span>
  );
}

// A padded dialog with a title, optional description and footer.
export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  guarded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  // Ignore clicks outside, e.g. while showing a secret that can't be shown again.
  guarded?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn('flex max-h-[80dvh] flex-col', className)}
        onInteractOutside={guarded ? (e) => e.preventDefault() : undefined}
      >
        <div className="space-y-1 px-5 pt-5">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}

// Asks for the address to be typed, then deletes the mailbox.
export function useDeleteMailbox(onDeleted?: (address: string) => void) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  // The list is refreshed by hand: invalidating its key would also refetch the
  // open detail of the mailbox that just went away.
  const action = useAction((address: string) => adminApi.deleteMailbox(address), { invalidate: [adminKeys.overview] });
  const run = async (address: string) => {
    const ok = await confirm({
      title: t('deleteTitle', { address }),
      description: t('deleteBody'),
      confirmLabel: t('deleteMailbox'),
      cancelLabel: tc('cancel'),
      destructive: true,
      typeToConfirm: { value: address, prompt: t('typeToConfirm') },
    });
    if (!ok) return;
    action.mutate(address, {
      onSuccess: () => {
        toast.success(t('deleted', { address }));
        onDeleted?.(address);
        queryClient.removeQueries({ queryKey: adminKeys.mailbox(address) });
        void queryClient.invalidateQueries({ queryKey: adminKeys.mailboxes, exact: true });
      },
    });
  };
  return { run, pending: action.isPending };
}
