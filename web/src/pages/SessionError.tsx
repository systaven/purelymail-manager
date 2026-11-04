import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { loginMessages } from '@/lib/i18n/messages/login';
import { useErrorText } from '@/lib/i18n/useErrorText';
import { useSession } from '@/lib/session';

// Clerk didn't load, or the server won't let this account in (disabled) or failed.
export function SessionError({ error }: { error: unknown }) {
  const t = useT(loginMessages);
  const tc = useT(commonMessages);
  const errorText = useErrorText();
  const { refresh, signOut } = useSession();
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldAlert className="size-6" />
      </span>
      <p className="max-w-sm text-sm">{errorText(error)}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => (error instanceof ApiClientError ? refresh() : location.reload())}>
          {tc('retry')}
        </Button>
        {/* Signing out needs Clerk, which may be what failed to load. */}
        {error instanceof ApiClientError && (
          <Button variant="secondary" onClick={() => signOut()}>
            {t('signOut')}
          </Button>
        )}
      </div>
    </div>
  );
}
