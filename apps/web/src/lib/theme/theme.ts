// Preferencia de modo claro u oscuro (16.2). Se guarda en una cookie funcional propia que no
// contiene datos personales; el servidor la lee para pintar la página ya en el modo elegido.

export const THEME_COOKIE = 'arza_theme';

export const THEMES = ['light', 'dark', 'system'] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Según el sistema',
};

const ONE_YEAR_SECONDS = 31_536_000;

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? 'system';
}

/** Clase para <html>. Sin clase, los tokens siguen la preferencia del sistema operativo. */
export function themeClassName(theme: Theme): string | undefined {
  return theme === 'system' ? undefined : theme;
}

/** Texto de la cookie; Secure cuando la página va por HTTPS. */
export function themeCookie(theme: Theme, isSecure: boolean): string {
  const secure = isSecure ? '; Secure' : '';
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${String(ONE_YEAR_SECONDS)}; SameSite=Lax${secure}`;
}

/** Colores de un botón sobre las barras en el color de marca oscuro (B20A). */
export const ON_BRAND = 'text-sidebar-foreground hover:bg-sidebar-hover';
