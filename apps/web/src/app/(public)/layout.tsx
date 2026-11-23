import type { JSX, ReactNode } from 'react';

import { CookieConsentProvider } from '../../features/site/cookie-consent';
import { SiteFooter, SiteHeader } from '../../features/site/site-chrome';

/** Vitrina pública (B22A): encabezado y pie comunes a sus páginas, con el aviso de cookies (B41). */
export default function PublicLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <CookieConsentProvider>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#contenido"
          className="sr-only z-50 rounded-md bg-action px-3 py-2 text-action-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex flex-1 flex-col">
          {children}
        </main>
        <SiteFooter />
      </div>
    </CookieConsentProvider>
  );
}
