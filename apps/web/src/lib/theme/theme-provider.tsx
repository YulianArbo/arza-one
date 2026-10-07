'use client';

import { createContext, use, useState, type JSX, type ReactNode } from 'react';

import { themeClassName, themeCookie, THEMES, type Theme } from './theme';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Cambia el modo en la página y lo recuerda en la cookie para la próxima visita. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove(...THEMES);
  const className = themeClassName(theme);
  if (className) {
    root.classList.add(className);
  }
  document.cookie = themeCookie(theme, window.location.protocol === 'https:');
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}): JSX.Element {
  const [theme, setThemeState] = useState(initialTheme);
  const setTheme = (next: Theme): void => {
    applyTheme(next);
    setThemeState(next);
  };
  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeState {
  const state = use(ThemeContext);
  if (!state) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return state;
}
