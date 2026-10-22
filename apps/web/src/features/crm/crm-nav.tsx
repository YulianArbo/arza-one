'use client';

import { cn } from '@arza/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { CRM_PATHS } from './labels';

// Secciones de Comercial (B22, numeral 16.3): el embudo, los prospectos, las actividades, las
// campañas y el informe. Solo se muestran las que la persona puede ver.

const SECTIONS = [
  { href: CRM_PATHS.funnel, label: 'Embudo', permission: 'crm.opportunity.read' },
  { href: CRM_PATHS.leads, label: 'Prospectos', permission: 'crm.lead.read' },
  { href: CRM_PATHS.activities, label: 'Actividades', permission: 'crm.lead.read' },
  { href: CRM_PATHS.campaigns, label: 'Campañas', permission: 'crm.lead.read' },
  { href: CRM_PATHS.report, label: 'Informe del embudo', permission: 'crm.report.read' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === CRM_PATHS.funnel) {
    return pathname === href || pathname.startsWith(`${CRM_PATHS.funnel}/oportunidades`);
  }
  return pathname.startsWith(href);
}

export function CrmNav(): JSX.Element {
  const pathname = usePathname();
  const { can } = usePermissions();
  return (
    <nav aria-label="Secciones de Comercial" className="flex flex-wrap gap-1 border-b">
      {SECTIONS.filter((section) => can(section.permission)).map((section) => {
        const current = isCurrent(pathname, section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              current
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
