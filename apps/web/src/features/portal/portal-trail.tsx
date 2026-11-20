'use client';

import { buttonVariants } from '@arza/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';

import { PORTAL_PATHS, portalSection } from './portal-sections';

/**
 * Dónde está la persona en el portal (B22B, bocetos 25 y 26): en el inicio, «Portal de clientes»;
 * en una sección, «Volver al portal» y la ruta «Portal de clientes / sección».
 */
export function PortalTrail(): JSX.Element {
  const section = portalSection(usePathname().split('/')[2] ?? '');
  if (section === undefined) {
    return <p className="text-sm text-foreground">Portal de clientes</p>;
  }
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link
        href={PORTAL_PATHS.home}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0' })}
      >
        <ArrowLeft aria-hidden="true" />
        Volver al portal
      </Link>
      <nav aria-label="Ruta de navegación" className="min-w-0 truncate text-sm">
        Portal de clientes / <span aria-current="page">{section.label}</span>
      </nav>
    </div>
  );
}
