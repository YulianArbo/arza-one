import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { UserMenu } from '../../../components/app-shell/top-bar-menus';
import { BrandLogo } from '../../../components/brand-logo';
import { ThemeMenu } from '../../../components/theme-menu';
import { PortalCompany } from '../../../features/portal/portal-company';
import { CompanyBrand } from '../../../features/tenancy/company-brand';
import { PortalGate } from '../../../features/portal/portal-gate';
import { PortalTabs } from '../../../features/portal/portal-tabs';
import { PortalTrail } from '../../../features/portal/portal-trail';
import { FormDraftRestore } from '../../../features/session/form-draft-restore';
import { RequireSession } from '../../../features/session/session-provider';

// Portal del cliente: nunca indexable (numeral 15.6). Se diseña primero para celular (16.6).
export const metadata: Metadata = {
  title: { default: 'Portal del cliente', template: '%s · Portal ARZA ONE' },
  robots: { index: false, follow: false },
};

/**
 * Encabezado del portal (B22B, bocetos 24 a 26): logo a la izquierda, dónde está la persona al
 * centro y, a la derecha, la apariencia, la empresa cliente y la persona. En celular, la ruta pasa
 * a una segunda fila.
 */
function PortalHeader(): JSX.Element {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link
          href="/portal"
          aria-label="ARZA ONE, inicio del portal"
          className="flex shrink-0 items-center text-foreground"
        >
          <BrandLogo className="h-6 w-auto" />
        </Link>
        <div className="order-last w-full md:order-none md:mx-auto md:w-auto">
          <PortalTrail />
        </div>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ThemeMenu className="mx-1 hidden sm:inline-flex" />
          <div className="hidden lg:block">
            <CompanyBrand />
          </div>
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
          <PortalTabs />
          <PortalGate>{children}</PortalGate>
        </main>
      </div>
    </RequireSession>
  );
}
