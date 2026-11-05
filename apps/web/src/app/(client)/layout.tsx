import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { BrandLogo } from '../../components/brand-logo';
import { ThemeMenu } from '../../components/theme-menu';

// Páginas que el cliente abre desde un enlace del correo, sin sesión (B23). Nunca indexables
// (numeral 15.6): la llave del enlace es privada.
export const metadata: Metadata = {
  title: { default: 'Cotización', template: '%s · ARZA ONE' },
  robots: { index: false, follow: false },
};

export default function ClientLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-8">
        <Link href="/" className="text-foreground">
          <BrandLogo className="h-7 w-auto" />
        </Link>
        <ThemeMenu />
      </header>
      <main id="contenido" className="flex flex-1 justify-center px-4 py-8 sm:px-8">
        {children}
      </main>
      <footer className="flex justify-between gap-3 px-4 py-4 text-xs text-muted-foreground sm:px-8">
        <span>ARZA ONE · ARZA TECH S.A.S.</span>
        <Link href="/legal/privacidad" className="hover:text-foreground">
          Privacidad
        </Link>
      </footer>
    </div>
  );
}
