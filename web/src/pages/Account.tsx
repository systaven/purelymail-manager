import { useEffect, useMemo, useRef } from 'react';
import { useUser } from '@clerk/react';
import { AlertTriangle, KeyRound, Link2, Mail, MonitorSmartphone, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ConnectedSection } from '@/components/account/ConnectedSection';
import { DangerSection } from '@/components/account/DangerSection';
import { EmailSection } from '@/components/account/EmailSection';
import { PasswordSection } from '@/components/account/PasswordSection';
import { PreferencesSection } from '@/components/account/PreferencesSection';
import { ProfileSection } from '@/components/account/ProfileSection';
import { SectionNav, useScrollSpy, type NavSection } from '@/components/account/SectionNav';
import { SessionsSection } from '@/components/account/SessionsSection';
import { useInstanceSettings } from '@/components/account/shared';
import { TwoFactorSection } from '@/components/account/TwoFactorSection';
import { Skeleton } from '@/components/ui/misc';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

function LoadingState() {
  return (
    <div className="space-y-10">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

// The signed-in person's own account: profile, sign-in methods, devices and
// this browser's preferences. Everything about identity goes straight to Clerk
// from the browser; the server is only asked to re-read the profile after a
// name or primary-address change.
export default function AccountPage() {
  const t = useT(accountMessages);
  const { user, isLoaded } = useUser();
  const settings = useInstanceSettings();
  const rootRef = useRef<HTMLDivElement>(null);

  const showPassword = settings.password !== false || Boolean(user?.passwordEnabled);
  const showConnected = Boolean(user?.externalAccounts.length);

  const sections = useMemo<NavSection[]>(
    () =>
      [
        { id: 'profile', label: t('profile'), icon: UserRound },
        { id: 'emails', label: t('emails'), icon: Mail },
        showPassword && { id: 'password', label: t('password'), icon: KeyRound },
        { id: 'two-factor', label: t('twoFactorShort'), icon: ShieldCheck },
        showConnected && { id: 'connected', label: t('connected'), icon: Link2 },
        { id: 'devices', label: t('devices'), icon: MonitorSmartphone },
        { id: 'preferences', label: t('preferences'), icon: SlidersHorizontal },
        { id: 'danger', label: t('danger'), icon: AlertTriangle, danger: true },
      ].filter(Boolean) as NavSection[],
    [t, showPassword, showConnected]
  );

  const [active, jump] = useScrollSpy(
    sections.map((s) => s.id),
    rootRef
  );

  // Arriving at /account#devices goes straight there.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!isLoaded || !id || !sections.some((s) => s.id === id)) return;
    requestAnimationFrame(() => jump(id));
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={rootRef} className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
        <SectionNav sections={sections} active={active} onJump={jump} label={t('sectionsLabel')} />
        <div className="min-w-0 space-y-12">
          {!isLoaded || !user ? (
            <LoadingState />
          ) : (
            <>
              <ProfileSection key={`profile-${user.id}`} user={user} />
              <EmailSection user={user} />
              {showPassword && <PasswordSection user={user} />}
              <TwoFactorSection user={user} />
              {showConnected && <ConnectedSection user={user} />}
              <SessionsSection user={user} />
              <PreferencesSection />
              <DangerSection user={user} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
