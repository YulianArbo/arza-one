'use client';

import { buttonVariants, QuickLinks } from '@arza/ui';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { visibleSubmodules } from '../../components/app-shell/submodules';
import { usePermissions } from '../session/permissions';
import { CRM_PATHS } from './labels';

// Piezas del embudo en la nueva jerarquía (B22B, boceto 06): la acción «Cotizaciones» del
// encabezado y «También en Comercial» al final, cada una según el permiso de la persona.

const ALSO_EXCLUDED = new Set<string>([CRM_PATHS.funnel, CRM_PATHS.quotes]);

/** «Cotizaciones» en el encabezado del embudo, para quien las puede ver. */
export function QuotesAction(): JSX.Element | null {
  const { can } = usePermissions();
  if (!can('crm.quote.read')) return null;
  return (
    <Link href={CRM_PATHS.quotes} className={buttonVariants({ variant: 'outline' })}>
      <FileText aria-hidden="true" />
      Cotizaciones
    </Link>
  );
}

/** Las demás funciones de Comercial: prospectos, actividades, campañas, portafolio e informe. */
export function CommercialAlso(): JSX.Element | null {
  const { granted, grantedAll } = usePermissions();
  const links = visibleSubmodules('comercial', granted, grantedAll)
    .filter((entry) => !ALSO_EXCLUDED.has(entry.href))
    .map((entry) => ({ href: entry.href, label: entry.label, icon: <entry.icon /> }));
  if (links.length === 0) return null;
  return <QuickLinks title="También en Comercial" links={links} linkAs={Link} />;
}
