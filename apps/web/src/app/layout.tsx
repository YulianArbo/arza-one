// Tipografías autoalojadas (16.2): se sirven desde el propio servidor, sin llamadas a terceros.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import './globals.css';

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { JSX, ReactNode } from 'react';

import { ApiProvider } from '../lib/api/api-provider';
import { loadWebEnv } from '../lib/config/web-env';
import { parseTheme, THEME_COOKIE, themeClassName } from '../lib/theme/theme';
import { ThemeProvider } from '../lib/theme/theme-provider';

export const metadata: Metadata = {
  title: { default: 'ARZA ONE', template: '%s · ARZA ONE' },
  description: 'Plataforma empresarial de ARZA TECH S.A.S.',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const env = loadWebEnv();
  return (
    <html lang="es-CO" className={themeClassName(theme)}>
      <body className="min-h-dvh antialiased">
        <ThemeProvider initialTheme={theme}>
          <ApiProvider apiUrl={env.API_URL}>{children}</ApiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
