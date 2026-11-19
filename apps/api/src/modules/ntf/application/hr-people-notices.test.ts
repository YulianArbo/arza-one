import { describe, expect, it } from 'vitest';

import type { OutboxEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { HR_PEOPLE_HANDLERS } from './hr-people-notices.js';

const ACTOR = '01900000-0000-7000-8000-000000000001';
const BOSS = '01900000-0000-7000-8000-000000000002';
const WORKER = '01900000-0000-7000-8000-000000000003';
const tx = {} as TenantTransaction;

function event(eventType: string, payload: object): OutboxEvent {
  return { eventType, actorId: ACTOR, payload } as unknown as OutboxEvent;
}

async function run(eventType: string, payload: object) {
  const handler = HR_PEOPLE_HANDLERS[eventType];
  if (handler === undefined) throw new Error(`Falta el manejador de ${eventType}`);
  return handler(tx, event(eventType, payload), new Date());
}

describe('avisos de ausencias y horas extras (B36)', () => {
  it('al jefe le llega la solicitud con enlace a «Mi equipo»', async () => {
    const notices = await run('hr.leave.requested', {
      leave_id: WORKER,
      decision: 'requested',
      recipients: [BOSS],
    });
    expect(notices).toEqual([
      {
        userId: BOSS,
        kind: 'hr_leave_update',
        values: { novedad: 'Un colaborador de su equipo solicitó una ausencia que debe decidir' },
        link: '/app/mi-espacio/equipo',
      },
    ]);
  });

  it('al colaborador le llega la decisión; quien decide no se avisa a sí mismo', async () => {
    const notices = await run('hr.overtime.decided', {
      overtime_id: WORKER,
      decision: 'authorized',
      recipients: [WORKER, ACTOR],
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]?.values).toEqual({ novedad: 'Sus horas extras fueron autorizadas' });
    expect(await run('hr.leave.decided', { decision: 'otra', recipients: [WORKER] })).toEqual([]);
  });
});

describe('avisos de desempeño, citación y retiro', () => {
  it('la evaluación lista y la citación, sin contenido del caso', async () => {
    expect((await run('hr.review.scored', { recipients: [WORKER] }))[0]?.kind).toBe(
      'hr_review_update',
    );
    const cited = await run('hr.disciplinary.cited', {
      case_id: WORKER,
      hearing_on: '2026-12-10',
      recipients: [WORKER],
    });
    expect(cited).toEqual([
      {
        userId: WORKER,
        kind: 'hr_disciplinary_notice',
        values: { fecha: '10/12/2026' },
        link: '/app/mi-espacio',
      },
    ]);
  });

  it('cada responsable del retiro recibe su tarea, salvo quien lo registró', async () => {
    const notices = await run('hr.offboarding.started', {
      offboarding_id: WORKER,
      last_day: '2026-12-15',
      tasks: [
        { item: 'assets_return', responsible_id: BOSS },
        { item: 'settlement', responsible_id: ACTOR },
        { item: 'exit_exam', responsible_id: null },
      ],
    });
    expect(notices).toEqual([
      {
        userId: BOSS,
        kind: 'hr_offboarding_task',
        values: { tarea: 'Devolución de equipos y activos', fecha: '15/12/2026' },
        link: '/app/mi-espacio',
      },
    ]);
  });
});
