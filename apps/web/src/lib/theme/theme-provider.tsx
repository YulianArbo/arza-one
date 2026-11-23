'use client';

import { createContext, use, useCallback, useRef, useState, type JSX, type ReactNode } from 'react';

import { forgetThemeCookie, themeClassName, themeCookie, THEMES, type Theme } from './theme';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /**
   * Si el modo se recuerda en la cookie. En el sitio público es una cookie de preferencias: solo
   * se guarda si el visitante las aceptó (numeral 20.4; B41, decisión 6). Al negarlo, se borra.
   */
  setRemember: (remember: boolean) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Cambia el modo en la página y, si se permite, lo recuerda para la próxima visita. */
function applyTheme(theme: Theme, remember: boolean): void {
  const root = document.documentElement;
  root.classList.remove(...THEMES);
  const className = themeClassName(theme);
  if (className) {
    root.classList.add(className);
  }
  if (remember) document.cookie = themeCookie(theme, window.location.protocol === 'https:');
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}): JSX.Element {
  const [theme, setThemeState] = useState(initialTheme);
  // La aplicación y el portal lo recuerdan siempre; el sitio público lo decide con el aviso.
  const remember = useRef(true);
  const setTheme = (next: Theme): void => {
    applyTheme(next, remember.current);
    setThemeState(next);
  };
  const setRemember = useCallback((next: boolean): void => {
    remember.current = next;
    if (!next) document.cookie = forgetThemeCookie();
  }, []);
  return <ThemeContext value={{ theme, setTheme, setRemember }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeState {
  const state = use(ThemeContext);
  if (!state) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return state;
}
