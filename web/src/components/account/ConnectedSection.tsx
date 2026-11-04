import type { ExternalAccountResource, UserResource } from '@clerk/react/types';
import { Link2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { Pill, Section, Spinner, useTask } from './shared';

const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
  gitlab: 'GitLab',
  facebook: 'Facebook',
  discord: 'Discord',
  linkedin_oidc: 'LinkedIn',
  linkedin: 'LinkedIn',
  x: 'X',
  twitter: 'X',
  slack: 'Slack',
  notion: 'Notion',
};

export function providerName(account: ExternalAccountResource) {
  const slug = String(account.provider).replace(/^oauth_/, '');
  if (slug in PROVIDER_NAMES) return PROVIDER_NAMES[slug];
  try {
    const title = account.providerTitle?.();
    if (title) return title;
  } catch {
    // Older resource without the helper.
  }
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function ConnectedRow({ user, account }: { user: UserResource; account: ExternalAccountResource }) {
  const t = useT(accountMessages);
  const confirm = useConfirm();
  const task = useTask();
  const name = providerName(account);
  const identifier = account.emailAddress || account.username || '';
  const verified = account.verification?.status === 'verified' || !account.verification;

  const remove = async () => {
    const ok = await confirm({
      title: t('disconnectTitle', { provider: name }),
      description: t('disconnectBody', { provider: name }),
      confirmLabel: t('disconnect'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    await task.run(
      async () => {
        await account.destroy();
        await user.reload();
      },
      { success: t('disconnected', { provider: name }), sensitive: true }
    );
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      {account.imageUrl ? (
        <img src={account.imageUrl} alt="" className="size-8 shrink-0 rounded-lg border bg-muted object-cover" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Link2 className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {name}
          {!verified && <Pill tone="warning">{t('needsReconnect')}</Pill>}
        </p>
        {identifier && <p className="truncate text-sm text-muted-foreground">{identifier}</p>}
      </div>
      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={remove} disabled={task.pending}>
        {task.pending ? <Spinner /> : <Trash2 />}
        <span className="hidden sm:inline">{t('disconnect')}</span>
        <span className="sr-only sm:hidden">{t('disconnectTitle', { provider: name })}</span>
      </Button>
    </div>
  );
}

export function ConnectedSection({ user }: { user: UserResource }) {
  const t = useT(accountMessages);
  return (
    <Section id="connected" title={t('connected')} description={t('connectedHint')}>
      {user.externalAccounts.map((account) => (
        <ConnectedRow key={account.id} user={user} account={account} />
      ))}
    </Section>
  );
}
