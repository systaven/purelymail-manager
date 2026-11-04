import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Bell, ChevronRight, Languages, Mailbox, Monitor, Moon, Palette, Sun, Undo2 } from 'lucide-react';
import { getUndoDelay, setUndoDelay, UNDO_DELAYS } from '@/components/compose/storage';
import { useNotificationSetting } from '@/components/mail/events';
import { Switch } from '@/components/ui/switch';
import { LOCALE_NAMES, LOCALES, useLocale, useT, type Locale } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { Row, Section } from './shared';
import { Segmented } from './Segmented';

// Panel-side preferences. They live in this browser (like the account menu's
// theme and language, which use the same hooks and so stay in step).
export function PreferencesSection() {
  const t = useT(accountMessages);
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const notifications = useNotificationSetting();
  const [delay, setDelay] = useState(getUndoDelay);
  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';

  return (
    <Section id="preferences" title={t('preferences')} description={t('preferencesHint')}>
      <Row icon={<Languages />} title={t('language')} description={t('languageHint')} htmlFor="acc-language">
        <div className="relative">
          <select
            id="acc-language"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="h-8 appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm shadow-xs transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-3"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
          <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-muted-foreground" />
        </div>
      </Row>
      <Row icon={<Palette />} title={t('theme')} description={t('themeHint')}>
        <Segmented<ThemePreference>
          label={t('theme')}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: t('themeLight'), icon: <Sun /> },
            { value: 'dark', label: t('themeDark'), icon: <Moon /> },
            { value: 'system', label: t('themeSystem'), icon: <Monitor /> },
          ]}
        />
      </Row>
      <Row icon={<Undo2 />} title={t('undoSend')} description={t('undoSendHint')}>
        <Segmented<number>
          label={t('undoSend')}
          value={delay}
          onChange={(n) => {
            setDelay(n);
            setUndoDelay(n);
          }}
          options={UNDO_DELAYS.map((n) => ({ value: n, label: n === 0 ? t('off') : t('seconds', { n }) }))}
        />
      </Row>
      <Row
        icon={<Bell />}
        title={t('notifications')}
        description={!notifications.supported ? t('notificationsUnsupported') : denied ? t('notificationsBlocked') : t('notificationsHint')}
        htmlFor="acc-notify"
      >
        <Switch
          id="acc-notify"
          checked={notifications.on}
          disabled={!notifications.supported}
          onCheckedChange={async () => {
            const wanted = !notifications.on;
            const on = await notifications.toggle();
            if (wanted && !on) toast.error(t('notificationsBlocked'));
            else toast.success(on ? t('notificationsOnToast') : t('notificationsOffToast'));
          }}
        />
      </Row>
      <Link
        to="/mailboxes"
        className="group flex items-center gap-3 px-5 py-4 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Mailbox className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t('mailboxSettings')}</span>
          <span className="block text-sm text-muted-foreground">{t('mailboxSettingsHint')}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Section>
  );
}
