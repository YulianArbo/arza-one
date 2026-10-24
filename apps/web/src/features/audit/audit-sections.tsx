'use client';

import { cn } from '@arza/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { AUDIT_PATHS } from './labels';

const SECTIONS = [
  { href: AUDIT_PATHS.events, label: 'Consulta de eventos', permission: 'audit.event.read' },
  { href: AUDIT_PATHS.security, label: 'Eventos de seguridad', permission: 'audit.security.read' },
  { href: AUDIT_PATHS.exports, label: 'Exportaciones', permission: 'audit.event.read' },
  {
    href: AUDIT_PATHS.integrity,
    label: 'Verificación de integridad',
    permission: 'audit.chain.verify',
  },
] as const;

/** Pantallas de la auditoría (numeral 16.7, M19); solo las que la persona puede usar. */
export function AuditSections(): JSX.Element {
  const pathname = usePathname();
  const permissions = usePermissions();
  return (
    <nav aria-label="Secciones de la auditoría">
      <ul className="flex flex-wrap gap-1 border-b">
        {SECTIONS.filter((section) => permissions.can(section.permission)).map((section) => {
          const current = pathname === section.href;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex border-b-2 px-3 py-2 text-sm font-medium',
                  current
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
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
