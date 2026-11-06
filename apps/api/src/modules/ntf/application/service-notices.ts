import { z } from 'zod';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { processOwnerPositionId } from '../../core/index.js';
import { activeUsersInPosition, activeUsersWithRoles } from '../../iam/index.js';
import type { Handler, Notice } from './notice-types.js';

// Avisos de la mesa de ayuda (B28). Quien recibe un tiquete asignado o escalado se entera; el
// responsable y el líder de Servicio al cliente reciben la alerta del 80 % del plazo y la del plazo
// vencido (ficha 17.9; decisión 4: el líder es quien ocupa el cargo dueño del proceso SAC o, si no
// hay, Servicio al cliente). Un tiquete crítico avisa de inmediato al Líder técnico, al líder de
// Servicio y a la Dirección (PT-TEC-003, decisión 5). Quien pidió el tiquete sabe que se resolvió;
// quien decide compensaciones, que hay una por decidir; quien la propuso, cómo se decidió. Nadie
// recibe aviso de lo que hizo él mismo.

const ticketSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  priority: z.string(),
  assignee_id: z.uuid().nullable(),
  requester_id: z.uuid().nullable(),
});

const compensationSchema = z.object({
  ticket_id: z.uuid(),
  code: z.string(),
  proposed_by: z.uuid(),
});

type Kind = 'svc_ticket_update' | 'svc_ticket_alert';

function notice(userId: string, kind: Kind, code: string, novedad: string, id: string): Notice {
  return { userId, kind, values: { tiquete: code, novedad }, link: `/app/servicio/tiquetes/${id}` };
}

function others(users: readonly (string | null)[], actorId: string | null): string[] {
  const present = users.filter((id): id is string => id !== null && id !== actorId);
  return [...new Set(present)];
}

/** El líder de Servicio al cliente (decisión 4). */
async function serviceLeaders(tx: TenantTransaction, now: Date): Promise<string[]> {
  const position = await processOwnerPositionId(tx, 'SAC');
  const holders = position === null ? [] : await activeUsersInPosition(tx, position);
  return holders.length > 0 ? holders : activeUsersWithRoles(tx, ['SERVICIO'], now);
}

const ALERTS: Readonly<Record<string, string>> = {
  'service.ticket.warned': 'consumió el 80 % de su plazo de solución',
  'service.ticket.breached': 'venció su plazo de solución',
};

const onClockAlert: Handler = async (tx, event, now) => {
  const ticket = ticketSchema.parse(event.payload);
  const text = ALERTS[event.eventType] ?? 'necesita atención';
  const users = others([ticket.assignee_id, ...(await serviceLeaders(tx, now))], event.actorId);
  return users.map((userId) => notice(userId, 'svc_ticket_alert', ticket.code, text, ticket.id));
};

/** PT-TEC-003: el tiquete crítico avisa de inmediato. */
const onCreated: Handler = async (tx, event, now) => {
  const ticket = ticketSchema.parse(event.payload);
  if (ticket.priority !== 'critical') return [];
  const leaders = await serviceLeaders(tx, now);
  const protocol = await activeUsersWithRoles(tx, ['LIDER_TECNICO', 'DIRECCION'], now);
  const text = 'se registró un tiquete crítico; active el protocolo de soporte crítico PT-TEC-003';
  return others([...leaders, ...protocol], event.actorId).map((userId) =>
    notice(userId, 'svc_ticket_alert', ticket.code, text, ticket.id),
  );
};

const ASSIGNEE_UPDATES: Readonly<Record<string, string>> = {
  'service.ticket.assigned': 'se lo asignaron a usted',
  'service.ticket.escalated': 'se lo escalaron a usted; revise el motivo en la conversación',
  'service.ticket.reopened': 'lo reabrieron; revise el motivo en la conversación',
};

const onAssigneeUpdate: Handler = (_tx, event) => {
  const ticket = ticketSchema.parse(event.payload);
  const text = ASSIGNEE_UPDATES[event.eventType] ?? 'tiene una novedad';
  return Promise.resolve(
    others([ticket.assignee_id], event.actorId).map((userId) =>
      notice(userId, 'svc_ticket_update', ticket.code, text, ticket.id),
    ),
  );
};

const onResolved: Handler = (_tx, event) => {
  const ticket = ticketSchema.parse(event.payload);
  const text = 'lo resolvieron; si la solución no le sirve, puede reabrirlo';
  return Promise.resolve(
    others([ticket.requester_id], event.actorId).map((userId) =>
      notice(userId, 'svc_ticket_update', ticket.code, text, ticket.id),
    ),
  );
};

const onCompensationProposed: Handler = async (tx, event, now) => {
  const payload = compensationSchema.parse(event.payload);
  const deciders = await activeUsersWithRoles(tx, ['SERVICIO'], now);
  const text = 'hay una compensación al cliente por aprobar o rechazar';
  return others(deciders, payload.proposed_by).map((userId) =>
    notice(userId, 'svc_ticket_update', payload.code, text, payload.ticket_id),
  );
};

const DECISIONS: Readonly<Record<string, string>> = {
  'service.compensation.approved': 'aprobaron la compensación que usted propuso',
  'service.compensation.rejected': 'rechazaron la compensación que usted propuso',
};

const onCompensationDecided: Handler = (_tx, event) => {
  const payload = compensationSchema.parse(event.payload);
  const text = DECISIONS[event.eventType] ?? 'decidieron una compensación';
  return Promise.resolve(
    others([payload.proposed_by], event.actorId).map((userId) =>
      notice(userId, 'svc_ticket_update', payload.code, text, payload.ticket_id),
    ),
  );
};

export const SERVICE_HANDLERS: Readonly<Record<string, Handler>> = {
  'service.ticket.created': onCreated,
  ...Object.fromEntries(Object.keys(ALERTS).map((type) => [type, onClockAlert])),
  ...Object.fromEntries(Object.keys(ASSIGNEE_UPDATES).map((type) => [type, onAssigneeUpdate])),
  'service.ticket.resolved': onResolved,
  'service.compensation.proposed': onCompensationProposed,
  ...Object.fromEntries(Object.keys(DECISIONS).map((type) => [type, onCompensationDecided])),
};
