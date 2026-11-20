'use client';

import { AttentionList, buttonVariants, EmptyState, HighlightCard, QuickLinks } from '@arza/ui';
import { Construction, FileText, Receipt } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { visibleSubmodules } from '../../components/app-shell/submodules';
import { RequirePermission, usePermissions } from '../session/permissions';
import { BudgetExecutionCard } from './budget-execution-card';

// Portada de Finanzas (B22B, boceto 11). B23 dejó los parámetros tributarios, B31 la facturación y
// los recaudos y B32 el presupuesto, los gastos, la caja menor, la conciliación, la certificación
// de costos y el cierre con exportación contable. La cartera avanzada sigue pendiente de reglas
// («Disponible pronto», B22A).

const INVOICES_PATH = '/app/finanzas/facturas';

// Operaciones de cierre: lo que se revisa al terminar el mes.
const CLOSING = [
  {
    href: '/app/finanzas/conciliaciones',
    title: 'Conciliación bancaria',
    description: 'Compare los movimientos con el extracto.',
  },
  {
    href: '/app/finanzas/certificaciones',
    title: 'Certificación de costos',
    description: 'Horas aprobadas y valor de los proyectos de desarrollo.',
  },
  {
    href: '/app/finanzas/cierre',
    title: 'Cierre y exportación contable',
    description: 'Cierre de meses y archivo para el Contador.',
  },
] as const;

const OTHERS = new Set([
  '/app/finanzas/presupuesto',
  '/app/finanzas/gastos',
  '/app/finanzas/caja-menor',
  '/app/finanzas/parametros-tributarios',
]);

function ClosingCard({ allowed }: { readonly allowed: ReadonlySet<string> }): JSX.Element | null {
  const items = CLOSING.filter((entry) => allowed.has(entry.href));
  if (items.length === 0) return null;
  return (
    <HighlightCard title="Operaciones de cierre">
      <AttentionList
        linkAs={Link}
        items={items.map((entry) => ({
          id: entry.href,
          title: entry.title,
          meta: entry.description,
          href: entry.href,
          icon: <FileText />,
        }))}
      />
    </HighlightCard>
  );
}

function InvoicesAction(): JSX.Element {
  return (
    <Link href={INVOICES_PATH} className={buttonVariants({ variant: 'outline' })}>
      <Receipt aria-hidden="true" />
      Facturas y recaudos
    </Link>
  );
}

export function FinanceHome(): JSX.Element {
  const { can, granted } = usePermissions();
  const submodules = visibleSubmodules('finanzas', granted);
  const allowed = new Set(submodules.map((entry) => entry.href));
  const others = submodules
    .filter((entry) => OTHERS.has(entry.href))
    .map((entry) => ({ href: entry.href, label: entry.label, icon: <entry.icon /> }));
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
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Finanzas"
          description="Compare la ejecución del presupuesto y abra el proceso que necesita revisar."
          action={allowed.has(INVOICES_PATH) ? <InvoicesAction /> : null}
        />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          {can('finance.budget.read') ? <BudgetExecutionCard /> : null}
          <ClosingCard allowed={allowed} />
        </div>
        {others.length > 0 ? (
          <QuickLinks title="También en Finanzas" links={others} linkAs={Link} />
        ) : null}
        <EmptyState
          icon={<Construction />}
          title="Cartera por edades: disponible pronto"
          description="La cartera por edades, el deterioro y la programación de cobros requieren reglas aprobadas."
        />
      </div>
    </RequirePermission>
  );
}
