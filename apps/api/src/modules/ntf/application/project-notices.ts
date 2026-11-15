import { z } from 'zod';

import { activeUsersWithRoles } from '../../iam/index.js';
import type { Handler, Notice } from './notice-types.js';

// Avisos de Proyectos (B26): el líder se entera de que tiene un proyecto nuevo a cargo y de lo que
// decidió la Dirección sobre su inicio; quien entra a un equipo, de que ya ve el proyecto. Desde el
// B27, el líder se entera de cómo respondió el cliente cada acta y de los riesgos altos; quien
// registró horas, de que se las devolvieron; Finanzas, del hito listo para facturar; y el Oficial
// de datos, del incidente que comprometió datos personales. Nadie recibe aviso de lo que hizo él
// mismo.

const projectEventSchema = z.object({
  project_id: z.uuid(),
  code: z.string(),
  manager_id: z.uuid(),
});

const memberEventSchema = z.object({
  project_id: z.uuid(),
  code: z.string(),
  user_id: z.uuid(),
});

/** Novedades para el líder del proyecto, por evento. */
const LEADER_UPDATES: Readonly<Record<string, string>> = {
  'project.created': 'usted es el líder de este proyecto nuevo',
  'project.authorization.granted': 'la Dirección autorizó su inicio y ya está en ejecución',
  'project.authorization.denied': 'la Dirección no autorizó su inicio; revise el comentario',
  'project.acceptance.accepted': 'el cliente aceptó y firmó un acta de entrega',
  'project.acceptance.tacit':
    'un acta de entrega quedó aceptada tácitamente, como lo prevé el contrato',
  'project.acceptance.returned': 'el cliente devolvió un entregable; revise su motivo',
  'project.acceptance.unanswered':
    'el cliente no respondió un acta en el plazo; reenvíela o comuníquese con él',
  'project.acceptance.cancelled': 'no se pudo enviar un acta de entrega; entréguela de nuevo',
  'project.risk.high': 'se registró un riesgo alto; decida si el proyecto queda en riesgo',
};

function notice(userId: string, code: string, novedad: string, projectId: string): Notice {
  return {
    userId,
    kind: 'prj_project_update',
    values: { proyecto: code, novedad },
    link: `/app/proyectos/${projectId}`,
  };
}

const onLeaderUpdate: Handler = (_tx, event) => {
  const payload = projectEventSchema.parse(event.payload);
  const text = LEADER_UPDATES[event.eventType];
  if (text === undefined || payload.manager_id === event.actorId) return Promise.resolve([]);
  return Promise.resolve([notice(payload.manager_id, payload.code, text, payload.project_id)]);
};

const onMemberAdded: Handler = (_tx, event) => {
  const payload = memberEventSchema.parse(event.payload);
  if (payload.user_id === event.actorId) return Promise.resolve([]);
  const text = 'usted entró al equipo y ya puede ver el proyecto y su tablero';
  return Promise.resolve([notice(payload.user_id, payload.code, text, payload.project_id)]);
};

const timeEventSchema = z.object({
  project_id: z.uuid(),
  code: z.string(),
  user_id: z.uuid(),
});

const onTimeReturned: Handler = (_tx, event) => {
  const payload = timeEventSchema.parse(event.payload);
  if (payload.user_id === event.actorId) return Promise.resolve([]);
  const text = 'le devolvieron un registro de horas para corregir';
  return Promise.resolve([notice(payload.user_id, payload.code, text, payload.project_id)]);
};

const billableSchema = z.object({ project_id: z.uuid(), code: z.string(), amount: z.string() });

/** «Pesos con punto de miles», como $ 1.500.000,00. */
function pesos(amount: string): string {
  const [whole = '0', cents = '00'] = amount.split('.');
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')},${cents.padEnd(2, '0')}`;
}

/** El hito listo para facturar: a Administrativo y financiero (decisión 6 del B27). */
const onMilestoneBillable: Handler = async (tx, event, now) => {
  const payload = billableSchema.parse(event.payload);
  const users = await activeUsersWithRoles(tx, ['ADMIN_FINANCIERO'], now);
  const text = `un hito quedó listo para facturar por ${pesos(payload.amount)}`;
  return users.map((userId) => notice(userId, payload.code, text, payload.project_id));
};

const incidentSchema = z.object({
  project_id: z.uuid(),
  code: z.string(),
  incident_code: z.string(),
  personal_data: z.boolean(),
});

/** Incidente con datos personales: al Oficial de datos, con el plazo para la SIC (decisión 12). */
const onIncidentReported: Handler = async (tx, event, now) => {
  const payload = incidentSchema.parse(event.payload);
  if (!payload.personal_data) return [];
  const users = await activeUsersWithRoles(tx, ['OFICIAL_DATOS'], now);
  const text = `el incidente ${payload.incident_code} comprometió datos personales; el reporte a la SIC va dentro de los 15 días hábiles siguientes a su detección`;
  return users
    .filter((userId) => userId !== event.actorId)
    .map((userId) => notice(userId, payload.code, text, payload.project_id));
};

export const PROJECT_HANDLERS: Readonly<Record<string, Handler>> = {
  ...Object.fromEntries(Object.keys(LEADER_UPDATES).map((type) => [type, onLeaderUpdate])),
  'project.member.added': onMemberAdded,
  'project.time.returned': onTimeReturned,
  'project.milestone.billable': onMilestoneBillable,
  'project.incident.reported': onIncidentReported,
};
