'use client';

import Link from 'next/link';
import type { JSX } from 'react';

import { usePermissions, type PermissionView } from '../session/permissions';
import { SERVICE_PATHS } from './labels';

// Secciones de Servicio al cliente (B28 y B29): tiquetes, PQRSF, encuestas y NPS, y base de
// conocimiento. Cada persona ve las que su rol le permite; la API vuelve a comprobarlo.

type Section = 'tickets' | 'pqrsf' | 'surveys' | 'knowledge';

const SECTIONS: readonly {
  readonly key: Section;
  readonly label: string;
  readonly href: string;
  readonly allowed: (view: PermissionView) => boolean;
}[] = [
  {
    key: 'tickets',
    label: 'Tiquetes',
    href: SERVICE_PATHS.inbox,
    allowed: (view) => view.can('service.ticket.read'),
  },
  {
    key: 'pqrsf',
    label: 'PQRSF',
    href: SERVICE_PATHS.pqrsfInbox,
    allowed: (view) => view.can('service.pqrsf.read'),
  },
  {
    key: 'surveys',
    label: 'Encuestas y NPS',
    href: SERVICE_PATHS.surveys,
    allowed: (view) => view.canAll('service.ticket.read'),
  },
  {
    key: 'knowledge',
    label: 'Base de conocimiento',
    href: SERVICE_PATHS.knowledge,
    allowed: (view) => view.can('service.kb.read'),
  },
];

export function ServiceNav({ current }: { readonly current: Section }): JSX.Element | null {
  const view = usePermissions();
  const visible = SECTIONS.filter((section) => section.allowed(view));
  if (visible.length < 2) return null;
  return (
    <nav aria-label="Secciones de Servicio al cliente">
      <ul className="flex flex-wrap gap-1 border-b">
        {visible.map((section) => {
          const active = section.key === current;
          return (
            <li key={section.key}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex border-b-2 px-3 py-2 text-sm ${
                  active
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
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
