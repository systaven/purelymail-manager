import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Each part of the UI declares its strings in one file with every language side
// by side (lib/i18n/messages/*); TypeScript checks every language has exactly
// the English keys.

export const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
};

type Strings = Record<string, string>;
export type Messages<T extends Strings> = { en: T } & { [L in Exclude<Locale, 'en'>]: { [K in keyof T]: string } };

export const defineMessages = <T extends Strings>(messages: Messages<T>) => messages;

export function format(template: string, params?: Record<string, string | number>): string {
  return params ? template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match)) : template;
}

export function detectLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    if (lower.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(lower) ? 'zh-TW' : 'zh-CN';
    if (lower.startsWith('ja')) return 'ja';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

const STORAGE_KEY = 'lang';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  } catch {
    // Storage blocked: use the browser language.
  }
  return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

const I18nContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: 'en',
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered, still applied.
    }
  }, []);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useLocale = () => useContext(I18nContext);

// Returns t(key, params) for one message set, in the current language.
export function useT<T extends Strings>(messages: Messages<T>) {
  const { locale } = useLocale();
  return useCallback(
    (key: keyof T & string, params?: Record<string, string | number>) => format(messages[locale][key] ?? messages.en[key], params),
    [messages, locale]
  );
}
