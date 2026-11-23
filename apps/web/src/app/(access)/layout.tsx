import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { BrandLogo } from '../../components/brand-logo';
import { ThemeMenu } from '../../components/theme-menu';
import { AccessAnnouncements } from '../../features/access/access-announcements';
import { AudienceProvider } from '../../features/access/audience-context';
import { BrandPanel } from '../../features/access/brand-panel';

// Pantallas de acceso (16.7): nunca indexables (15.6).
export const metadata: Metadata = {
  title: { default: 'Acceso', template: '%s · ARZA ONE' },
  robots: { index: false, follow: false },
};

function AccessFooter(): JSX.Element {
  return (
    <footer className="flex justify-between gap-3 px-4 py-4 text-xs text-muted-foreground sm:px-8">
      <span>ARZA ONE · ARZA TECH S.A.S.</span>
      <span>
        <Link href="/legal/terminos-de-la-plataforma" className="hover:text-foreground">
          Términos
        </Link>{' '}
        ·{' '}
        <Link href="/legal/privacidad" className="hover:text-foreground">
          Privacidad
        </Link>
      </span>
    </footer>
  );
}

/**
 * Acceso (B22A): panel de marca animado con el mensaje del día a la izquierda en escritorio, y el
 * formulario a la derecha. En celular solo va la barra con el logo.
 */
export default function AccessLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <AudienceProvider>
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <BrandPanel />
        <div className="flex flex-col">
          <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
            <Link href="/" className="text-foreground lg:hidden">
              <BrandLogo className="h-7 w-auto" />
            </Link>
            <Link
              href="/"
              className="hidden items-center gap-2 text-sm text-muted-foreground hover:text-foreground lg:inline-flex"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Volver al sitio
            </Link>
            <ThemeMenu />
          </header>
          <main
            id="contenido"
            className="flex flex-1 items-start justify-center px-4 py-8 sm:py-12 lg:items-center"
          >
            {children}
          </main>
          <AccessAnnouncements tone="light" className="px-4 pb-6 lg:hidden" />
          <AccessFooter />
        </div>
      </div>
    </AudienceProvider>
  );
}
