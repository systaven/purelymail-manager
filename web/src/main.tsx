import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import { ConfirmProvider } from './components/ui/confirm';
import { ApiClientError } from './lib/api';
import { I18nProvider } from './lib/i18n';
import { SessionProvider } from './lib/session';
import { ThemeProvider, useTheme } from './lib/theme';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (4xx) won't succeed on retry.
      retry: (count, error) => count < 2 && !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
    },
  },
});

function ThemedToaster() {
  const { isDark } = useTheme();
  return <Toaster theme={isDark ? 'dark' : 'light'} position="bottom-right" closeButton />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </SessionProvider>
          <ThemedToaster />
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>
);
