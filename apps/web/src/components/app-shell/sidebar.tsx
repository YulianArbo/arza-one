import { TooltipProvider } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { BrandLogo } from '../brand-logo';
import { APP_HOME } from './navigation';
import { NavigationList } from './navigation-list';

/**
 * Zona 1 de la figura 16.3: menú por módulos según permisos. Completo en escritorio,
 * contraído a iconos en tableta y oculto en celular, donde se abre desde la barra superior.
 */
export function Sidebar({ permissions }: { permissions: readonly string[] }): JSX.Element {
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar px-2 py-5 md:flex md:w-16 lg:w-64 lg:px-3">
      <Link href={APP_HOME} className="px-1 text-sidebar-foreground lg:px-3">
        <BrandLogo markOnly className="mx-auto h-8 w-auto lg:hidden" />
        <BrandLogo onDark className="hidden h-8 w-auto lg:block" />
      </Link>
      <nav aria-label="Menú principal">
        <TooltipProvider delayDuration={200}>
          <NavigationList permissions={permissions} collapsible />
        </TooltipProvider>
      </nav>
    </aside>
  );
}
