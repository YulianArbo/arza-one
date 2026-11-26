'use client';

import { PageHeader, QuickLinks } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { Board } from './direction-board';
import { ObjectiveAdmin, Scorecard } from './direction-scorecard';

// Dirección (M16, B46): tablero gerencial, cuadro de mando, tablero de cumplimiento y normograma.
// Cada persona ve las partes que su rol le permite.

const LINKS = [
  {
    href: '/app/direccion/tablero-gerencial',
    label: 'Tablero gerencial',
    permission: 'dashboard.executive.read',
  },
  {
    href: '/app/direccion/cuadro-de-mando',
    label: 'Cuadro de mando',
    permission: 'dashboard.process.read',
  },
  {
    href: '/app/direccion/cumplimiento',
    label: 'Tablero de cumplimiento',
    permission: 'dashboard.compliance.read',
  },
  { href: '/app/direccion/normograma', label: 'Normograma', permission: 'qms.read' },
] as const;

export function DirectionHome(): JSX.Element {
  const { canAll } = usePermissions();
  const links = LINKS.filter((link) => canAll(link.permission));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dirección"
        description="Una visión actual de la empresa y de su cumplimiento legal. Toda cifra lleva a los registros que la originan."
      />
      <QuickLinks title="En Dirección" links={links} linkAs={Link} />
    </div>
  );
}

export function ExecutivePage(): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tablero gerencial"
        description="Ventas, cartera, proyectos en riesgo, satisfacción de los clientes y cumplimiento legal."
      />
      <Board board="executive" />
    </div>
  );
}

export function CompliancePage(): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tablero de cumplimiento"
        description="Accesos, funciones en conflicto, tareas vencidas, documentos por revisar y requisitos legales."
      />
      <Board board="compliance" />
    </div>
  );
}

export function ScorecardPage(): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cuadro de mando"
        description="Los objetivos del plan estratégico por perspectiva, con sus indicadores y si cumplen la meta."
      />
      <Scorecard />
      <ObjectiveAdmin />
    </div>
  );
}
