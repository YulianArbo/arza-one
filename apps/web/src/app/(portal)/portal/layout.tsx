import type { Metadata } from 'next';
import type { JSX, ReactNode } from 'react';

import { ThemeMenu } from '../../../components/theme-menu';

// Portal del cliente: nunca indexable (numeral 15.6). Se diseña primero para celular (16.6).
export const metadata: Metadata = {
  title: { default: 'Portal del cliente', template: '%s · Portal ARZA ONE' },
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-8">
        <p className="font-heading text-lg font-bold">Portal ARZA ONE</p>
        <ThemeMenu />
      </header>
      <main
        id="contenido"
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8"
      >
        {children}
      </main>
    </div>
  );
}
