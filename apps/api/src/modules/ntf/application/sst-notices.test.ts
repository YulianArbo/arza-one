import { expect, it } from 'vitest';

import type { OutboxEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { Handler } from './notice-types.js';
import { SST_HANDLERS } from './sst-notices.js';

// Avisos de SST (B37): cada evento lleva sus destinatarios; quien lo causó no recibe su propio
// aviso y ningún aviso lleva datos de salud ni el contenido de una queja.

const ACTOR = '01900000-0000-7000-8000-000000000001';
const SST = '01900000-0000-7000-8000-000000000002';
const tx = {} as TenantTransaction;

function event(eventType: string, payload: object, actorId: string | null = ACTOR): OutboxEvent {
  return { eventType, actorId, payload } as unknown as OutboxEvent;
}

function handlerOf(type: string): Handler {
  const handler = SST_HANDLERS[type];
  if (handler === undefined) throw new Error(`Falta el manejador de ${type}`);
  return handler;
}

it('el reporte llega a SST con el tipo y el lugar, no a quien reportó', async () => {
  const notices = await handlerOf('sst.report.received')(
    tx,
    event('sst.report.received', {
      kind: 'unsafe_condition',
      location: 'Pasillo 3',
      recipients: [SST, ACTOR],
    }),
    new Date(),
  );
  expect(notices).toEqual([
    {
      userId: SST,
      kind: 'sst_report_received',
      values: { reporte: 'condición insegura', lugar: 'Pasillo 3' },
      link: '/app/talento-y-sst/sst',
    },
  ]);
});

it('el plazo de la ARL y la evaluación por vencer muestran la fecha en dd/mm/aaaa', async () => {
  const arl = await handlerOf('sst.arl.due')(
    tx,
    event('sst.arl.due', { code: 'SST-2026-0001', due_on: '2026-11-20', recipients: [SST] }, null),
    new Date(),
  );
  expect(arl[0]).toMatchObject({ values: { codigo: 'SST-2026-0001', fecha: '20/11/2026' } });
  const exam = await handlerOf('sst.exam.due')(
    tx,
    event('sst.exam.due', { due_on: '2026-12-01', recipients: [SST] }, null),
    new Date(),
  );
  expect(exam[0]).toMatchObject({ kind: 'sst_exam_due', values: { fecha: '01/12/2026' } });
});

it('la tarea lleva a Mi espacio salvo que el evento diga otra ruta', async () => {
  const task = handlerOf('sst.task.assigned');
  const mine = await task(
    tx,
    event('sst.task.assigned', {
      task: 'Confirmar recibo',
      due_on: '2026-11-25',
      recipients: [SST],
    }),
    new Date(),
  );
  expect(mine[0]?.link).toBe('/app/mi-espacio');
  const plan = await task(
    tx,
    event('sst.task.assigned', {
      task: 'Simulacro',
      due_on: '2026-11-25',
      recipients: [SST],
      link: '/app/talento-y-sst/sst/plan',
    }),
    new Date(),
  );
  expect(plan[0]?.link).toBe('/app/talento-y-sst/sst/plan');
});

it('la queja avisa al comité solo con su código', async () => {
  const notices = await handlerOf('sst.complaint.received')(
    tx,
    event('sst.complaint.received', { code: 'CCL-2026-0001', recipients: [SST] }),
    new Date(),
  );
  expect(notices).toEqual([
    {
      userId: SST,
      kind: 'sst_complaint_received',
      values: { codigo: 'CCL-2026-0001' },
      link: '/app/talento-y-sst/sst/comites',
    },
  ]);
});

it('sin destinatarios no hay avisos', async () => {
  const notices = await handlerOf('sst.complaint.received')(
    tx,
    event('sst.complaint.received', { code: 'CCL-2026-0002' }),
    new Date(),
  );
  expect(notices).toEqual([]);
});
