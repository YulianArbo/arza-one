import { expect, it } from 'vitest';

import type { OutboxEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { Handler } from './notice-types.js';
import { QMS_HANDLERS } from './qms-notices.js';

// Avisos de Calidad (B38): cada evento lleva sus destinatarios; quien lo causó no recibe su propio
// aviso, salvo el escalamiento, que lo causa el sistema.

const ACTOR = '01900000-0000-7000-8000-000000000001';
const QUALITY = '01900000-0000-7000-8000-000000000002';
const tx = {} as TenantTransaction;

function event(eventType: string, payload: object, actorId: string | null = ACTOR): OutboxEvent {
  return { eventType, actorId, payload } as unknown as OutboxEvent;
}

function handlerOf(type: string): Handler {
  const handler = QMS_HANDLERS[type];
  if (handler === undefined) throw new Error(`Falta el manejador de ${type}`);
  return handler;
}

it('la no conformidad llega a Calidad con su código y su origen', async () => {
  const payload = { code: 'NC-2026-0001', source: 'pqrsf', recipients: [QUALITY, ACTOR] };
  const notices = await handlerOf('qms.nonconformity.reported')(
    tx,
    event('qms.nonconformity.reported', payload),
    new Date(),
  );
  expect(notices).toEqual([
    {
      userId: QUALITY,
      kind: 'qms_nonconformity_reported',
      values: { codigo: 'NC-2026-0001', origen: 'queja o reclamo procedente' },
      link: '/app/calidad/no-conformidades',
    },
  ]);
});

it('la acción asignada y la vencida muestran la fecha en dd/mm/aaaa', async () => {
  const payload = { code: 'AC-2026-0003', due_on: '2026-12-05', recipients: [QUALITY, ACTOR] };
  const assigned = await handlerOf('qms.action.assigned')(
    tx,
    event('qms.action.assigned', payload),
    new Date(),
  );
  expect(assigned).toEqual([
    {
      userId: QUALITY,
      kind: 'qms_action_assigned',
      values: { codigo: 'AC-2026-0003', fecha: '05/12/2026' },
      link: '/app/mi-espacio',
    },
  ]);
  const overdue = await handlerOf('qms.action.overdue')(
    tx,
    event('qms.action.overdue', payload, null),
    new Date(),
  );
  expect(overdue.map((notice) => notice.userId)).toEqual([QUALITY, ACTOR]);
  expect(overdue[0]?.values).toEqual({ codigo: 'AC-2026-0003', fecha: '05/12/2026' });
});

it('la acción ejecutada pide la verificación a Calidad', async () => {
  const notices = await handlerOf('qms.action.executed')(
    tx,
    event('qms.action.executed', { code: 'AC-2026-0004', recipients: [QUALITY] }),
    new Date(),
  );
  expect(notices).toEqual([
    {
      userId: QUALITY,
      kind: 'qms_action_to_verify',
      values: { codigo: 'AC-2026-0004' },
      link: '/app/calidad/acciones',
    },
  ]);
});
