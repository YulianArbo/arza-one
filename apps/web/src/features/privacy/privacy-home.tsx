'use client';

import { Card, CardDescription, CardHeader, CardTitle, ForbiddenState } from '@arza/ui';
import { BookCheck, FileText, ListTree, Truck } from 'lucide-react';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { usePermissions } from '../session/permissions';
import { PRIVACY_PATHS } from './labels';

// Entrada de Privacidad (B17): las secciones del Oficial de Protección de Datos que la persona
// puede usar. Las solicitudes de titulares y los incidentes llegan en B42.

interface Section {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly permission: string;
  readonly icon: ReactNode;
}

const SECTIONS: readonly Section[] = [
  {
    href: PRIVACY_PATHS.activities,
    title: 'Actividades de tratamiento',
    description: 'Qué datos personales se tratan, de quiénes, para qué y por cuánto tiempo.',
    permission: 'privacy.activity.manage',
    icon: <ListTree aria-hidden="true" />,
  },
  {
    href: PRIVACY_PATHS.notices,
    title: 'Avisos y versiones',
    description: 'La política, el aviso de privacidad y las autorizaciones, con sus versiones.',
    permission: 'privacy.notice.manage',
    icon: <FileText aria-hidden="true" />,
  },
  {
    href: PRIVACY_PATHS.consents,
    title: 'Autorizaciones',
    description: 'Quién autorizó qué, con qué versión del texto, cuándo y con qué evidencia.',
    permission: 'privacy.consent.read',
    icon: <BookCheck aria-hidden="true" />,
  },
  {
    href: PRIVACY_PATHS.processors,
    title: 'Encargados',
    description: 'Proveedores que tratan datos personales y su contrato de transmisión.',
    permission: 'privacy.processor.manage',
    icon: <Truck aria-hidden="true" />,
  },
];

function SectionCard({ section }: { readonly section: Section }): JSX.Element {
  return (
    <Link
      href={section.href}
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="h-full hover-invert">
        <CardHeader className="flex flex-row items-start gap-3 [&_svg]:size-5 [&_svg]:shrink-0">
          {section.icon}
          <div className="space-y-1">
            <CardTitle className="text-base">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

export function PrivacyHome(): JSX.Element | null {
  const permissions = usePermissions();
  if (!permissions.ready) return null;
  const visible = SECTIONS.filter((section) => permissions.can(section.permission));
  if (visible.length === 0) return <ForbiddenState />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Secciones de privacidad">
      {visible.map((section) => (
        <li key={section.title}>
          <SectionCard section={section} />
        </li>
      ))}
    </ul>
  );
}
