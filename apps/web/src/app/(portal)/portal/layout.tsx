import type { Metadata } from 'next';
import type { JSX, ReactNode } from 'react';

import { UserMenu } from '../../../components/app-shell/top-bar-menus';
import { ThemeMenu } from '../../../components/theme-menu';
import { RequireSession } from '../../../features/session/session-provider';

// Portal del cliente: nunca indexable (numeral 15.6). Se diseña primero para celular (16.6).
export const metadata: Metadata = {
  title: { default: 'Portal del cliente', template: '%s · Portal ARZA ONE' },
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <RequireSession kind="portal">
      <div className="flex min-h-dvh flex-col">
        <header className="border-b bg-card">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
            <p className="font-heading text-lg font-bold">
              ARZA ONE <span className="font-semibold text-primary">Clientes</span>
            </p>
            <div className="flex items-center gap-1">
              <ThemeMenu />
              <UserMenu />
            </div>
          </div>
        </header>
        <main
          id="contenido"
          className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8"
        >
          {children}
        </main>
      </div>
    </RequireSession>
  );
}
