'use client';

import { Card, CardDescription, CardHeader, CardTitle, ForbiddenState } from '@arza/ui';
import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileCode,
  Hash,
  KeyRound,
  Landmark,
  ListChecks,
  Mail,
  Network,
  Repeat,
  Settings2,
  Users,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { OUTPUT_TEMPLATES_PATH } from '../forms/labels';
import { NTF_PATHS } from '../notifications/labels';
import { usePermissions } from '../session/permissions';
import { WF_PATHS } from '../workflows/labels';
import { ADMIN_PATHS } from './labels';

interface Section {
  readonly href: string;
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
    href: WF_PATHS.definitions,
    title: 'Flujos',
    description: 'Estados, transiciones, aprobaciones y plazos de cada proceso, por versiones.',
    permission: 'wf.definition.manage',
    icon: <Workflow aria-hidden="true" />,
  },
  {
    href: NTF_PATHS.templates,
    title: 'Plantillas de aviso',
    description:
      'Asunto y texto de los avisos y correos, y cuáles son urgentes y no esperan a la jornada.',
    permission: 'ntf.template.manage',
    icon: <Mail aria-hidden="true" />,
  },
  {
    href: OUTPUT_TEMPLATES_PATH,
    title: 'Plantillas de salida',
    description:
      'Plantillas HTML o Word del PDF de los formatos digitales, con el encabezado institucional.',
    permission: 'doc.form_template.manage',
    icon: <FileCode aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.company,
    title: 'Empresa y sedes',
    description: 'Razón social, NIT y sedes, que salen en los documentos que genera la plataforma.',
    permission: 'core.tenant.read',
    icon: <Building2 aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.structure,
    title: 'Procesos, cargos y organigrama',
    description: 'El mapa de procesos y los cargos con su jerarquía (DC-SGC-001).',
    permission: 'core.org.read',
    icon: <Network aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.costCenters,
    title: 'Centros de costo',
    description: 'Los centros con que la empresa reparte sus gastos.',
    permission: 'core.org.read',
    icon: <Landmark aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.catalogs,
    title: 'Catálogos',
    description: 'Las listas que usan los formularios, como los tipos de documento.',
    permission: 'core.parameter.read',
    icon: <ListChecks aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.parameters,
    title: 'Parámetros',
    description: 'El horario laboral y otros valores con fecha de vigencia y su historial.',
    permission: 'core.parameter.read',
    icon: <Settings2 aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.sequences,
    title: 'Consecutivos',
    description: 'Los códigos como COT-2026-0001, sin saltos ni repetidos.',
    permission: 'core.sequence.manage',
    icon: <Hash aria-hidden="true" />,
  },
  {
    href: ADMIN_PATHS.holidays,
    title: 'Festivos y días hábiles',
    description: 'Los festivos de Colombia y el cálculo de plazos en días hábiles.',
    permission: 'core.parameter.read',
    icon: <CalendarDays aria-hidden="true" />,
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
