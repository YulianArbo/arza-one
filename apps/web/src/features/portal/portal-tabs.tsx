'use client';

import { cn } from '@arza/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { PORTAL_SECTIONS, portalPath } from './portal-sections';

/**
 * Pestañas del portal en la barra superior (B22A); la actual se marca con aria-current. Solo las
 * secciones que el rol de la persona permite (B30); la API decide igual en cada petición.
 */
export function PortalTabs({ className }: { readonly className?: string }): JSX.Element {
  const pathname = usePathname();
  const permissions = usePermissions();
  const sections = PORTAL_SECTIONS.filter((section) => permissions.can(section.permission));
  return (
    <nav aria-label="Secciones del portal" className={cn('max-w-full overflow-x-auto', className)}>
      <ul className="flex w-max gap-0.5 rounded-lg border bg-card p-0.5">
        {sections.map((section) => {
          const href = portalPath(section);
          const current = href === '/portal' ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  current
                    ? 'bg-invert font-medium text-invert-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
