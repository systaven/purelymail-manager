import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Languages, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/misc';
import { LOCALE_NAMES, LOCALES, useLocale, useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { useTheme } from '@/lib/theme';
import type { NavItem } from './nav';

const itemClass =
  'flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground';
const groupClass = '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';

// ⌘K / Ctrl+K: jump anywhere, switch theme or language. Mail commands join later.
export function CommandPalette({ open, onOpenChange, nav }: { open: boolean; onOpenChange: (open: boolean) => void; nav: NavItem[] }) {
  const t = useT(shellMessages);
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { setLocale } = useLocale();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t('searchOrJump')}</DialogTitle>
        <Command loop className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t('commandPlaceholder')}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
            />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[min(60vh,24rem)] overflow-y-auto p-1.5">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">{t('noResults')}</Command.Empty>
            <Command.Group heading={t('groupNavigate')} className={groupClass}>
              {nav.map((item) => (
                <Command.Item key={item.to} value={`${t(item.label)} ${item.to}`} onSelect={() => run(() => navigate(item.to))} className={itemClass}>
                  <item.icon /> {t(item.label)}
                  {item.goKey && (
                    <span className="ml-auto flex gap-1">
                      <Kbd>G</Kbd>
                      <Kbd>{item.goKey.toUpperCase()}</Kbd>
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading={t('groupPreferences')} className={groupClass}>
              <Command.Item onSelect={() => run(() => setTheme('light'))} className={itemClass}>
                <Sun /> {t('switchTheme', { name: t('light') })}
              </Command.Item>
              <Command.Item onSelect={() => run(() => setTheme('dark'))} className={itemClass}>
                <Moon /> {t('switchTheme', { name: t('dark') })}
              </Command.Item>
              <Command.Item onSelect={() => run(() => setTheme('system'))} className={itemClass}>
                <Monitor /> {t('switchTheme', { name: t('system') })}
              </Command.Item>
              {LOCALES.map((l) => (
                <Command.Item key={l} value={`language ${LOCALE_NAMES[l]} ${l}`} onSelect={() => run(() => setLocale(l))} className={itemClass}>
                  <Languages /> {t('switchLanguage', { name: LOCALE_NAMES[l] })}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
