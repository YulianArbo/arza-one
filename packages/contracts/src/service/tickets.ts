import { z } from 'zod';

import { optionalText, requiredText } from '../contract/common.js';
import {
  calendarDateSchema,
  dateTimeSchema,
  listLimitSchema,
  personRefSchema,
  versionSchema,
} from '../crm/common.js';
import { emailSchema } from '../iam/auth.js';
import {
  slaCalendarSchema,
  ticketCategorySchema,
  ticketChannelSchema,
  ticketLevelSchema,
  ticketPrioritySchema,
  ticketStatusSchema,
} from './common.js';
import { ticketSurveySchema } from './surveys.js';

// Tiquetes de la mesa de ayuda (B28, ficha 17.9, FT-SAC-001): registro, bandeja, ficha, conversación
// y las acciones del recorrido.

/** Canales que se registran a mano; el portal crea los suyos (B30). */
const manualChannelSchema = z
  .enum(['internal', 'email', 'phone'])
  .describe('Canal por el que llegó la solicitud');

const ticketFieldsSchema = z.strictObject({
  subject: requiredText(3, 160, 'Escriba un asunto corto.'),
  description: requiredText(3, 8000, 'Describa la solicitud.'),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  party_id: z.uuid().nullable().default(null).describe('Cliente, de Terceros; vacío si es interno'),
  requester_name: optionalText(160).describe('Nombre de quien reporta en el cliente'),
  requester_email: emailSchema
    .nullable()
    .default(null)
    .describe('Correo de quien reporta: allí llega la encuesta al resolverlo (B29)'),
  project_id: z.uuid().nullable().default(null).describe('Proyecto relacionado'),
  deliverable_id: z
    .uuid()
    .nullable()
    .default(null)
    .describe('Entregable relacionado; necesita el proyecto'),
});

function deliverableNeedsProject(value: {
  project_id: string | null;
  deliverable_id: string | null;
}) {
  return value.deliverable_id === null || value.project_id !== null;
}

const deliverableIssue = {
  path: ['deliverable_id'],
  message: 'Para elegir un entregable, elija primero su proyecto.',
};

export const createTicketRequestSchema = ticketFieldsSchema
  .extend({ channel: manualChannelSchema.default('internal') })
  .refine(deliverableNeedsProject, deliverableIssue);

export const updateTicketRequestSchema = ticketFieldsSchema.refine(
  deliverableNeedsProject,
  deliverableIssue,
);

/** Cómo va el reloj del plazo de solución. */
export const CLOCK_STATES = {
  on_time: 'A tiempo',
  at_risk: 'Por vencer',
  overdue: 'Vencido',
  paused: 'Pausado',
  stopped: 'Detenido',
} as const;

export type ClockState = keyof typeof CLOCK_STATES;

export const clockStateSchema = z.enum(Object.keys(CLOCK_STATES) as [ClockState, ...ClockState[]]);

const codeRefSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export const ticketSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().describe('TIQ-AAAA-NNNN'),
  subject: z.string(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  level: ticketLevelSchema,
  category: ticketCategorySchema,
  party: personRefSchema.nullable().describe('Cliente'),
  assignee: personRefSchema.nullable(),
  requester: personRefSchema.nullable().describe('Colaborador que lo pidió, si es interno'),
  response_due_at: dateTimeSchema.nullable().describe('Vence la primera respuesta'),
  resolution_due_at: dateTimeSchema.nullable().describe('Vence la solución; vacío en pausa'),
  first_response_at: dateTimeSchema.nullable(),
  clock: clockStateSchema,
  in_warranty: z.boolean(),
  created_at: dateTimeSchema,
});

export const ticketDetailSchema = ticketSummarySchema.extend({
  description: z.string(),
  channel: ticketChannelSchema,
  requester_name: z.string().nullable(),
  requester_email: z.string().nullable(),
  survey: ticketSurveySchema.nullable().describe('La encuesta de satisfacción, si ya se resolvió'),
  project: codeRefSchema.nullable(),
  deliverable: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  warranty: z.object({ id: z.uuid(), ends_on: calendarDateSchema }).nullable(),
  sla: z.object({
    calendar: slaCalendarSchema,
    first_response_hours: z.number(),
    resolution_hours: z.number(),
  }),
  paused_at: dateTimeSchema.nullable(),
  resolved_at: dateTimeSchema.nullable(),
  resolution: z.string().nullable(),
  auto_close_at: dateTimeSchema.nullable().describe('Se cierra solo si nadie lo reabre'),
  closed_at: dateTimeSchema.nullable(),
  created_by: personRefSchema.nullable(),
  version: versionSchema,
  can: z.object({
    update: z.boolean(),
    assign: z.boolean().describe('Asignar y escalar'),
    work: z.boolean().describe('Empezar, poner en espera, reanudar y resolver'),
    reopen: z.boolean(),
    close: z.boolean(),
    write_internal: z.boolean().describe('Escribir notas internas'),
    write_public: z.boolean().describe('Escribir al cliente'),
    propose_compensation: z.boolean(),
    decide_compensation: z.boolean(),
  }),
});

