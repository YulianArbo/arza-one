'use client';

import { Card, CardDescription, CardHeader, CardTitle, ForbiddenState } from '@arza/ui';
import { ClipboardCheck, KeyRound, Repeat, Settings2, Users } from 'lucide-react';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { usePermissions } from '../session/permissions';
import { ADMIN_PATHS } from './labels';

interface Section {
  readonly href: string | null;
  readonly title: string;
  readonly description: string;
  readonly permission: string;
  readonly icon: ReactNode;
}

const SECTIONS: readonly Section[] = [
  {
    href: ADMIN_PATHS.users,
    title: 'Usuarios',
    description: 'Invitar, bloquear, reiniciar el segundo factor y asignar roles.',
    permission: 'iam.user.read',
    icon: <Users aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.roles,
    title: 'Roles y permisos',
    description: 'Los 16 roles del sistema y los roles personalizados de la empresa.',
    permission: 'iam.role.read',
    icon: <KeyRound aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.delegations,
    title: 'Delegaciones',
    description: 'Delegar aprobaciones por un tiempo, por ejemplo durante unas vacaciones.',
    permission: 'iam.delegation.manage',
    icon: <Repeat aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.accessReview,
    title: 'Revisión de accesos',
    description: 'Informe para la Dirección: usuarios, roles, último ingreso y cuentas sin uso.',
    permission: 'iam.access_review.read',
    icon: <ClipboardCheck aria-hidden="true" />,
  },
  {
    href: null,
    title: 'Empresa, catálogos y parámetros',
    description: 'Se construye en el bloque B12 del plan de construcción.',
    permission: 'core.parameter.manage',
    icon: <Settings2 aria-hidden="true" />,
  },
];

function SectionCard({ section }: { readonly section: Section }): JSX.Element {
  const content = (
    <CardHeader className="flex flex-row items-start gap-3 [&_svg]:size-5 [&_svg]:shrink-0">
      {section.icon}
      <div className="space-y-1">
        <CardTitle className="text-base">{section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </div>
    </CardHeader>
  );
  if (section.href === null) return <Card className="opacity-80">{content}</Card>;
  return (
    <Link
      href={section.href}
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="h-full transition-colors hover:border-primary">{content}</Card>
    </Link>
  );
}

/** Entrada de Administración: solo las secciones que la persona puede usar (numeral 16.3). */
export function AdminHome(): JSX.Element | null {
  const permissions = usePermissions();
  if (!permissions.ready) return null;
  const visible = SECTIONS.filter((section) => permissions.can(section.permission));
  if (visible.length === 0) return <ForbiddenState />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Secciones de administración">
      {visible.map((section) => (
        <li key={section.title}>
          <SectionCard section={section} />
        </li>
      ))}
    </ul>
  );
}
