import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { ThemeMenu } from '../../components/theme-menu';

// Pantallas de acceso (16.7): nunca indexables (15.6).
export const metadata: Metadata = {
  title: { default: 'Acceso', template: '%s · ARZA ONE' },
  robots: { index: false, follow: false },
};

export default function AccessLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between bg-sidebar px-4 py-3 sm:px-8">
        <Link href="/" className="font-heading text-lg font-bold text-sidebar-foreground">
          ARZA ONE
        </Link>
        <ThemeMenu />
      </header>
      <main id="contenido" className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        {children}
      </main>
    </div>
  );
}
