import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Loader2, Lock, RectangleEllipsis, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { CopyButton, ErrorBanner } from '@/components/ui/feedback';
import { Avatar, Skeleton } from '@/components/ui/misc';
import { Section, Sheet, SheetContent } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { adminApi, adminKeys, type MailboxDetail } from '@/lib/admin-api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { mailboxesMessages } from '@/lib/i18n/messages/mailboxes';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useAction } from '@/lib/mutation';
import { cn } from '@/lib/utils';
import { RecoveryMethods } from './RecoveryMethods';
import { AddressText, MemberBadge, ownerName, splitAddress } from './shared';

type Settings = { enableSearchIndexing?: boolean; enablePasswordReset?: boolean; requireTwoFactorAuthentication?: boolean };
type Detail = Extract<MailboxDetail, { private: false }>;

export interface MailboxSheetActions {
  onResetPassword: (address: string) => void;
  onAppPassword: (address: string) => void;
  onDelete: (address: string) => void;
  deleting: boolean;
  onRenamed: (address: string) => void;
}

export function MailboxSheet({ address, onClose, ...actions }: { address: string | null; onClose: () => void } & MailboxSheetActions) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const query = useQuery({ queryKey: adminKeys.mailbox(address ?? ''), queryFn: () => adminApi.mailbox(address!), enabled: address !== null });
  const data = query.data;

  return (
    <Sheet open={address !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={data?.private ? t('privateMailbox') : t('mailboxSettings')}>
        {address && (
          <div className="space-y-8">
            <Summary address={address} detail={data} />
            {query.isError ? (
              <ErrorBanner message={`${t('detailLoadFailed')} ${errorText(query.error)}`} onRetry={() => query.refetch()} retryLabel={tc('retry')} />
            ) : !data ? (
              <DetailSkeleton />
            ) : data.private ? (
              <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
                <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {t('privateBody', { owner: ownerName(data.owner) ?? t('ownerFallback') })}
                </p>
              </div>
            ) : (
              <EditableDetail key={data.address} detail={data} {...actions} />
            )}
            {(data || query.isError) && (
              <Section title={<span className="text-destructive">{t('dangerZone')}</span>}>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 p-4">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm font-medium">{t('deleteMailbox')}</p>
                    <p className="text-xs text-muted-foreground">{t('deleteHint')}</p>
                  </div>
                  <Button variant="destructive" size="sm" disabled={actions.deleting} onClick={() => actions.onDelete(address)}>
                    {actions.deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    {t('deleteMailbox')}
                  </Button>
                </div>
              </Section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Summary({ address, detail }: { address: string; detail?: MailboxDetail }) {
  const t = useT(mailboxesMessages);
  return (
    <div className="flex items-center gap-3">
      <Avatar name={address} className="size-11 text-sm" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-center gap-1">
          <AddressText address={address} className="text-base" />
          <CopyButton value={address} label={t('copyAddress')} copiedText={t('copied')} className="size-7" />
        </div>
        {detail?.private && <MemberBadge owner={detail.owner} />}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-24" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function EditableDetail({ detail, onResetPassword, onAppPassword, onRenamed }: { detail: Detail } & MailboxSheetActions) {
  const t = useT(mailboxesMessages);
  const { address } = detail;
  const update = useAction((changes: Settings) => adminApi.updateMailbox(address, changes), {
    success: t('settingSaved'),
    invalidate: [adminKeys.mailbox(address)],
  });

  // While a change is saving (and the detail refetches), show the requested value.
  const pending = update.isPending ? update.variables : undefined;
  const value = (key: keyof Settings, current: boolean) => pending?.[key] ?? current;

  const toggles: { key: keyof Settings; label: string; hint: string; current: boolean }[] = [
    { key: 'enableSearchIndexing', label: t('searchIndexing'), hint: t('searchIndexingHint'), current: detail.enableSearchIndexing },
    { key: 'enablePasswordReset', label: t('passwordReset'), hint: t('passwordResetHint'), current: detail.recoveryEnabled },
    { key: 'requireTwoFactorAuthentication', label: t('twoFactor'), hint: t('twoFactorHint'), current: detail.requireTwoFactorAuthentication },
  ];

  return (
    <>
      <Section title={t('settings')}>
        <div className="divide-y rounded-xl border">
          {toggles.map(({ key, label, hint, current }) => (
            <SettingRow key={key} label={label} hint={hint}>
              <Switch
                aria-label={label}
                checked={value(key, current)}
                disabled={update.isPending}
                onCheckedChange={(checked) => update.mutate({ [key]: checked })}
              />
            </SettingRow>
          ))}
          <SettingRow label={t('spamFiltering')} hint={t('spamFilteringHint')}>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
                detail.enableSpamFiltering ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <span className={cn('size-1.5 rounded-full', detail.enableSpamFiltering ? 'bg-success' : 'bg-muted-foreground/50')} />
              {detail.enableSpamFiltering ? t('on') : t('off')}
            </span>
          </SettingRow>
        </div>
      </Section>

      <RecoveryMethods address={address} methods={detail.resetMethods} active={value('enablePasswordReset', detail.recoveryEnabled)} />

      <Section title={t('passwordSection')} description={t('passwordSectionHint')}>
        <Button variant="outline" size="sm" onClick={() => onResetPassword(address)}>
          <KeyRound />
          {t('resetPassword')}
        </Button>
      </Section>

      <Section title={t('appPasswords')} description={t('appPasswordsHint')}>
        <Button variant="outline" size="sm" onClick={() => onAppPassword(address)}>
          <RectangleEllipsis />
          {t('createAppPassword')}
        </Button>
      </Section>

      <RenameSection address={address} onRenamed={onRenamed} />
    </>
  );
}

function RenameSection({ address, onRenamed }: { address: string; onRenamed: (address: string) => void }) {
  const t = useT(mailboxesMessages);
  const tc = useT(commonMessages);
  const confirm = useConfirm();
  const [local, domain] = splitAddress(address);
  const [value, setValue] = useState(local);
  const next = value.trim();
  const queryClient = useQueryClient();
  const rename = useAction((newUserName: string) => adminApi.updateMailbox(address, { newUserName }), { invalidate: [adminKeys.overview] });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!next || next === local) return;
    const to = `${next}@${domain}`;
    const ok = await confirm({
      title: t('renameTitle'),
      description: t('renameBody', { from: address, to }),
      confirmLabel: t('rename'),
      cancelLabel: tc('cancel'),
    });
    if (!ok) return;
    rename.mutate(to, {
      onSuccess: () => {
        toast.success(t('renamed', { address: to }));
        onRenamed(to);
        // Refresh the list only; the old address's detail no longer exists.
        queryClient.removeQueries({ queryKey: adminKeys.mailbox(address) });
        void queryClient.invalidateQueries({ queryKey: adminKeys.mailboxes, exact: true });
      },
    });
  };

  return (
    <Section title={t('rename')} description={t('renameHint')}>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-input bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-3">
          <input
            aria-label={t('rename')}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[\s@]/g, ''))}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          />
          <span className="max-w-[55%] shrink-0 truncate pr-3 text-sm text-muted-foreground">@{domain}</span>
        </div>
        <Button type="submit" variant="outline" disabled={!next || next === local || rename.isPending}>
          {rename.isPending && <Loader2 className="animate-spin" />}
          {t('rename')}
        </Button>
      </form>
    </Section>
  );
}
