'use client';

import { Card, CardDescription, CardHeader, CardTitle, EmptyState } from '@arza/ui';
import { Construction } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { RequirePermission, usePermissions } from '../session/permissions';

// Portada de Finanzas. B23 dejó los parámetros tributarios y B31 la facturación y los recaudos;
// la cartera avanzada y el presupuesto llegan en B32 («Disponible pronto», B22A).

export function FinanceHome(): JSX.Element {
  const { can } = usePermissions();
  return (
    <RequirePermission
      anyOf={['finance.invoice.read', 'finance.budget.read', 'finance.tax_parameter.manage']}
    >
      <div className="flex flex-col gap-4">
        <PageHeader title="Finanzas" />
        {can('finance.tax_parameter.manage') ? (
          <FinanceLink
            href="/app/finanzas/parametros-tributarios"
            title="Parámetros tributarios"
            description="Tarifas de impuestos vigentes, con su fundamento legal y su historial."
          />
        ) : null}
        {can('finance.invoice.read') ? (
          <FinanceLink
            href="/app/finanzas/facturas"
            title="Facturas y recaudos"
            description="Solicitudes, documentos fiscales emitidos, notas crédito y pagos recibidos."
          />
        ) : null}
        <EmptyState
          icon={<Construction />}
          title="Cartera avanzada pendiente de definición"
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
