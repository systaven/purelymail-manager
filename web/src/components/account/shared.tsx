import { useCallback, useState, type ReactNode } from 'react';
import { useClerk, useReverification } from '@clerk/react';
import { isReverificationCancelledError } from '@clerk/react/errors';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

// Building blocks for the Account page: sections, rows, Clerk error text and a
// small "run this Clerk call" helper with pending state.

export function Section({
  id,
  title,
  description,
  action,
  children,
  danger = false,
  bare = false,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  // Children are laid out by the caller (no card).
  bare?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 lg:scroll-mt-10">
      <div className="mb-3 flex flex-col gap-x-6 gap-y-2.5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className={cn('text-base font-semibold tracking-tight', danger && 'text-destructive')}>
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {bare ? children : <Card className={cn('divide-y overflow-hidden', danger && 'border-destructive/35')}>{children}</Card>}
    </section>
  );
}

// One line in a section card: what it is on the left, the control on the right
// (below it on phones).
export function Row({
  title,
  description,
  children,
  icon,
  className,
  htmlFor,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const Title = htmlFor ? 'label' : 'p';
  return (
    <div className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary [&_svg]:size-4">{icon}</span>
        )}
        <div className="min-w-0">
          <Title htmlFor={htmlFor} className="block text-sm font-medium">
            {title}
          </Title>
          {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>
      {children && <div className={cn('flex shrink-0 flex-wrap items-center gap-2 sm:justify-end sm:pl-0', icon && 'pl-11')}>{children}</div>}
    </div>
  );
}

export function InlineError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn('flex items-start gap-1.5 text-sm text-destructive', className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export const Spinner = ({ className }: { className?: string }) => (
  <span aria-hidden className={cn('inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
);

// Status pills used in lists.
export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
        tone === 'neutral' && 'border-border bg-muted/60 text-muted-foreground',
        tone === 'primary' && 'border-primary/25 bg-primary/10 text-primary',
        tone === 'success' && 'border-success/30 bg-success/10 text-success',
        tone === 'warning' && 'border-warning/40 bg-warning/15 text-foreground',
        tone === 'danger' && 'border-destructive/30 bg-destructive/10 text-destructive',
        className
      )}
    >
      {children}
    </span>
  );
}

// ---------- Clerk errors ----------

interface ClerkLikeError {
  code?: string;
  message?: string;
  longMessage?: string;
  meta?: { paramName?: string };
}

const CODE_TO_KEY: Record<string, keyof typeof accountMessages.en> = {
  form_password_incorrect: 'errPasswordIncorrect',
  form_password_pwned: 'errPasswordPwned',
  form_password_length_too_short: 'errPasswordTooShort',
  form_password_length_too_long: 'errPasswordTooLong',
  form_password_size_in_bytes_exceeded: 'errPasswordTooLong',
  form_password_not_strong_enough: 'errPasswordWeak',
  form_password_validation_failed: 'errPasswordWeak',
  form_code_incorrect: 'errCodeIncorrect',
  verification_expired: 'errCodeExpired',
  verification_failed: 'errTooManyAttempts',
  too_many_requests: 'errTooManyAttempts',
  form_identifier_exists: 'errEmailTaken',
  form_identifier_not_allowed_access: 'errEmailNotAllowed',
  form_email_address_blocked: 'errEmailNotAllowed',
  form_username_invalid_length: 'errUsernameLength',
  form_username_invalid_character: 'errUsernameChars',
  form_username_needs_non_number_char: 'errUsernameChars',
  form_param_exceeds_allowed_size: 'errImageTooLarge',
  network_error: 'errNetwork',
};

// A Clerk API error → text in the viewer's language. Known codes are
// translated; anything else uses Clerk's own (English) explanation.
export function useClerkErrorText() {
  const { locale } = useLocale();
  return useCallback(
    (error: unknown): string => {
      const errors = (error as { errors?: ClerkLikeError[] } | null)?.errors;
      const first = Array.isArray(errors) ? errors[0] : (error as ClerkLikeError | null);
      const code = first?.code;
      if (code === 'form_param_format_invalid' && first?.meta?.paramName === 'email_address') {
        return accountMessages[locale].errEmailInvalid;
      }
      if (code && code in CODE_TO_KEY) return accountMessages[locale][CODE_TO_KEY[code]];
      if (first?.longMessage) return first.longMessage;
      if (first?.message) return first.message;
      if (error instanceof Error && error.message) return error.message;
      return accountMessages[locale].errGeneric;
    },
    [locale]
  );
}

export const isClerkCode = (error: unknown, code: string) =>
  Boolean((error as { errors?: ClerkLikeError[] } | null)?.errors?.some((e) => e.code === code));

// ---------- Running Clerk calls ----------

type Task = <T>(
  fn: () => Promise<T>,
  options?: { success?: string; inline?: boolean; sensitive?: boolean }
) => Promise<{ ok: true; value: T } | { ok: false; error?: unknown }>;

// const task = useTask(); await task.run(() => user.update(...), { success: 'Saved' })
// - pending while it runs, error kept for inline display (or toasted)
// - sensitive: Clerk may ask the user to confirm it's them first
//   (useReverification opens Clerk's "verify it's you" step, then retries).
export function useTask() {
  const errorText = useClerkErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reverify = useReverification((fn: () => Promise<unknown>) => fn());

  const run: Task = useCallback(
    async (fn, { success, inline = false, sensitive = false } = {}) => {
      setPending(true);
      setError(null);
      try {
        const value = (sensitive ? await reverify(fn) : await fn()) as Awaited<ReturnType<typeof fn>>;
        if (success) toast.success(success);
        return { ok: true as const, value };
      } catch (err) {
        if (isReverificationCancelledError(err)) return { ok: false as const };
        const message = errorText(err);
        if (inline) setError(message);
        else toast.error(message);
        return { ok: false as const, error: err };
      } finally {
        setPending(false);
      }
    },
    [errorText, reverify]
  );

  return { run, pending, error, setError };
}

// After a name or primary-address change: the server re-reads the Clerk
// profile and the app's session (sidebar name, role) updates now.
export function useRefreshServerSession() {
  const { refresh } = useSession();
  return useCallback(async () => {
    try {
      await api('/auth/refresh', { method: 'POST' });
    } catch {
      // The next regular refresh picks it up.
    }
    await refresh();
  }, [refresh]);
}

// ---------- Instance settings ----------

interface Environment {
  userSettings?: {
    attributes?: Record<string, { enabled?: unknown } | undefined>;
  };
}

// What this Clerk instance allows (usernames, authenticator apps...). Read from
// clerk-js's loaded environment; unknown → undefined, and callers fall back to
// what the user object shows.
export function useInstanceSettings() {
  const clerk = useClerk();
  const env =
    (clerk as unknown as { __internal_environment?: Environment }).__internal_environment ??
    (typeof window !== 'undefined' ? (window as unknown as { Clerk?: { __internal_environment?: Environment } }).Clerk?.__internal_environment : undefined);
  const attr = (name: string): boolean | undefined => {
    const value = env?.userSettings?.attributes?.[name]?.enabled;
    return typeof value === 'boolean' ? value : undefined;
  };
  return {
    usernames: attr('username'),
    firstName: attr('first_name'),
    lastName: attr('last_name'),
    password: attr('password'),
    authenticatorApp: attr('authenticator_app'),
  };
}

export const SESSIONS_KEY = ['account', 'sessions'] as const;

// ---------- Time ----------

export function relativeTime(date: Date, locale: string) {
  const seconds = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ] as const) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}
