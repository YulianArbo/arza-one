'use client';

import { Card, CardDescription, CardHeader, CardTitle, EmptyState } from '@arza/ui';
import { Construction } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { RequirePermission, usePermissions } from '../session/permissions';

// Portada de Finanzas. En B23 solo están los parámetros tributarios, que usan las cotizaciones;
// facturación, cartera y presupuesto llegan en B31 y B32 («Disponible pronto», B22A).

export function FinanceHome(): JSX.Element {
  const { can } = usePermissions();
  return (
    <RequirePermission
      anyOf={['finance.invoice.read', 'finance.budget.read', 'finance.tax_parameter.manage']}
    >
      <div className="flex flex-col gap-4">
        <PageHeader title="Finanzas" />
        {can('finance.tax_parameter.manage') ? (
          <Link
            href="/app/finanzas/parametros-tributarios"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Card className="h-full hover-invert">
              <CardHeader>
                <CardTitle className="text-base">Parámetros tributarios</CardTitle>
                <CardDescription>
                  Tarifas de impuestos vigentes, con su fundamento legal y su historial.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ) : null}
        <EmptyState
          icon={<Construction />}
          title="Disponible pronto"
          description="Facturación, cartera y presupuesto se construyen en los bloques B31 y B32."
        />
      </div>
    </RequirePermission>
  );
}
