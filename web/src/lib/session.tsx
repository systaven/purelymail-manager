import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, useAuth, useClerk } from '@clerk/react';
import { shadcn } from '@clerk/ui/themes';
import { jaJP, zhCN, zhTW } from '@clerk/localizations';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setTokenGetter } from './api';
import { useLocale, type Locale } from './i18n';

export interface Session {
  role: 'admin' | 'guest';
  email: string | null;
  name: string | null;
}

export interface Brand {
  name: string;
  logoUrl: string | null;
}

interface PublicConfig {
  clerkPublishableKey: string;
  brand: Brand;
}

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  // Signed in to Clerk, but the server refused or failed (e.g. account disabled).
  error: unknown;
  // Clerk hasn't loaded after a while (offline, or blocked by an extension).
  stalled: boolean;
  isAdmin: boolean;
  refresh: () => Promise<unknown>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const BrandContext = createContext<Brand>({ name: 'PurelyMail', logoUrl: null });

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

export const useBrand = () => useContext(BrandContext);

const CLERK_LOCALES: Partial<Record<Locale, typeof zhCN>> = { 'zh-CN': zhCN, 'zh-TW': zhTW, ja: jaJP };

// The page title and favicon follow the configured brand.
function useBrandDocument(brand: Brand | undefined) {
  useEffect(() => {
    if (!brand) return;
    document.title = brand.name;
    if (brand.logoUrl) {
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (icon) {
        icon.href = brand.logoUrl;
        icon.removeAttribute('type');
      }
    }
  }, [brand]);
}

// Loads the server's public config, then mounts Clerk.
export function SessionProvider({ children }: { children: ReactNode }) {
  const config = useQuery({ queryKey: ['config'], queryFn: () => api<PublicConfig>('/config'), staleTime: Infinity });
  const { locale } = useLocale();
  useBrandDocument(config.data?.brand);

  if (config.isPending) return null;
  if (!config.data) {
    return <div className="flex h-dvh items-center justify-center p-8 text-sm text-muted-foreground">Can't reach the server.</div>;
  }

  return (
    <BrandContext.Provider value={config.data.brand}>
      <ClerkProvider
        publishableKey={config.data.clerkPublishableKey}
        localization={CLERK_LOCALES[locale]}
        // Clerk's shadcn theme reads our CSS tokens (--card, --primary...), so its
        // widgets follow light/dark with the page instead of Clerk's own theme.
        appearance={{ theme: shadcn, variables: { borderRadius: '0.625rem', fontFamily: 'inherit' } }}
        // Clerk's own links and redirects come back to this app's sign-in page.
        signInUrl="/"
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
      >
        <ClerkSession>{children}</ClerkSession>
      </ClerkProvider>
    </BrandContext.Provider>
  );
}

// Hands Clerk's token to the API client, then asks the server who this is
// (the role comes from the server: ADMIN_EMAILS or a promotion).
function ClerkSession({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, userId } = useAuth();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (isLoaded) return setStalled(false);
    const timer = setTimeout(() => setStalled(true), 10_000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);

  const query = useQuery({
    queryKey: ['session', userId],
    queryFn: () => api<Session | null>('/auth/session'),
    enabled: isLoaded && Boolean(userId),
    staleTime: 5 * 60_000,
  });

  const signOut = async () => {
    await clerk.signOut();
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'config' });
  };

  const signedIn = Boolean(userId);
  return (
    <SessionContext.Provider
      value={{
        session: signedIn ? (query.data ?? null) : null,
        loading: !isLoaded || (signedIn && query.isPending),
        error: signedIn ? query.error : null,
        stalled,
        isAdmin: signedIn && query.data?.role === 'admin',
        refresh: () => query.refetch(),
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
