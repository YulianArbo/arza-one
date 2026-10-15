import { z } from 'zod';

import { emailSchema } from '../iam/auth.js';
import { stateKindSchema, taskPrioritySchema, wfKeySchema } from './definitions.js';

// Contratos de los trámites, su historial y las tareas (M04, B15): bandeja «Mis tareas»,
// aprobaciones en serie o en paralelo, delegación y escalamiento.

const dateTime = z.iso.datetime({ offset: true });

const personRefSchema = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  email: z.email(),
});

const stateRefSchema = z.object({ key: z.string(), label: z.string(), kind: stateKindSchema });

export const taskStatusSchema = z
  .enum(['pending', 'in_progress', 'completed', 'overdue', 'cancelled'])
  .describe('Pendiente, en curso, completada, vencida o cancelada');

export const taskKindSchema = z.enum(['action', 'approval']).describe('Atender o aprobar');

/** Por qué la tarea está en la bandeja de la persona. */
export const taskReasonSchema = z
  .enum(['assigned', 'role', 'delegation', 'escalation', 'unassigned'])
  .describe(
    'Asignada a usted, a uno de sus roles, por una delegación, escalada a usted o sin responsable',
  );

export const availableActionSchema = z.object({
  action: z.string(),
  label: z.string(),
  to_state: stateRefSchema,
  requires_comment: z.boolean(),
  condition_met: z.boolean().describe('Si es falso, el registro aún no cumple la condición'),
});

export const historyEntrySchema = z.object({
  id: z.uuid(),
  from_state: stateRefSchema.nullable().describe('Vacío en el inicio del trámite'),
  to_state: stateRefSchema,
  action: z.string(),
  action_label: z.string(),
  actor: personRefSchema.nullable().describe('Vacío si lo hizo el sistema'),
  on_behalf_of: personRefSchema.nullable().describe('A nombre de quién, por una delegación'),
  comment: z.string().nullable(),
  occurred_at: dateTime,
});

export const taskSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  kind: taskKindSchema,
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  due_at: dateTime.nullable(),
  assignee: personRefSchema.nullable(),
  assignee_role: z.string().nullable().describe('Rol que la atiende mientras nadie la toma'),
  escalated_to: personRefSchema.nullable(),
  escalated_at: dateTime.nullable(),
  delegated_from: personRefSchema.nullable(),
  instance: z.object({
    id: z.uuid(),
    title: z.string(),
    workflow_name: z.string(),
    state: stateRefSchema,
  }),
  reason: taskReasonSchema.nullable().describe('Vacío en el tablero'),
  created_at: dateTime,
  completed_at: dateTime.nullable(),
});

export const taskSchema = taskSummarySchema.extend({
  can_act: z.boolean().describe('La persona puede atenderla ahora'),
  actions: z.array(availableActionSchema).describe('Transiciones que puede hacer al completarla'),
  history: z.array(historyEntrySchema),
});

export const instanceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  entity_type: z.string(),
  entity_id: z.uuid(),
  workflow: z.object({ id: z.uuid(), key: z.string(), name: z.string(), version: z.number() }),
  state: stateRefSchema,
  started_by: personRefSchema.nullable(),
  started_at: dateTime,
  due_at: dateTime.nullable(),
  completed_at: dateTime.nullable(),
  row_version: z.number().int().positive(),
  actions: z.array(availableActionSchema).describe('Transiciones que la persona puede hacer'),
  tasks: z.array(taskSummarySchema),
  history: z.array(historyEntrySchema).describe('Del más antiguo al más reciente'),
});

export const myTasksQuerySchema = z.strictObject({
  view: z
    .enum(['open', 'overdue', 'closed'])
    .default('open')
    .describe('Abiertas, vencidas o cerradas (las 100 más recientes)'),
});

export const taskBoardQuerySchema = z.strictObject({
  status: taskStatusSchema.optional(),
  escalated: z.enum(['true', 'false']).optional().describe('Solo las escaladas'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
});

export const taskListResponseSchema = z.object({
  data: z.array(taskSummarySchema),
  next_cursor: z.uuid().nullable(),
});

const commentSchema = z.string().trim().min(1).max(2000);

export const completeTaskRequestSchema = z.strictObject({
  action: wfKeySchema.describe('Transición con la que se completa'),
  comment: commentSchema.optional(),
});

export const decideTaskRequestSchema = z.strictObject({ comment: commentSchema.optional() });

export const rejectTaskRequestSchema = z.strictObject({
  comment: commentSchema.describe('El motivo del rechazo es obligatorio'),
});

export const handOverTaskRequestSchema = z
  .strictObject({
    to_user_id: z.uuid().optional().describe('Persona interna activa que recibe la tarea'),
    to_email: emailSchema.optional().describe('O su correo, para quien no ve la lista de usuarios'),
    comment: commentSchema.optional(),
  })
  .refine((value) => (value.to_user_id === undefined) !== (value.to_email === undefined), {
    message: 'Indique quién recibe: su identificador o su correo, no los dos.',
  });

export const instanceActionRequestSchema = z.strictObject({ comment: commentSchema.optional() });

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskKind = z.infer<typeof taskKindSchema>;
export type TaskReason = z.infer<typeof taskReasonSchema>;
export type AvailableAction = z.infer<typeof availableActionSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type TaskSummary = z.infer<typeof taskSummarySchema>;
export type TaskView = z.infer<typeof taskSchema>;
export type InstanceView = z.infer<typeof instanceSchema>;
export type MyTasksQuery = z.infer<typeof myTasksQuerySchema>;
export type TaskBoardQuery = z.infer<typeof taskBoardQuerySchema>;
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;
export type CompleteTaskRequest = z.infer<typeof completeTaskRequestSchema>;
export type DecideTaskRequest = z.infer<typeof decideTaskRequestSchema>;
export type RejectTaskRequest = z.infer<typeof rejectTaskRequestSchema>;
export type HandOverTaskRequest = z.infer<typeof handOverTaskRequestSchema>;
export type InstanceActionRequest = z.infer<typeof instanceActionRequestSchema>;
