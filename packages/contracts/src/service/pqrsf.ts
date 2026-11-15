import { z } from 'zod';

import { requiredText } from '../contract/common.js';
import type { PqrsfTerms } from '../core/calendar.js';
import {
  calendarDateSchema,
  dateTimeSchema,
  listLimitSchema,
  personRefSchema,
  versionSchema,
} from '../crm/common.js';
import { emailSchema } from '../iam/auth.js';

// PQRSF: peticiones, quejas, reclamos, sugerencias y felicitaciones (B29, ficha 17.9, FT-SAC-002,
// PR-SAC-002). Se radican en el sitio público o las registra Servicio al cliente; reciben acuse con
// radicado y fecha límite; se clasifican, se asignan, se responden y la respuesta la aprueba otra
// persona antes de enviarse.

function enumOf<T extends string>(labels: Readonly<Record<T, string>>) {
  return z.enum(Object.keys(labels) as [T, ...T[]]);
}

export const PQRSF_TYPES = {
  petition: 'Petición',
  complaint: 'Queja',
  claim: 'Reclamo',
  suggestion: 'Sugerencia',
  compliment: 'Felicitación',
} as const;

export type PqrsfType = keyof typeof PQRSF_TYPES;

export const pqrsfTypeSchema = enumOf(PQRSF_TYPES).describe('Tipo de PQRSF');

/** Una queja o un reclamo procedente genera no conformidad en Calidad (ficha 17.9). */
export const NONCONFORMITY_TYPES: readonly PqrsfType[] = ['complaint', 'claim'];

/** Las que tratan de datos personales siguen la Ley 1581 y se trasladan a Privacidad. */
export const PRIVACY_KINDS = {
  inquiry: 'Consulta sobre datos personales',
  claim: 'Reclamo sobre datos personales',
} as const;

export type PrivacyKind = keyof typeof PRIVACY_KINDS;

export const privacyKindSchema = enumOf(PRIVACY_KINDS).describe('Trata de datos personales');

/** Ficha 17.9: radicada → clasificada → en trámite → respondida → cerrada. */
export const PQRSF_STATUSES = {
  filed: 'Radicada',
  classified: 'Clasificada',
  in_progress: 'En trámite',
  responded: 'Respondida',
  closed: 'Cerrada',
} as const;

export type PqrsfStatus = keyof typeof PQRSF_STATUSES;

export const pqrsfStatusSchema = enumOf(PQRSF_STATUSES).describe('Estado de la PQRSF');

export const OPEN_PQRSF_STATUSES: readonly PqrsfStatus[] = ['filed', 'classified', 'in_progress'];

/** La respuesta en trámite: sin enviar a aprobación, por aprobar o devuelta con un motivo. */
export const PQRSF_APPROVALS = {
  none: 'Sin enviar a aprobación',
  pending: 'Por aprobar',
  returned: 'Devuelta para corregir',
} as const;

export type PqrsfApproval = keyof typeof PQRSF_APPROVALS;

export const pqrsfApprovalSchema = enumOf(PQRSF_APPROVALS);

export const PQRSF_CHANNELS = {
  web: 'Sitio web',
  email: 'Correo',
  phone: 'Teléfono',
  in_person: 'En persona',
  portal: 'Portal del cliente',
} as const;

export type PqrsfChannel = keyof typeof PQRSF_CHANNELS;

export const pqrsfChannelSchema = enumOf(PQRSF_CHANNELS).describe('Por dónde llegó');

/** Plazos por omisión (decisión 2 del B29); la empresa los cambia en sus parámetros. */
export const PQRSF_DEFAULT_TERMS: PqrsfTerms = {
  petition: 15,
  complaint: 15,
  claim: 15,
  suggestion: 30,
  compliment: 30,
  privacy_inquiry: 10,
  privacy_claim: 15,
};

export const PQRSF_RULES = {
  /** Aviso al responsable y al líder cuando faltan estos días hábiles (decisión 11). */
  warnBusinessDaysBefore: 2,
} as const;

/** El plazo que le toca: el de datos personales si trata de ellos; si no, el de su tipo. */
export function pqrsfTermDays(
  terms: PqrsfTerms,
  type: PqrsfType,
  privacyKind: PrivacyKind | null,
): number {
  if (privacyKind === 'inquiry') return terms.privacy_inquiry;
  if (privacyKind === 'claim') return terms.privacy_claim;
  return terms[type];
}

/** Qué paso puede seguir a cada estado (la API y la ficha usan la misma tabla). */
export const PQRSF_ACTIONS = {
  classify: ['filed', 'classified'],
  assign: ['classified', 'in_progress'],
  draft: ['classified', 'in_progress'],
  submit: ['in_progress'],
  approve: ['in_progress'],
  return: ['in_progress'],
  close: ['responded'],
} as const satisfies Record<string, readonly PqrsfStatus[]>;

