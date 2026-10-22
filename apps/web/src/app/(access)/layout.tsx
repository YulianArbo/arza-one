import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { ThemeMenu } from '../../components/theme-menu';
import { ON_BRAND } from '../../lib/theme/theme';

// Pantallas de acceso (16.7): nunca indexables (15.6).
export const metadata: Metadata = {
  title: { default: 'Acceso', template: '%s · ARZA ONE' },
  robots: { index: false, follow: false },
};

const BRAND_LINK = 'font-heading text-lg font-bold text-sidebar-foreground';

/**
 * Acceso (B20A): panel de marca a la izquierda en escritorio y formulario a la derecha.
 * En celular el panel se reduce a la barra superior con el nombre de la plataforma.
 */
export default function AccessLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Link href="/" className={BRAND_LINK}>
          ARZA ONE
        </Link>
        <div className="flex flex-col gap-2">
          <p className="font-heading text-3xl font-bold">Su trabajo diario, en un solo lugar.</p>
          <p className="opacity-80">ARZA ONE, la plataforma de ARZA TECH S.A.S.</p>
        </div>
      </aside>
      <div className="flex flex-col">
        <header className="flex items-center justify-between bg-sidebar px-4 py-3 sm:px-8 lg:justify-end lg:bg-transparent">
          <Link href="/" className={`${BRAND_LINK} lg:hidden`}>
            ARZA ONE
          </Link>
          <ThemeMenu className={`${ON_BRAND} lg:text-foreground lg:hover:bg-accent`} />
        </header>
        <main
          id="contenido"
          className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16 lg:items-center"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
