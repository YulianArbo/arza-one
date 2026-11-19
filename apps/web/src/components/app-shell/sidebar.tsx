import { TooltipProvider } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { BrandLogo } from '../brand-logo';
import { APP_HOME } from './navigation';
import { NavigationList } from './navigation-list';

/**
 * Zona 1 de la figura 16.3 (B22B): menú por grupos a todo el alto, con el logo arriba. Blanco con
 * borde fino, distinto del fondo del contenido (decisión del dueño, 19/11/2026). Completo en
 * escritorio, contraído a iconos en tableta y oculto en celular, donde se abre desde la barra.
 */
export function Sidebar({ permissions }: { permissions: readonly string[] }): JSX.Element {
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card md:flex md:w-16 lg:w-60">
      <Link
        href={APP_HOME}
        className="flex h-16 shrink-0 items-center justify-center px-3 text-foreground lg:justify-start lg:px-6"
      >
        <BrandLogo markOnly className="h-6 w-auto lg:hidden" />
        <BrandLogo className="hidden h-6 w-auto lg:block" />
      </Link>
      <nav aria-label="Menú principal" className="flex-1 overflow-y-auto px-2 pb-6 lg:px-3">
        <TooltipProvider delayDuration={200}>
          <NavigationList permissions={permissions} collapsible />
        </TooltipProvider>
      </nav>
    </aside>
  );
}
