'use client';

import {
  STANDARD_RATINGS,
  sstIncidentListResponseSchema,
  standardsScoreSchema,
  workPlanResponseSchema,
} from '@arza/contracts';
import { PageHeader, QuickLinks, StatCard } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { currentYear } from './sst-options';
import { useSstQuery } from './sst-queries';
import { points } from './sst-standards';

// Portada de Seguridad y salud en el trabajo (B37): lo abierto, el cumplimiento del plan y el
// puntaje de estándares mínimos, con acceso a cada parte del SG-SST.

export const SST_LINKS = [
  { href: '/app/talento-y-sst/sst/incidentes', label: 'Incidentes y reportes' },
  { href: '/app/talento-y-sst/sst/peligros', label: 'Matriz de peligros' },
  { href: '/app/talento-y-sst/sst/plan', label: 'Plan anual de trabajo' },
  { href: '/app/talento-y-sst/sst/inspecciones', label: 'Inspecciones' },
  { href: '/app/talento-y-sst/sst/salud', label: 'Salud y protección' },
  { href: '/app/talento-y-sst/sst/comites', label: 'Comités' },
  { href: '/app/talento-y-sst/sst/estandares', label: 'Estándares mínimos' },
] as const;

function useIndicators(year: number) {
  const incidents = useSstQuery('/v1/sst/incidents', sstIncidentListResponseSchema);
  const plan = useSstQuery(`/v1/sst/work-plan?year=${String(year)}`, workPlanResponseSchema);
  const scorePath = `/v1/sst/standards-assessments/${String(year)}/score`;
  const score = useSstQuery(scorePath, standardsScoreSchema);
  const open = incidents.data?.data.filter((item) => item.status !== 'closed') ?? [];
  const pendingArl = open.filter((i) => i.kind === 'accident' && i.arl_reported_on === null);
  return { incidents, plan, score, open, pendingArl };
}

function Indicators(): JSX.Element {
  const year = currentYear();
  const { incidents, plan, score, open, pendingArl } = useIndicators(year);
  const wait = (ready: boolean, value: string) => (ready ? value : '…');
  const overdue = pendingArl.some((item) => item.arl_overdue);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Incidentes abiertos"
        value={wait(incidents.isSuccess, String(open.length))}
      />
      <StatCard
        label="Accidentes por reportar a la ARL"
        value={wait(incidents.isSuccess, String(pendingArl.length))}
        note={overdue ? 'Hay plazos vencidos' : 'Plazo: 2 días hábiles'}
      />
      <StatCard
        label={`Plan ${String(year)} a la fecha`}
        value={wait(plan.isSuccess, `${String(plan.data?.compliance.to_date_percent ?? 0)} %`)}
        note={`Del año: ${String(plan.data?.compliance.year_percent ?? 0)} %`}
      />
      <StatCard
        label="Estándares mínimos"
        value={wait(score.isSuccess, points(score.data?.score ?? 0))}
        note={score.data === undefined ? undefined : STANDARD_RATINGS[score.data.rating]}
      />
    </div>
  );
}

export function SstHome(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Seguridad y salud en el trabajo"
        description="Ejecute y evidencie el SG-SST. Nunca se registran diagnósticos."
      />
      <Indicators />
      <QuickLinks title="Partes del SG-SST" links={SST_LINKS} linkAs={Link} />
    </div>
  );
}
