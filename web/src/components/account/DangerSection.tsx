import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserResource } from '@clerk/react/types';
import { Link } from 'react-router';
import { Info, LogOut, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { meApi, meKeys } from '@/lib/me-api';
import { useSession } from '@/lib/session';
import { Row, Section, Spinner, useTask } from './shared';

export function DangerSection({ user }: { user: UserResource }) {
  const t = useT(accountMessages);
  const { isAdmin, signOut } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const del = useTask();
  const out = useTask();
  const canDelete = user.deleteSelfEnabled;

  // A member's mailboxes are private: nobody else can delete them for the
  // member, so the account can't go while it still owns any.
  const account = useQuery({ queryKey: meKeys.account, queryFn: meApi.account, enabled: canDelete });
  const owned = account.data?.mailboxes.length ?? 0;
  const blocked = owned > 0;
  const email = user.primaryEmailAddress?.emailAddress ?? '';

  const remove = async () => {
    const value = email || 'DELETE';
    const ok = await confirm({
      title: t('deleteTitle'),
      description: (
        <div className="space-y-2">
          <p>{t('deleteBody')}</p>
          {isAdmin && <p>{t('deleteAdminNote')}</p>}
        </div>
      ),
      confirmLabel: t('deleteAccount'),
      cancelLabel: t('cancel'),
      destructive: true,
      typeToConfirm: { value, prompt: t('typeToConfirm', { value }) },
    });
    if (!ok) return;
    const result = await del.run(() => user.delete(), { success: t('accountDeleted'), sensitive: true });
    if (result.ok) {
      try {
        await signOut();
      } catch {
        // Clerk usually ends the session itself once the user is gone.
      }
      queryClient.clear();
    }
  };

  return (
    <Section id="danger" title={t('danger')} description={t('dangerHint')} danger>
      <Row icon={<LogOut />} title={t('signOut')} description={t('signOutHint', { email })}>
        <Button
          size="sm"
          variant="outline"
          disabled={out.pending}
          onClick={() => out.run(() => signOut())}
        >
          {out.pending ? <Spinner /> : <LogOut />} {t('signOut')}
        </Button>
      </Row>
      {isAdmin && (
        <Row
          icon={<Info />}
          title={t('adminAccess')}
          description={t('adminAccessHint')}
        />
      )}
      {canDelete && (
        <div>
          <Row
            icon={<Trash2 />}
            title={t('deleteAccount')}
            description={blocked ? t('deleteBlocked', { count: owned }) : t('deleteHint')}
            className="[&>div>span:first-child]:bg-destructive/10 [&>div>span:first-child]:text-destructive"
          >
            {blocked ? (
              <Link to="/mailboxes" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                {t('goToMailboxes')}
              </Link>
            ) : (
              <Button size="sm" variant="destructive" onClick={remove} disabled={del.pending || account.isPending || account.isError}>
                {del.pending && <Spinner />} {t('deleteAccount')}
              </Button>
            )}
          </Row>
          {account.isError && (
            <p className="px-5 pb-4 text-sm text-muted-foreground">
              {t('deleteCheckFailed')}{' '}
              <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => account.refetch()}>
                {t('retry')}
              </button>
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