/** Vistas de la bandeja. */
export const TICKET_VIEWS = {
  all: 'Todos los abiertos',
  mine: 'Mis tiquetes',
  unassigned: 'Sin asignar',
  at_risk: 'Por vencer',
  overdue: 'Vencidos',
  waiting: 'En espera del cliente',
  done: 'Resueltos y cerrados',
} as const;

export type TicketView = keyof typeof TICKET_VIEWS;

export const ticketViewSchema = z.enum(Object.keys(TICKET_VIEWS) as [TicketView, ...TicketView[]]);

export const ticketListQuerySchema = z.strictObject({
  view: ticketViewSchema.default('all'),
  priority: ticketPrioritySchema.optional(),
  q: z.string().trim().min(1).max(120).optional().describe('Busca en código y asunto'),
  limit: listLimitSchema,
  cursor: z.uuid().optional(),
});

export const ticketListResponseSchema = z.object({
  data: z.array(ticketSummarySchema),
  next_cursor: z.uuid().nullable(),
});

/** A quién se puede asignar: Servicio al cliente y Líder técnico. */
export const ticketOptionsSchema = z.object({
  assignees: z.array(personRefSchema),
});

// Conversación ---------------------------------------------------------------------------------

export const ticketMessageRequestSchema = z
  .strictObject({
    body: requiredText(1, 8000, 'Escriba el mensaje.'),
    is_internal: z.boolean().default(false).describe('Nota interna: el cliente no la ve'),
    from_client: z
      .boolean()
      .default(false)
      .describe('Lo que el cliente respondió por correo o teléfono; reanuda el reloj'),
  })
  .refine((value) => !(value.is_internal && value.from_client), {
    path: ['is_internal'],
    message: 'Una respuesta del cliente no puede ser una nota interna.',
  });

export const ticketMessageSchema = z.object({
  id: z.uuid(),
  author: personRefSchema.nullable(),
  body: z.string(),
  is_internal: z.boolean(),
  from_client: z.boolean(),
  created_at: dateTimeSchema,
});

export const ticketMessageListResponseSchema = z.object({ data: z.array(ticketMessageSchema) });

// Acciones -------------------------------------------------------------------------------------

export const assignTicketRequestSchema = z.strictObject({
  assignee_id: z.uuid().describe('Persona de Servicio al cliente o Líder técnico'),
});

export const escalateTicketRequestSchema = z.strictObject({
  assignee_id: z.uuid().describe('Quien atiende en el nivel siguiente'),
  reason: requiredText(3, 1000, 'Escriba por qué se escala.'),
});

export const waitTicketRequestSchema = z.strictObject({
  note: optionalText(1000).describe('Qué se espera del cliente'),
});

export const resolveTicketRequestSchema = z.strictObject({
  resolution: requiredText(3, 4000, 'Escriba cómo se resolvió.'),
});

export const reopenTicketRequestSchema = z.strictObject({
  reason: requiredText(3, 1000, 'Escriba por qué se reabre.'),
});

export type CreateTicketRequest = z.infer<typeof createTicketRequestSchema>;
export type UpdateTicketRequest = z.infer<typeof updateTicketRequestSchema>;
export type TicketSummary = z.infer<typeof ticketSummarySchema>;
export type TicketDetail = z.infer<typeof ticketDetailSchema>;
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;
export type TicketListResponse = z.infer<typeof ticketListResponseSchema>;
export type TicketOptions = z.infer<typeof ticketOptionsSchema>;
export type TicketMessageRequest = z.infer<typeof ticketMessageRequestSchema>;
export type TicketMessage = z.infer<typeof ticketMessageSchema>;
export type AssignTicketRequest = z.infer<typeof assignTicketRequestSchema>;
export type EscalateTicketRequest = z.infer<typeof escalateTicketRequestSchema>;
export type WaitTicketRequest = z.infer<typeof waitTicketRequestSchema>;
export type ResolveTicketRequest = z.infer<typeof resolveTicketRequestSchema>;
export type ReopenTicketRequest = z.infer<typeof reopenTicketRequestSchema>;
