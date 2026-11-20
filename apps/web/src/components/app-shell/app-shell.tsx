'use client';

import type { JSX, ReactNode } from 'react';

import { usePermissions } from '../../features/session/permissions';
import { useSession } from '../../features/session/session-provider';
import { useRememberModule } from './recent-modules';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/**
 * Estructura de la aplicación interna (16.3, B22B): el menú a todo el alto con el logo a la
 * izquierda y, a su lado, la barra superior y el contenido. Texto base de 14 px.
 */
export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  // Mientras llegan los permisos, el menú muestra solo lo que no los necesita.
  const view = usePermissions();
  const permissions = [...view.granted];
  const permissionsAll = [...view.grantedAll];
  useRememberModule(useSession().session.user.id);
  return (
    <div className="flex min-h-dvh text-sm">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-action px-3 py-2 text-action-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <Sidebar permissions={permissions} permissionsAll={permissionsAll} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar permissions={permissions} permissionsAll={permissionsAll} />
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col gap-6 p-4 animate-enter sm:p-6 lg:px-10 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
