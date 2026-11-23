'use client';

import { buttonVariants, ForbiddenState, HighlightCard } from '@arza/ui';
import { FileText, Inbox, Scale } from 'lucide-react';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { usePermissions } from '../session/permissions';
import { WEBSITE_PATHS } from './labels';

// Entrada del módulo «Sitio web» (B41, ficha 17.18): las secciones que la persona puede usar.

interface Section {
  readonly href: string;
  readonly title: string;
  readonly short: string;
  readonly description: string;
  readonly permissions: readonly string[];
  readonly icon: ReactNode;
}

const SECTIONS: readonly Section[] = [
  {
    href: WEBSITE_PATHS.pages,
    title: 'Páginas',
    short: 'páginas',
    description: 'Páginas institucionales como «Nosotros»: se redactan, se publican y se retiran.',
    permissions: ['web.page.manage'],
    icon: <FileText aria-hidden="true" />,
  },
  {
    href: WEBSITE_PATHS.texts,
    title: 'Textos legales',
    short: 'textos',
    description:
      'Términos, cookies, derechos del titular y más, con sus versiones: borrador, aprobado y publicado.',
    permissions: ['web.legal_text.manage', 'web.legal_text.publish'],
    icon: <Scale aria-hidden="true" />,
  },
  {
    href: WEBSITE_PATHS.submissions,
    title: 'Formularios recibidos',
    short: 'formularios',
    description: 'Mensajes de contacto y solicitudes de cotización, y las bajas de comunicaciones.',
    permissions: ['web.submission.read'],
    icon: <Inbox aria-hidden="true" />,
  },
];

export function WebsiteHome(): JSX.Element | null {
  const permissions = usePermissions();
  if (!permissions.ready) return null;
  const visible = SECTIONS.filter((section) =>
    section.permissions.some((code) => permissions.can(code)),
  );
  if (visible.length === 0) return <ForbiddenState />;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Secciones del sitio web">
      {visible.map((section) => (
        <li key={section.title}>
          <HighlightCard title={section.title} description={section.description} className="h-full">
            <Link
              href={section.href}
              className={buttonVariants({ variant: 'outline', className: 'mt-auto self-start' })}
            >
              {section.icon}
              Abrir {section.short}
            </Link>
          </HighlightCard>
        </li>
      ))}
    </ul>
  );
}
