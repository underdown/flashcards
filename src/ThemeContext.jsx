import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const THEME_STORAGE_KEY = 'kartochki-theme-preference';

function getSystemPrefersDark() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'dark') return true;
    if (v === 'light') return false;
  } catch {
    /* ignore */
  }
  return undefined;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = getStoredTheme();
    if (stored !== undefined) return stored;
    return getSystemPrefersDark();
  });

  const userChoseExplicitThemeRef = useRef(getStoredTheme() !== undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (userChoseExplicitThemeRef.current) return;
      setDarkMode(mq.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.style.backgroundColor = darkMode ? '#333' : '#fff';
    document.body.style.backgroundColor = darkMode ? '#333' : '#fff';
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    userChoseExplicitThemeRef.current = true;
    setDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ darkMode, toggleDarkMode }),
    [darkMode, toggleDarkMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
