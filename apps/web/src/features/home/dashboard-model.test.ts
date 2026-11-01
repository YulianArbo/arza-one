import { funnelRowSchema, funnelStageSchema, taskSummarySchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { taskSummary } from '../../test-support/wf-fixtures';
import {
  dueToday,
  monthlyOpportunities,
  openStages,
  periodStart,
  tasksByWorkflow,
} from './dashboard-model';

function row(created_on: string, status: 'open' | 'won' | 'lost', closed_on: string | null) {
  return funnelRowSchema.parse({
    code: 'OPO-2026-0001',
    created_on,
    client: 'Cliente de prueba S.A.S.',
    title: 'Portal',
    stage: status === 'open' ? 'proposal' : status,
    estimated_value: '1000000.00',
    probability: 50,
    weighted_value: '500000.00',
    expected_close: '2026-12-15',
    owner: null,
    status,
    lost_reason: null,
    closed_on,
  });
}

function task(workflow_name: string, due_at: string | null) {
  const base = taskSummarySchema.parse(taskSummary({ due_at }));
  return { ...base, instance: { ...base.instance, workflow_name } };
}

describe('tablero de Inicio: oportunidades por mes (B22A)', () => {
  it('cuenta nuevas por creación y ganadas por cierre, incluso de un año a otro', () => {
    const rows = [
      row('2025-12-03', 'won', '2026-02-10'),
      row('2026-02-01', 'open', null),
      row('2026-02-20', 'lost', '2026-03-01'),
      row('2025-01-01', 'open', null),
    ];
    const result = monthlyOpportunities(rows, '2026-03-15', 4);
    expect(result.labels).toEqual(['Dic', 'Ene', 'Feb', 'Mar']);
    expect(result.series[0]?.values).toEqual([1, 0, 2, 0]);
    expect(result.series[1]?.values).toEqual([0, 0, 1, 0]);
    expect(periodStart('2026-03-15', 4)).toBe('2025-12-01');
  });
});

describe('tablero de Inicio: embudo y tareas (B22A)', () => {
  it('deja solo las etapas abiertas con su valor en pesos', () => {
    const stage = (key: string, value: string) =>
      funnelStageSchema.parse({ stage: key, label: key, count: 1, value, weighted_value: '0.00' });
    const steps = openStages([
      stage('proposal', '25000000.00'),
      stage('won', '1.00'),
      stage('lost', '1.00'),
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.value).toBe(25_000_000);
    expect(steps[0]?.display).toMatch(/^\$\s?25\.000\.000/);
  });

  it('agrupa las tareas por flujo de mayor a menor', () => {
    const tasks = [task('Compras', null), task('Viajes', null), task('Compras', null)];
    expect(tasksByWorkflow(tasks)).toEqual([
      { label: 'Compras', value: 2 },
      { label: 'Viajes', value: 1 },
    ]);
  });

  it('cuenta las que vencen hoy en hora de Colombia', () => {
    // 23/10 a las 8 p. m. en Bogotá ya es 24/10 en UTC: sigue siendo «hoy» el 23/10.
    const now = new Date('2026-10-23T15:00:00.000Z');
    const tasks = [
      task('Compras', '2026-10-24T01:00:00.000Z'),
      task('Compras', '2026-10-24T06:00:00.000Z'),
      task('Compras', null),
    ];
    expect(dueToday(tasks, now)).toBe(1);
  });
});
