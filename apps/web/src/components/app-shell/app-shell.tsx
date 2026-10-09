'use client';

import type { JSX, ReactNode } from 'react';

import { usePermissions } from '../../features/session/permissions';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/** Estructura de pantalla de la aplicación interna (numeral 16.3). Texto base de 14 px. */
export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  // Mientras llegan los permisos, el menú muestra solo lo que no los necesita.
  const permissions = [...usePermissions().granted];
  return (
    <div className="flex min-h-dvh text-sm">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <Sidebar permissions={permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar permissions={permissions} />
        <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
