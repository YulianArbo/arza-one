import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { UserMenu } from '../../../components/app-shell/top-bar-menus';
import { BrandLogo } from '../../../components/brand-logo';
import { ThemeMenu } from '../../../components/theme-menu';
import { PortalCompany } from '../../../features/portal/portal-company';
import { PortalGate } from '../../../features/portal/portal-gate';
import { PortalTabs } from '../../../features/portal/portal-tabs';
import { FormDraftRestore } from '../../../features/session/form-draft';
import { RequireSession } from '../../../features/session/session-provider';

// Portal del cliente: nunca indexable (numeral 15.6). Se diseña primero para celular (16.6).
export const metadata: Metadata = {
  title: { default: 'Portal del cliente', template: '%s · Portal ARZA ONE' },
  robots: { index: false, follow: false },
};

/**
 * Encabezado del portal (B22A): logo a la izquierda, pestañas al centro y, a la derecha, la
 * apariencia, la empresa cliente y la persona. En celular las pestañas pasan a una segunda fila
 * que se desliza.
 */
function PortalHeader(): JSX.Element {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link href="/portal" className="flex shrink-0 items-center gap-2 text-foreground">
          <BrandLogo className="h-6 w-auto" />
          <span className="rounded-full border px-2 text-xs text-muted-foreground">Clientes</span>
        </Link>
        <PortalTabs className="order-last w-full xl:order-none xl:mx-auto xl:w-auto" />
        <div className="ml-auto flex items-center gap-1 xl:ml-0">
          <ThemeMenu className="mx-1 hidden sm:inline-flex" />
          <div className="hidden sm:block">
            <PortalCompany />
          </div>
          <UserMenu compact />
        </div>
      </div>
    </header>
  );
}

export default function PortalLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <RequireSession kind="portal">
      <FormDraftRestore />
      <div className="flex min-h-dvh flex-col">
        <PortalHeader />
        <main
          id="contenido"
          className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 animate-enter"
        >
          <PortalGate>{children}</PortalGate>
        </main>
      </div>
    </RequireSession>
  );
}
