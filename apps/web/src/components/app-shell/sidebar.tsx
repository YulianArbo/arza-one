'use client';

import { TooltipProvider } from '@arza/ui';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { useId, type JSX } from 'react';

import { BrandLogo } from '../brand-logo';
import { APP_HOME } from './navigation';
import { NavigationList } from './navigation-list';
import { CompactMenuContext, useCompactMenu } from './use-compact-menu';

interface SidebarProps {
  permissions: readonly string[];
  permissionsAll: readonly string[];
}

/**
 * Zona 1 de la figura 16.3 (B22B): menú por grupos a todo el alto, con el logo arriba. Blanco con
 * borde fino, distinto del fondo del contenido (decisión del dueño, 19/11/2026). Completo en
 * escritorio, contraído a iconos en tableta y oculto en celular, donde se abre desde la barra. En
 * escritorio la persona lo pliega a iconos y lo vuelve a desplegar con el botón de abajo (B49);
 * la lista se desplaza sola cuando no cabe y el botón queda siempre a la vista.
 */
export function Sidebar({ permissions, permissionsAll }: SidebarProps): JSX.Element {
  const { compact, toggle } = useCompactMenu();
  const navId = useId();
  return (
    <aside
      data-menu={compact ? 'collapsed' : 'expanded'}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-card transition-[width] duration-200 md:flex md:w-16 menu-wide:w-60"
    >
      <Link
        href={APP_HOME}
        className="flex h-16 shrink-0 items-center justify-center px-3 text-foreground menu-wide:justify-start menu-wide:px-6"
      >
        <BrandLogo markOnly className="h-6 w-auto menu-wide:hidden" />
        <BrandLogo className="hidden h-6 w-auto menu-wide:block" />
      </Link>
      <nav
        id={navId}
        aria-label="Menú principal"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6 menu-wide:px-3"
      >
        <CompactMenuContext.Provider value={compact}>
          <TooltipProvider delayDuration={200}>
            <NavigationList permissions={permissions} permissionsAll={permissionsAll} collapsible />
          </TooltipProvider>
        </CompactMenuContext.Provider>
      </nav>
      <CompactToggle compact={compact} controls={navId} onToggle={toggle} />
    </aside>
  );
}

interface CompactToggleProps {
  compact: boolean;
  controls: string;
  onToggle: () => void;
}

/** Botón de escritorio para plegar el menú a iconos o volver a mostrar los nombres. */
function CompactToggle({ compact, controls, onToggle }: CompactToggleProps): JSX.Element {
  const label = compact ? 'Expandir menú' : 'Contraer menú';
  const Icon = compact ? PanelLeftOpen : PanelLeftClose;
  return (
    <div className="hidden shrink-0 border-t p-2 lg:block">
      <button
        type="button"
        aria-controls={controls}
        aria-expanded={!compact}
        title={label}
        onClick={onToggle}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg px-3 py-2 text-nav font-medium text-muted-foreground hover-invert menu-wide:justify-start"
      >
        <Icon aria-hidden="true" className="size-[18px] shrink-0" />
        <span className="sr-only menu-wide:not-sr-only">{label}</span>
      </button>
    </div>
  );
}
