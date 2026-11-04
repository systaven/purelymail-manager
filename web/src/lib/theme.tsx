import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const query = () => matchMedia('(prefers-color-scheme: dark)');

function read(): ThemePreference {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage blocked.
  }
  return 'system';
}

const resolve = (pref: ThemePreference) => pref === 'dark' || (pref === 'system' && query().matches);

const ThemeContext = createContext<{ theme: ThemePreference; setTheme: (t: ThemePreference) => void; isDark: boolean }>({
  theme: 'system',
  setTheme: () => {},
  isDark: false,
});

// The saved preference (light/dark/system) and what's showing now.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(read);
  const [isDark, setIsDark] = useState(() => resolve(read()));

  useEffect(() => {
    const update = () => {
      const dark = resolve(theme);
      document.documentElement.classList.toggle('dark', dark);
      setIsDark(dark);
    };
    update();
    if (theme !== 'system') return;
    const mq = query();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {
      // Applies for this visit only.
    }
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme, isDark }), [theme, setTheme, isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
