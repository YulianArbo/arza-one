import type { FunnelReport, TaskListResponse } from '@arza/contracts';
import type { BarItem, FunnelStep, LineSeries } from '@arza/ui';

import { bogotaToday, formatPesos } from '../crm/labels';

// Cálculos del tablero de Inicio (B22A) a partir de las respuestas que ya da la API.

type Task = TaskListResponse['data'][number];
type FunnelRow = FunnelReport['rows'][number];

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CLOSED_STAGES = new Set(['won', 'lost']);

/** Los últimos meses hasta el de hoy, como «AAAA-MM». */
function lastMonths(today: string, count: number): readonly string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

/** Primer día del periodo de los últimos meses, para pedir el embudo. */
export function periodStart(today: string, count: number): string {
  return `${lastMonths(today, count)[0] ?? today.slice(0, 7)}-01`;
}

function countByMonth(dates: readonly string[], months: readonly string[]): number[] {
  return months.map((month) => dates.filter((date) => date.startsWith(month)).length);
}

export interface MonthlySeries {
  readonly labels: readonly string[];
  readonly series: readonly LineSeries[];
}

/**
 * Oportunidades creadas y ganadas por mes. El informe trae las creadas en el periodo, así que las
 * ganadas son las de ese grupo, por el mes en que se cerraron.
 */
export function monthlyOpportunities(
  rows: readonly FunnelRow[],
  today: string,
  count: number,
): MonthlySeries {
  const months = lastMonths(today, count);
  const created = rows.map((row) => row.created_on);
  const won = rows.flatMap((row) => (row.status === 'won' && row.closed_on ? [row.closed_on] : []));
  return {
    labels: months.map((month) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month),
    series: [
      { key: 'nuevas', label: 'Nuevas', values: countByMonth(created, months), tone: 'action' },
      { key: 'ganadas', label: 'Ganadas', values: countByMonth(won, months), tone: 'success' },
    ],
  };
}

/** Etapas abiertas del embudo con su valor en pesos. */
export function openStages(stages: FunnelReport['stages']): readonly FunnelStep[] {
  return stages
    .filter((stage) => !CLOSED_STAGES.has(stage.stage))
    .map((stage) => ({
      label: stage.label,
      value: Number(stage.value),
      display: formatPesos(stage.value),
    }));
}

/** Tareas abiertas por flujo, de la que más tiene a la que menos (máximo cinco). */
export function tasksByWorkflow(tasks: readonly Task[]): readonly BarItem[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const name = task.instance.workflow_name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));
}

/** Cuántas tareas vencen hoy, en hora de Colombia. */
export function dueToday(tasks: readonly Task[], now: Date): number {
  const today = bogotaToday(now);
  return tasks.filter(
    (task) => task.due_at !== null && bogotaToday(new Date(task.due_at)) === today,
  ).length;
}
