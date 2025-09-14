import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext({ isDark: false, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  // Determine initial theme from localStorage or system preference
  const getInitial = () => {
    try {
      const saved = localStorage.getItem('clippy-dark-theme');
      if (saved !== null) return saved === 'true';
    } catch {}
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  };

  const [isDark, setIsDark] = useState(getInitial);

  // Persist and apply class to root/body
  useEffect(() => {
    try {
      localStorage.setItem('clippy-dark-theme', isDark ? 'true' : 'false');
    } catch {}

    const root = document.documentElement;
    const body = document.body;
    if (isDark) {
      root.classList.add('dark-theme');
      body.classList.add('dark-theme');
    } else {
      root.classList.remove('dark-theme');
      body.classList.remove('dark-theme');
    }
  }, [isDark]);

  // Optional: keep in sync with OS preference if user hasn't explicitly chosen
  useEffect(() => {
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (!media) return;

    const saved = localStorage.getItem('clippy-dark-theme');
    if (saved !== null) return; // user chose explicitly; don't override

    const listener = (e) => setIsDark(e.matches);
    media.addEventListener ? media.addEventListener('change', listener) : media.addListener(listener);
    return () => {
      media.removeEventListener ? media.removeEventListener('change', listener) : media.removeListener(listener);
    };
  }, []);

  const toggleTheme = () => setIsDark((d) => !d);

  const value = useMemo(() => ({ isDark, toggleTheme }), [isDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