export type PqrsfAction = keyof typeof PQRSF_ACTIONS;

export function canPqrsfStep(action: PqrsfAction, status: PqrsfStatus): boolean {
  const allowed: readonly PqrsfStatus[] = PQRSF_ACTIONS[action];
  return allowed.includes(status);
}

/** Radicado: PQRSF-AAAA-NNNN. */
export const pqrsfCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^PQRSF-\d{4}-\d{4,8}$/u, 'Escriba el radicado como aparece en el acuse: PQRSF-2026-0001.')
  .describe('Radicado');

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s-]{6,19}$/u, 'Escriba un teléfono de 7 a 20 números.')
  .nullable()
  .default(null)
  .describe('Teléfono de contacto');

const requesterNameSchema = requiredText(3, 160, 'Escriba el nombre de quien la presenta.');
const subjectSchema = requiredText(3, 160, 'Escriba un asunto corto.');
const descriptionSchema = requiredText(10, 8000, 'Cuéntenos con detalle (al menos 10 letras).');

// Sitio público -------------------------------------------------------------------------------

export const publicPqrsfRequestSchema = z.strictObject({
  type: pqrsfTypeSchema,
  name: requesterNameSchema,
  email: emailSchema.describe('Aquí llegan el acuse y la respuesta'),
  phone: phoneSchema,
  subject: subjectSchema,
  description: descriptionSchema,
  accepts_privacy: z.literal(true, {
    error: 'Para radicar debe aceptar el tratamiento de sus datos.',
  }),
  /** Campo trampa: las personas no lo ven; los programas que llenan todo, sí (decisión 12). */
  website: z.literal('').default('').describe('Déjelo vacío'),
});

export const publicPqrsfFiledSchema = z.object({
  code: z.string().describe('Radicado'),
  type: pqrsfTypeSchema,
  received_at: dateTimeSchema,
  due_on: calendarDateSchema.describe('Fecha límite de respuesta'),
});

/** Consulta de estado: el radicado y el correo con que se radicó (decisión 4). */
export const publicPqrsfStatusRequestSchema = z.strictObject({
  code: pqrsfCodeSchema,
  email: emailSchema,
});

export const publicPqrsfStatusSchema = z.object({
  code: z.string(),
  type: pqrsfTypeSchema,
  status: pqrsfStatusSchema,
  received_at: dateTimeSchema,
  due_on: calendarDateSchema,
  responded_at: dateTimeSchema.nullable(),
  response: z.string().nullable().describe('La respuesta aprobada, cuando ya se envió'),
});

// Registro y recorrido internos ----------------------------------------------------------------

/** Lo que llega por correo, teléfono o en persona lo registra Servicio al cliente. */
export const createPqrsfRequestSchema = z
  .strictObject({
    channel: z.enum(['email', 'phone', 'in_person']).describe('Por dónde llegó'),
    type: pqrsfTypeSchema,
    requester_name: requesterNameSchema,
    requester_email: emailSchema.nullable().default(null).describe('Para el acuse y la respuesta'),
    requester_phone: phoneSchema,
    subject: subjectSchema,
    description: descriptionSchema,
    party_id: z.uuid().nullable().default(null).describe('Tercero, si ya está registrado'),
  })
  .refine((value) => value.requester_email !== null || value.requester_phone !== null, {
    path: ['requester_email'],
    message: 'Escriba un correo o un teléfono para responderle.',
  });

export const classifyPqrsfRequestSchema = z.strictObject({
  type: pqrsfTypeSchema,
  privacy_kind: privacyKindSchema.nullable().default(null),
  party_id: z.uuid().nullable().default(null).describe('Tercero relacionado'),
  assignee_id: z.uuid().describe('Quien la tramita'),
});

export const assignPqrsfRequestSchema = z.strictObject({
  assignee_id: z.uuid().describe('Quien la tramita'),
});

export const draftPqrsfRequestSchema = z.strictObject({
  response: requiredText(10, 8000, 'Escriba la respuesta (al menos 10 letras).'),
  well_founded: z
    .boolean()
    .nullable()
    .default(null)
    .describe('Queja o reclamo procedente: genera no conformidad en Calidad'),
});

export const returnPqrsfRequestSchema = z.strictObject({
  reason: requiredText(3, 1000, 'Escriba qué hay que corregir.'),
});

/** Cómo va el plazo: a tiempo, por vencer (faltan dos días hábiles), vencido o detenido. */
export const PQRSF_DUE_STATES = {
  on_time: 'A tiempo',
  at_risk: 'Por vencer',
  overdue: 'Vencida',
  stopped: 'Respondida',
} as const;

