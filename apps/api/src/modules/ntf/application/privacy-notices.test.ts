import { expect, it, vi } from 'vitest';

import type { OutboxEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { Handler } from './notice-types.js';
import { PRIVACY_HANDLERS } from './privacy-notices.js';

// Avisos de Privacidad (B42, decisión 11): llegan a los Oficiales de Protección de Datos, sin datos
// del titular (solo el código y la fecha límite), y nadie recibe el aviso de lo que hizo.

const ACTOR = '01900000-0000-7000-8000-000000000001';
const OFFICER = '01900000-0000-7000-8000-000000000002';
const REQUEST = '01900000-0000-7000-8000-000000000003';

vi.mock('../../iam/index.js', () => ({
  activeUsersWithRoles: () => Promise.resolve([OFFICER, ACTOR]),
}));

const tx = {} as TenantTransaction;

function event(eventType: string): OutboxEvent {
  const payload = { id: REQUEST, code: 'PRV-2026-0001', due_on: '2026-12-07' };
  return { eventType, actorId: ACTOR, payload } as unknown as OutboxEvent;
}

function handlerOf(type: string): Handler {
  const handler = PRIVACY_HANDLERS[type];
  if (handler === undefined) throw new Error(`Falta el manejador de ${type}`);
  return handler;
}

it('la solicitud nueva llega al Oficial con el código y la fecha límite', async () => {
  const notices = await handlerOf('privacy.request.received')(
    tx,
    event('privacy.request.received'),
    new Date(),
  );
  expect(notices).toEqual([
    {
      userId: OFFICER,
      kind: 'prv_request_received',
      values: { codigo: 'PRV-2026-0001', fecha: '07/12/2026' },
      link: `/app/privacidad/solicitudes/${REQUEST}`,
    },
  ]);
});

it('los vencimientos dicen qué pasa con el plazo', async () => {
  for (const [type, kind] of [
    ['privacy.request.warned', 'prv_request_due'],
    ['privacy.request.due', 'prv_request_due'],
    ['privacy.incident.warned', 'prv_incident_due'],
    ['privacy.incident.due', 'prv_incident_due'],
  ] as const) {
    const [notice] = await handlerOf(type)(tx, event(type), new Date());
    expect(notice?.kind).toBe(kind);
    expect(notice?.values['novedad']).toBeTruthy();
  }
});
