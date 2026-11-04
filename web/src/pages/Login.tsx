import { SignIn } from '@clerk/react';
import { CalendarDays, Inbox, Languages, Moon, ShieldCheck, Sun } from 'lucide-react';
import { Logo } from '@/components/shell/Logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALE_NAMES, LOCALES, useLocale, useT, type Locale } from '@/lib/i18n';
import { loginMessages } from '@/lib/i18n/messages/login';
import { useBrand } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function LoginPage() {
  const t = useT(loginMessages);
  const brand = useBrand();
  const { locale, setLocale } = useLocale();
  const { isDark, setTheme } = useTheme();

  const features = [
    { icon: Inbox, text: t('feature1') },
    { icon: CalendarDays, text: t('feature2') },
    { icon: ShieldCheck, text: t('feature3') },
  ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-[oklch(0.25_0.09_277)] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-32 -top-32 size-[28rem] rounded-full bg-[oklch(0.55_0.22_277)] opacity-40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-[-6rem] size-[30rem] rounded-full bg-[oklch(0.6_0.2_320)] opacity-25 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <Logo className="size-8 ring-1 ring-white/20" />
          {brand.name}
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">{t('tagline')}</p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-md bg-white/10">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sign-in */}
      <div className="flex flex-col">
        <div className="flex justify-end gap-1 p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <Languages /> {LOCALE_NAMES[locale]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                {LOCALES.map((l) => (
                  <DropdownMenuRadioItem key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? t('lightMode') : t('darkMode')}
          >
            {isDark ? <Sun /> : <Moon />}
          </Button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
          <div className="mb-6 flex flex-col items-center text-center lg:hidden">
            <Logo className="mb-3 size-10 rounded-xl" />
            <span className="text-lg font-semibold">{brand.name}</span>
          </div>
          {/* withSignUp keeps sign-up inside this widget instead of Clerk's hosted page. */}
          <SignIn routing="hash" withSignUp />
        </div>
      </div>
    </div>
  );
}
