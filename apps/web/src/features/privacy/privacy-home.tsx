'use client';

import { buttonVariants, ForbiddenState, HighlightCard } from '@arza/ui';
import { BookCheck, Cookie, FileText, Inbox, ListTree, ShieldAlert, Truck } from 'lucide-react';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { usePermissions } from '../session/permissions';
import { PRIVACY_PATHS } from './labels';
import { B42_PATHS } from './request-labels';

// Entrada de Privacidad (B17, B22B): las secciones del Oficial de Protección de Datos que la persona
// puede usar, con las solicitudes de titulares, los incidentes y las cookies (B42).

interface Section {
  readonly href: string;
  readonly title: string;
  /** Nombre corto para el botón «Abrir …», que no debe salirse de la tarjeta. */
  readonly short: string;
  readonly description: string;
  readonly permission: string;
  readonly icon: ReactNode;
}

const SECTIONS: readonly Section[] = [
  {
    href: B42_PATHS.requests,
    title: 'Solicitudes de titulares',
    short: 'solicitudes',
    description: 'Consultas y reclamos con su plazo legal, la entrega y la supresión de los datos.',
    permission: 'privacy.request.manage',
    icon: <Inbox aria-hidden="true" />,
  },
  {
    href: B42_PATHS.incidents,
    title: 'Incidentes',
    short: 'incidentes',
    description: 'Incidentes con datos personales, su bitácora y el reporte a la SIC.',
    permission: 'privacy.incident.manage',
    icon: <ShieldAlert aria-hidden="true" />,
  },
  {
    href: PRIVACY_PATHS.activities,
    title: 'Actividades de tratamiento',
    short: 'actividades',
    description: 'Qué datos personales se tratan, de quiénes, para qué y por cuánto tiempo.',
    permission: 'privacy.activity.manage',
    icon: <ListTree aria-hidden="true" />,
  },
  {
    href: PRIVACY_PATHS.notices,
    title: 'Avisos y versiones',
    short: 'avisos',
    description: 'La política, el aviso de privacidad y las autorizaciones, con sus versiones.',
    permission: 'privacy.notice.manage',
    icon: <FileText aria-hidden="true" />,
  },
  {
    href: PRIVACY_PATHS.consents,
    title: 'Autorizaciones',
    short: 'autorizaciones',
    description: 'Quién autorizó qué, con qué versión del texto, cuándo y con qué evidencia.',
    permission: 'privacy.consent.read',
    icon: <BookCheck aria-hidden="true" />,
  },
  {
    href: PRIVACY_PATHS.processors,
    title: 'Encargados',
    short: 'encargados',
    description: 'Proveedores que tratan datos personales y su contrato de transmisión.',
    permission: 'privacy.processor.manage',
    icon: <Truck aria-hidden="true" />,
  },
  {
    href: B42_PATHS.cookies,
    title: 'Cookies',
    short: 'cookies',
    description:
      'Qué aceptaron los visitantes del sitio, por categoría y por versión de la política.',
    permission: 'privacy.notice.manage',
    icon: <Cookie aria-hidden="true" />,
  },
];

function SectionCard({ section }: { readonly section: Section }): JSX.Element {
  return (
    <HighlightCard title={section.title} description={section.description} className="h-full">
      <Link
        href={section.href}
        className={buttonVariants({ variant: 'outline', className: 'mt-auto self-start' })}
      >
        {section.icon}
        Abrir {section.short}
      </Link>
    </HighlightCard>
  );
}

/** Entrada de Privacidad (B22B, boceto 18): una tarjeta por sección permitida. */
export function PrivacyHome(): JSX.Element | null {
  const permissions = usePermissions();
  if (!permissions.ready) return null;
  const visible = SECTIONS.filter((section) => permissions.can(section.permission));
  if (visible.length === 0) return <ForbiddenState />;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Secciones de privacidad">
      {visible.map((section) => (
        <li key={section.title}>
          <SectionCard section={section} />
        </li>
      ))}
    </ul>
  );
}
