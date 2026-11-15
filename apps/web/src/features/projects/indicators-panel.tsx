'use client';

import type { ProjectDetail, ProjectIndicators } from '@arza/contracts';
import { BarChart, StatCard } from '@arza/ui';
import type { JSX } from 'react';

import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { useIndicators } from './queries';
import { hoursText } from './time-panel';

// Indicadores del proyecto (B27, ficha 17.8): avance (ítems terminados sobre planeados), horas
// gastadas frente al presupuesto, desviación frente a las fechas y, para quien ve todos los
// proyectos, la rentabilidad estimada con el costo de la hora. Cada gráfica trae su tabla.

function deviationText(points: number): string {
  if (points === 0) return 'Al día con las fechas';
  return points > 0
    ? `${String(points)} puntos adelantado`
    : `${String(Math.abs(points))} puntos atrasado`;
}

function Money({ money }: { readonly money: ProjectIndicators['money'] }): JSX.Element {
  if (money === null) {
    return (
      <p className="text-sm text-muted-foreground">
        La rentabilidad la ven quienes consultan todos los proyectos, con el costo de la hora
        definido en «Configurar el control».
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label="Ingreso" value={formatPesos(money.income)} />
      <StatCard label="Costo de las horas aprobadas" value={formatPesos(money.cost)} />
      <StatCard
        label="Margen"
        value={formatPesos(money.margin)}
        tone={money.margin.startsWith('-') ? 'destructive' : 'success'}
        note={money.margin_pct === null ? undefined : `${String(money.margin_pct)} % del ingreso`}
      />
    </div>
  );
}

function Stats({ data }: { readonly data: ProjectIndicators }): JSX.Element {
  const { progress, hours, schedule } = data;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Avance"
        value={`${String(progress.percent)} %`}
        note={`${String(progress.done)} de ${String(progress.planned)} ítems terminados`}
      />
      <StatCard
        label="Horas aprobadas"
        value={hoursText(hours.approved)}
        note={`${String(hours.used_pct)} % de ${hoursText(hours.budget)} presupuestadas`}
        tone={hours.used_pct > 100 ? 'destructive' : 'primary'}
      />
      <StatCard
        label="Desviación"
        value={deviationText(schedule.deviation_pts)}
        note={`Ha pasado el ${String(schedule.elapsed_pct)} % del tiempo`}
        tone={schedule.deviation_pts < -10 ? 'warning' : 'success'}
      />
      <StatCard
        label="Entregables aceptados"
        value={`${String(data.deliverables.accepted)} de ${String(data.deliverables.total)}`}
        note={`${String(data.deliverables.waiting)} esperando al cliente`}
      />
    </div>
  );
}

function Indicators({ data }: { readonly data: ProjectIndicators }): JSX.Element {
  const { hours } = data;
  return (
    <div className="flex flex-col gap-4">
      <Stats data={data} />
      <BarChart
        title="Horas del proyecto"
        format={hoursText}
        items={[
          { label: 'Presupuesto', value: hours.budget, tone: 'muted' },
          { label: 'Registradas', value: hours.logged, tone: 'primary' },
          { label: 'Aprobadas', value: hours.approved, tone: 'success' },
          { label: 'Se cobran', value: hours.billable, tone: 'action' },
          { label: 'Por aprobar', value: hours.pending, tone: 'warning' },
        ]}
      />
      <p className="text-sm">
        Riesgos altos abiertos: {String(data.risks_high)} · Incidentes abiertos:{' '}
        {String(data.incidents_open)}
      </p>
      <Money money={data.money} />
    </div>
  );
}

export function IndicatorsPanel({ project }: { readonly project: ProjectDetail }): JSX.Element {
  const indicators = useIndicators(project.id);
  return (
    <QueryState query={indicators} loadingLabel="Cargando los indicadores">
      {(data) => <Indicators data={data} />}
    </QueryState>
  );
}
