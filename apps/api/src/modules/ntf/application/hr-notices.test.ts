import { describe, expect, it } from 'vitest';

import type { OutboxEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { HR_HANDLERS } from './hr-notices.js';

const HR = '01900000-0000-7000-8000-000000000001';
const SST = '01900000-0000-7000-8000-000000000002';
const ASSETS = '01900000-0000-7000-8000-000000000003';

function hired(onboarding: readonly object[]): OutboxEvent {
  return {
    eventType: 'employee.hired',
    actorId: HR,
    payload: { employee_id: '01900000-0000-7000-8000-000000000009', user_id: HR, onboarding },
  } as unknown as OutboxEvent;
}

function task(kind: string, responsible: string | null, n: number) {
  return {
    task_id: `01900000-0000-7000-8000-00000000010${String(n)}`,
    kind,
    responsible_id: responsible,
    due_on: '2026-12-01',
  };
}

const handler = HR_HANDLERS['employee.hired'];
const tx = {} as TenantTransaction;

describe('avisos de la vinculación (B35, decisión 6)', () => {
  it('avisa a cada responsable de su tarea, con la fecha en dd/mm/aaaa', async () => {
    if (handler === undefined) throw new Error('Falta el manejador');
    const notices = await handler(
      tx,
      hired([task('medical_exam', SST, 1), task('equipment', ASSETS, 2), task('induction', HR, 3)]),
      new Date(),
    );
    expect(notices).toEqual([
      {
        userId: SST,
        kind: 'hr_onboarding_task',
        values: { tarea: 'Evaluación médica ocupacional de ingreso', vence: '01/12/2026' },
        link: null,
      },
      {
        userId: ASSETS,
        kind: 'hr_onboarding_task',
        values: { tarea: 'Asignación de equipo y activos', vence: '01/12/2026' },
        link: '/app/compras/activos',
      },
    ]);
  });

  it('no avisa tareas sin responsable ni eventos anteriores sin tareas', async () => {
    if (handler === undefined) throw new Error('Falta el manejador');
    expect(await handler(tx, hired([task('job_training', null, 4)]), new Date())).toEqual([]);
    const old = {
      eventType: 'employee.hired',
      actorId: HR,
      payload: { employee_id: '01900000-0000-7000-8000-000000000009', user_id: HR },
    } as unknown as OutboxEvent;
    expect(await handler(tx, old, new Date())).toEqual([]);
  });
});
