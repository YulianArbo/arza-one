'use client';

import { Card, CardDescription, CardHeader, CardTitle, EmptyState } from '@arza/ui';
import { Construction } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { RequirePermission, usePermissions } from '../session/permissions';

// Portada de Finanzas. B23 dejó los parámetros tributarios, B31 la facturación y los recaudos y
// B32 el presupuesto, los gastos, la caja menor, la conciliación, la certificación de costos y el
// cierre con exportación contable. La cartera avanzada sigue pendiente de reglas («Disponible
// pronto», B22A).

const LINKS = [
  {
    href: '/app/finanzas/parametros-tributarios',
    title: 'Parámetros tributarios',
    description: 'Tarifas de impuestos vigentes, con su fundamento legal y su historial.',
    anyOf: ['finance.tax_parameter.manage'],
  },
  {
    href: '/app/finanzas/facturas',
    title: 'Facturas y recaudos',
    description: 'Solicitudes, documentos fiscales emitidos, notas crédito y pagos recibidos.',
    anyOf: ['finance.invoice.read'],
  },
  {
    href: '/app/finanzas/presupuesto',
    title: 'Presupuesto',
    description: 'Lo planeado por centro de costo y rubro contra lo ejecutado.',
    anyOf: ['finance.budget.read'],
  },
  {
    href: '/app/finanzas/gastos',
    title: 'Gastos',
    description: 'Gastos con soporte y su aprobación.',
    anyOf: ['finance.ledger.read', 'finance.expense.manage'],
  },
  {
    href: '/app/finanzas/caja-menor',
    title: 'Caja menor',
    description: 'Fondo, vales y reembolsos con su saldo.',
    anyOf: ['finance.ledger.read'],
  },
  {
    href: '/app/finanzas/conciliaciones',
    title: 'Conciliación bancaria',
    description: 'Saldo en libros contra el banco, con sus partidas.',
    anyOf: ['finance.ledger.read'],
  },
  {
    href: '/app/finanzas/certificaciones',
    title: 'Certificación de costos',
    description: 'Horas aprobadas y valor de los proyectos de desarrollo.',
    anyOf: ['finance.ledger.read'],
  },
  {
    href: '/app/finanzas/cierre',
    title: 'Cierre y exportación contable',
    description: 'Cierre de meses y archivo para el Contador.',
    anyOf: ['finance.ledger.read'],
  },
] as const;

export function FinanceHome(): JSX.Element {
  const { can } = usePermissions();
  return (
    <RequirePermission
      anyOf={[
        'finance.invoice.read',
        'finance.budget.read',
        'finance.tax_parameter.manage',
        'finance.ledger.read',
        'finance.expense.manage',
      ]}
    >
      <div className="flex flex-col gap-4">
        <PageHeader title="Finanzas" />
        {LINKS.filter((link) => link.anyOf.some((code) => can(code))).map((link) => (
          <FinanceLink
            key={link.href}
            href={link.href}
            title={link.title}
            description={link.description}
          />
        ))}
        <EmptyState
          icon={<Construction />}
          title="Cartera por edades: disponible pronto"
          description="La cartera por edades, el deterioro y la programación de cobros requieren reglas aprobadas."
        />
      </div>
    </RequirePermission>
  );
}

function FinanceLink(props: {
  readonly href: string;
  readonly title: string;
  readonly description: string;
}): JSX.Element {
  return (
    <Link
      href={props.href}
      className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="h-full hover-invert">
        <CardHeader>
          <CardTitle className="text-base">{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
