import { TooltipProvider } from '@arza/ui';
import type { JSX } from 'react';

import { NavigationList } from './navigation-list';

/**
 * Zona 1 de la figura 16.3: menú por módulos según permisos, a la izquierda y bajo la barra
 * superior. Completo en escritorio, contraído a iconos en tableta y oculto en celular, donde se
 * abre desde la barra superior.
 */
export function Sidebar({ permissions }: { permissions: readonly string[] }): JSX.Element {
  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-y-auto border-r bg-card px-2 py-4 md:block md:w-16 lg:w-60 lg:px-3">
      <nav aria-label="Menú principal">
        <TooltipProvider delayDuration={200}>
          <NavigationList permissions={permissions} collapsible />
        </TooltipProvider>
      </nav>
    </aside>
  );
}
