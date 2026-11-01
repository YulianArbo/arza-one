'use client';

import type { FunnelReport } from '@arza/contracts';
import { EmptyState, FunnelBars, LineChart, StatCard } from '@arza/ui';
import { BriefcaseBusiness } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { bogotaToday, CRM_PATHS, formatPercent, formatPesos } from '../crm/labels';
import { useFunnel } from '../crm/queries';
import { monthlyOpportunities, openStages, periodStart } from './dashboard-model';
import { Panel } from './panel';

// Comercial en el tablero de Inicio (16.3): solo para quien puede ver el informe del embudo.

const MONTHS = 6;

function CrmStats({ totals }: { readonly totals: FunnelReport['totals'] }): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        label="Embudo abierto"
        value={formatPesos(totals.open_value)}
        note={`${String(totals.open_count)} oportunidades abiertas`}
      />
      <StatCard label="Valor ponderado" value={formatPesos(totals.weighted_value)} />
      <StatCard
        label="Tasa de cierre"
        value={formatPercent(totals.win_rate)}
        note={`${String(totals.won_count)} ganadas · ${String(totals.lost_count)} perdidas`}
        tone="success"
      />
    </div>
  );
}

function CrmPanels({
  report,
  today,
}: {
  readonly report: FunnelReport;
  readonly today: string;
}): JSX.Element {
  const monthly = monthlyOpportunities(report.rows, today, MONTHS);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Oportunidades por mes">
        <LineChart title="Oportunidades por mes" labels={monthly.labels} series={monthly.series} />
      </Panel>
      <Panel title="Embudo abierto por etapa">
        <FunnelBars title="Embudo abierto por etapa" steps={openStages(report.stages)} />
        <Link className="text-sm text-primary underline" href={CRM_PATHS.report}>
          Ver el informe del embudo
        </Link>
      </Panel>
    </div>
  );
}

export function CrmOverview(): JSX.Element {
  const today = bogotaToday();
  const query = useFunnel({ from: periodStart(today, MONTHS), to: today });
  return (
    <QueryState query={query} loadingLabel="Cargando el resumen comercial">
      {(report) =>
        report.rows.length === 0 ? (
          <EmptyState
            title="Comercial"
            description="No hay oportunidades creadas en los últimos seis meses."
            icon={<BriefcaseBusiness />}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <CrmStats totals={report.totals} />
            <CrmPanels report={report} today={today} />
          </div>
        )
      }
    </QueryState>
  );
}
