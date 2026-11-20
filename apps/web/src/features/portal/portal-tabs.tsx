'use client';

import { cn } from '@arza/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createElement, type JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { PORTAL_SECTIONS, portalPath } from './portal-sections';

/**
 * Pestañas del portal con su ícono (B22B); la actual va subrayada en azul y con aria-current. En
 * celular se deslizan en una sola fila. Solo las secciones que el rol de la persona permite
 * (B30); la API decide igual en cada petición.
 */
export function PortalTabs({ className }: { readonly className?: string }): JSX.Element {
  const pathname = usePathname();
  const permissions = usePermissions();
  const sections = PORTAL_SECTIONS.filter((section) => permissions.can(section.permission));
  return (
    <nav aria-label="Secciones del portal" className={cn('max-w-full overflow-x-auto', className)}>
      <ul className="flex w-max min-w-full gap-1 border-b">
        {sections.map((section) => {
          const href = portalPath(section);
          const current = href === '/portal' ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-200',
                  current
                    ? 'border-primary font-medium text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {createElement(section.icon, { 'aria-hidden': true, className: 'size-4' })}
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
