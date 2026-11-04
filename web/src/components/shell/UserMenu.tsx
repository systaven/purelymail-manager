import { Check, Languages, LogOut, Monitor, Moon, Sun, UserCog } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/misc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALE_NAMES, LOCALES, useLocale, useT, type Locale } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { useSession } from '@/lib/session';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

const THEMES: { value: ThemePreference; icon: typeof Sun; label: 'light' | 'dark' | 'system' }[] = [
  { value: 'light', icon: Sun, label: 'light' },
  { value: 'dark', icon: Moon, label: 'dark' },
  { value: 'system', icon: Monitor, label: 'system' },
];

// Account button at the bottom of the sidebar: who's signed in, theme, language, sign out.
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const t = useT(shellMessages);
  const { session, signOut, isAdmin } = useSession();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const navigate = useNavigate();
  const name = session?.name || session?.email || '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent',
          collapsed && 'justify-center'
        )}
      >
        <Avatar name={name} className="size-7" />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block text-xs text-muted-foreground">{isAdmin ? t('roleAdmin') : t('roleGuest')}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{session?.email || name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/account')}>
          <UserCog /> {t('account')}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun /> {t('theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {THEMES.map(({ value, icon: Icon, label }) => (
              <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
                <Icon /> {t(label)}
                {theme === value && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages /> {t('language')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={locale} onValueChange={(value) => setLocale(value as Locale)}>
              {LOCALES.map((l) => (
                <DropdownMenuRadioItem key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut /> {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
