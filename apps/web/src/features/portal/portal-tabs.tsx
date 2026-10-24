'use client';

import { cn } from '@arza/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';

import { PORTAL_SECTIONS, portalPath } from './portal-sections';

/** Pestañas del portal en la barra superior (B22A); la actual se marca con aria-current. */
export function PortalTabs({ className }: { readonly className?: string }): JSX.Element {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del portal" className={cn('max-w-full overflow-x-auto', className)}>
      <ul className="flex w-max gap-0.5 rounded-lg border bg-card p-0.5">
        {PORTAL_SECTIONS.map((section) => {
          const href = portalPath(section);
          const current = pathname === href;
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
