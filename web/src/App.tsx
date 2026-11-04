import { lazy, Suspense, type ReactNode } from 'react';
import { BookUser, CalendarDays, Globe, Inbox, Mailbox, Route as RouteIcon, Settings, Users, UsersRound } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from '@/components/shell/AppShell';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { useSession } from '@/lib/session';
import { ComingSoon } from '@/pages/ComingSoon';
import LoginPage from '@/pages/Login';
import { SessionError } from '@/pages/SessionError';

const OverviewPage = lazy(() => import('@/pages/Overview'));

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useSession();
  return isAdmin ? children : <Navigate to="/mail" replace />;
}

function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function App() {
  const t = useT(shellMessages);
  const { session, loading, error, stalled, isAdmin } = useSession();

  if (stalled) return <SessionError error={new Error(t('clerkStalled'))} />;
  if (loading) return <Splash />;
  if (error) return <SessionError error={error} />;
  if (!session) return <LoginPage />;

  const soon = (title: keyof typeof shellMessages.en, icon: typeof Inbox) => <ComingSoon title={t(title)} icon={icon} />;

  return (
    <BrowserRouter>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={isAdmin ? <OverviewPage /> : <Navigate to="/mail" replace />} />
            <Route path="mail/*" element={soon('mail', Inbox)} />
            <Route path="calendar/*" element={soon('calendar', CalendarDays)} />
            <Route path="contacts/*" element={soon('contacts', BookUser)} />
            <Route path="mailboxes" element={soon('myMailboxes', Mailbox)} />
            <Route path="account" element={soon('account', Settings)} />
            <Route path="domains" element={<AdminOnly>{soon('domains', Globe)}</AdminOnly>} />
            <Route path="users" element={<AdminOnly>{soon('users', Users)}</AdminOnly>} />
            <Route path="routing" element={<AdminOnly>{soon('routing', RouteIcon)}</AdminOnly>} />
            <Route path="guests" element={<AdminOnly>{soon('guests', UsersRound)}</AdminOnly>} />
            <Route path="settings" element={<AdminOnly>{soon('settings', Settings)}</AdminOnly>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
