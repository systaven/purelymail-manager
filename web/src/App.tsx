import { lazy, Suspense, type ReactNode } from 'react';
import { BookUser, CalendarDays, Inbox, Settings } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from '@/components/shell/AppShell';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { useSession } from '@/lib/session';
import { ComingSoon } from '@/pages/ComingSoon';
import LoginPage from '@/pages/Login';
import { SessionError } from '@/pages/SessionError';

const OverviewPage = lazy(() => import('@/pages/Overview'));
const DomainsPage = lazy(() => import('@/pages/Domains'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const RoutingPage = lazy(() => import('@/pages/Routing'));
const MailboxesPage = lazy(() => import('@/pages/Mailboxes'));
const MyMailboxesPage = lazy(() => import('@/pages/MyMailboxes'));
const MembersPage = lazy(() => import('@/pages/Members'));
const MailPage = lazy(() => import('@/pages/Mail'));

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useSession();
  return isAdmin ? children : <Navigate to="/mailboxes" replace />;
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
            <Route index element={isAdmin ? <OverviewPage /> : <Navigate to="/mailboxes" replace />} />
            <Route path="mail/*" element={<MailPage />} />
            <Route path="calendar/*" element={soon('calendar', CalendarDays)} />
            <Route path="contacts/*" element={soon('contacts', BookUser)} />
            <Route path="mailboxes" element={<MyMailboxesPage />} />
            <Route path="account" element={soon('account', Settings)} />
            <Route path="domains" element={<AdminOnly><DomainsPage /></AdminOnly>} />
            <Route path="users" element={<AdminOnly><MailboxesPage /></AdminOnly>} />
            <Route path="routing" element={<AdminOnly><RoutingPage /></AdminOnly>} />
            <Route path="guests" element={<AdminOnly><MembersPage /></AdminOnly>} />
            <Route path="settings" element={<AdminOnly><SettingsPage /></AdminOnly>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
