import { z } from 'zod';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { processOwnerPositionId } from '../../core/index.js';
import { activeUsersInPosition, activeUsersWithRoles } from '../../iam/index.js';
import type { Handler, Notice } from './notice-types.js';

// Avisos de Servicio al cliente. Mesa de ayuda (B28): quien recibe un tiquete asignado o escalado se
// entera; el responsable y el líder de Servicio al cliente reciben la alerta del 80 % del plazo y la del plazo
// vencido (ficha 17.9; decisión 4: el líder es quien ocupa el cargo dueño del proceso SAC o, si no
// hay, Servicio al cliente). Un tiquete crítico avisa de inmediato al Líder técnico, al líder de
// Servicio y a la Dirección (PT-TEC-003, decisión 5). Quien pidió el tiquete sabe que se resolvió;
// quien decide compensaciones, que hay una por decidir; quien la propuso, cómo se decidió. Nadie
// recibe aviso de lo que hizo él mismo. PQRSF (B29): Servicio sabe que llegó una; quien la tramita,
// que se la asignaron; quien aprueba, que hay una respuesta por aprobar; quien redactó, que se la
// devolvieron o se aprobó; el Oficial de datos y Calidad, los traslados (decisiones 5 y 6); y quien
// la tramita y el líder, que está por vencer o venció (decisión 11).

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

// PQRSF (B29) -----------------------------------------------------------------------------------

const pqrsfSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  assignee_id: z.uuid().nullable(),
  drafted_by: z.uuid().nullable(),
});

function pqrsfNotice(userId: string, code: string, novedad: string, id: string): Notice {
  return {
    userId,
    kind: 'svc_pqrsf_update',
    values: { pqrsf: code, novedad },
    link: `/app/servicio/pqrsf/${id}`,
  };
}

type Recipients = (
  tx: TenantTransaction,
  pqrsf: z.infer<typeof pqrsfSchema>,
  now: Date,
) => Promise<(string | null)[]>;

/** Un aviso de PQRSF: a quiénes y con qué texto; nadie recibe aviso de lo que hizo él mismo. */
function pqrsfHandler(text: string, recipients: Recipients): Handler {
  return async (tx, event, now) => {
    const pqrsf = pqrsfSchema.parse(event.payload);
    const users = others(await recipients(tx, pqrsf, now), event.actorId);
    return users.map((userId) => pqrsfNotice(userId, pqrsf.code, text, pqrsf.id));
  };
}

const toAssignee: Recipients = (_tx, pqrsf) => Promise.resolve([pqrsf.assignee_id]);
const toDrafter: Recipients = (_tx, pqrsf) => Promise.resolve([pqrsf.drafted_by]);
const toRoles =
  (roles: readonly string[]): Recipients =>
  async (tx, _pqrsf, now) =>
    activeUsersWithRoles(tx, roles, now);

/** Aprueba cualquier persona de Servicio al cliente distinta de quien la redactó (decisión 7). */
const toApprovers: Recipients = async (tx, pqrsf, now) =>
  (await activeUsersWithRoles(tx, ['SERVICIO'], now)).filter((id) => id !== pqrsf.drafted_by);

const toAssigneeAndLeaders: Recipients = async (tx, pqrsf, now) => [
  pqrsf.assignee_id,
  ...(await serviceLeaders(tx, now)),
];

const PQRSF_HANDLERS: Readonly<Record<string, Handler>> = {
  'service.pqrsf.filed': pqrsfHandler(
    'se radicó una PQRSF nueva; clasifíquela y asígnela',
    async (tx, _pqrsf, now) => serviceLeaders(tx, now),
  ),
  'service.pqrsf.classified': pqrsfHandler('se la asignaron a usted para tramitarla', toAssignee),
  'service.pqrsf.assigned': pqrsfHandler('se la asignaron a usted para tramitarla', toAssignee),
  'service.pqrsf.submitted': pqrsfHandler('hay una respuesta por aprobar o devolver', toApprovers),
  'service.pqrsf.returned': pqrsfHandler(
    'le devolvieron la respuesta; revise qué hay que corregir',
    toDrafter,
  ),
  'service.pqrsf.responded': pqrsfHandler(
    'aprobaron la respuesta y se envía a quien la presentó',
    async (_tx, pqrsf) => Promise.resolve([pqrsf.drafted_by, pqrsf.assignee_id]),
  ),
  'service.pqrsf.transferred': pqrsfHandler(
    'trata de datos personales: se trasladó a Privacidad y sigue los plazos de la Ley 1581',
    toRoles(['OFICIAL_DATOS']),
  ),
  // La queja o el reclamo procedente abre su no conformidad (B38): avisa Calidad, no Servicio.
  'service.pqrsf.warned': pqrsfHandler(
    'le quedan dos días hábiles para responder',
    toAssigneeAndLeaders,
  ),
  'service.pqrsf.breached': pqrsfHandler('venció su plazo de respuesta', toAssigneeAndLeaders),
};

export const SERVICE_HANDLERS: Readonly<Record<string, Handler>> = {
  ...PQRSF_HANDLERS,
  'service.ticket.created': onCreated,
  ...Object.fromEntries(Object.keys(ALERTS).map((type) => [type, onClockAlert])),
  ...Object.fromEntries(Object.keys(ASSIGNEE_UPDATES).map((type) => [type, onAssigneeUpdate])),
  'service.ticket.resolved': onResolved,
  'service.compensation.proposed': onCompensationProposed,
  ...Object.fromEntries(Object.keys(DECISIONS).map((type) => [type, onCompensationDecided])),
};