export type PqrsfDueState = keyof typeof PQRSF_DUE_STATES;

export const pqrsfDueStateSchema = enumOf(PQRSF_DUE_STATES);

export const pqrsfSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().describe('PQRSF-AAAA-NNNN'),
  type: pqrsfTypeSchema,
  privacy_kind: privacyKindSchema.nullable(),
  status: pqrsfStatusSchema,
  approval: pqrsfApprovalSchema,
  channel: pqrsfChannelSchema,
  requester_name: z.string(),
  subject: z.string(),
  party: personRefSchema.nullable().describe('Tercero'),
  assignee: personRefSchema.nullable(),
  received_at: dateTimeSchema,
  due_on: calendarDateSchema,
  due_state: pqrsfDueStateSchema,
});

export const pqrsfDetailSchema = pqrsfSummarySchema.extend({
  description: z.string(),
  requester_email: z.string().nullable(),
  requester_phone: z.string().nullable(),
  term_days: z.number().int().describe('Días hábiles del plazo'),
  warn_on: calendarDateSchema.describe('Desde este día avisa que está por vencer'),
  response_draft: z.string().nullable(),
  well_founded: z.boolean().nullable(),
  drafted_by: personRefSchema.nullable(),
  submitted_at: dateTimeSchema.nullable().describe('Cuándo se envió a aprobación'),
  return_reason: z.string().nullable(),
  response: z.string().nullable().describe('Respuesta aprobada y enviada'),
  approved_by: personRefSchema.nullable(),
  responded_at: dateTimeSchema.nullable(),
  transferred_at: dateTimeSchema.nullable().describe('Trasladada a Privacidad'),
  nonconformity_at: dateTimeSchema.nullable().describe('Calidad recibió la no conformidad'),
  ack_sent_at: dateTimeSchema.nullable().describe('Se envió el acuse por correo'),
  response_sent_at: dateTimeSchema.nullable().describe('Se envió la respuesta por correo'),
  closed_at: dateTimeSchema.nullable(),
  created_by: personRefSchema.nullable().describe('Vacío si se radicó en el sitio'),
  version: versionSchema,
  can: z.object({
    classify: z.boolean(),
    assign: z.boolean(),
    draft: z.boolean().describe('Escribir la respuesta y enviarla a aprobación'),
    approve: z.boolean().describe('Aprobar o devolver'),
    close: z.boolean(),
  }),
});

export const PQRSF_VIEWS = {
  open: 'Abiertas',
  mine: 'Mis PQRSF',
  unclassified: 'Por clasificar',
  pending_approval: 'Por aprobar',
  at_risk: 'Por vencer',
  overdue: 'Vencidas',
  done: 'Respondidas y cerradas',
} as const;

export type PqrsfView = keyof typeof PQRSF_VIEWS;

export const pqrsfViewSchema = enumOf(PQRSF_VIEWS);

export const pqrsfListQuerySchema = z.strictObject({
  view: pqrsfViewSchema.default('open'),
  type: pqrsfTypeSchema.optional(),
  q: z.string().trim().min(1).max(120).optional().describe('Busca en radicado, asunto y nombre'),
  limit: listLimitSchema,
  cursor: z.uuid().optional(),
});

export const pqrsfListResponseSchema = z.object({
  data: z.array(pqrsfSummarySchema),
  next_cursor: z.uuid().nullable(),
  can_create: z.boolean(),
});

export const pqrsfOptionsSchema = z.object({ assignees: z.array(personRefSchema) });

export type PublicPqrsfRequest = z.infer<typeof publicPqrsfRequestSchema>;
export type PublicPqrsfFiled = z.infer<typeof publicPqrsfFiledSchema>;
export type PublicPqrsfStatusRequest = z.infer<typeof publicPqrsfStatusRequestSchema>;
export type PublicPqrsfStatus = z.infer<typeof publicPqrsfStatusSchema>;
export type CreatePqrsfRequest = z.infer<typeof createPqrsfRequestSchema>;
export type ClassifyPqrsfRequest = z.infer<typeof classifyPqrsfRequestSchema>;
export type AssignPqrsfRequest = z.infer<typeof assignPqrsfRequestSchema>;
export type DraftPqrsfRequest = z.infer<typeof draftPqrsfRequestSchema>;
export type ReturnPqrsfRequest = z.infer<typeof returnPqrsfRequestSchema>;
export type PqrsfSummary = z.infer<typeof pqrsfSummarySchema>;
export type PqrsfDetail = z.infer<typeof pqrsfDetailSchema>;
export type PqrsfListQuery = z.infer<typeof pqrsfListQuerySchema>;
export type PqrsfListResponse = z.infer<typeof pqrsfListResponseSchema>;
export type PqrsfOptions = z.infer<typeof pqrsfOptionsSchema>;
