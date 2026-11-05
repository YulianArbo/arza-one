import { z } from 'zod';

import {
  calendarDateSchema,
  dateTimeSchema,
  listLimitSchema,
  moneySchema,
  personRefSchema,
  versionSchema,
} from '../crm/common.js';
import { contractStatusSchema, optionalText, requiredText } from '../contract/common.js';
import {
  authorizationStatusSchema,
  hasAtMostDecimals,
  projectMethodologySchema,
  projectStatusSchema,
  projectTypeSchema,
} from './common.js';
import { linkSchema, memberSchema, milestoneSchema, sprintSchema } from './planning.js';

// Proyectos (B26, ficha 17.8): se crean desde un contrato vigente o, sin él, con la autorización
// expresa de la Dirección para iniciar. Código PRY-AAAA-NNNN. El Líder técnico los crea; cada
// miembro del equipo ve solo los suyos.

/** Horas con un decimal, como 120.5. */
export const hoursSchema = z
  .number()
  .min(0, 'Las horas no pueden ser negativas.')
  .max(99999.9, 'Escriba como máximo 99999,9 horas.')
  .refine((hours) => hasAtMostDecimals(hours, 1), 'Use como máximo un decimal.')
  .describe('Horas, con un decimal');

const projectDataFields = {
  name: requiredText(3, 160, 'Escriba el nombre del proyecto.'),
  type: projectTypeSchema,
  methodology: projectMethodologySchema,
  description: optionalText(4000).describe('Alcance en pocas palabras'),
  starts_on: calendarDateSchema.describe('Inicio planeado'),
  ends_on: calendarDateSchema.describe('Fin planeado'),
  budget_hours: hoursSchema.describe('Presupuesto de horas'),
  budget_amount: moneySchema
    .nullable()
    .default(null)
    .describe('Presupuesto en pesos; vacío toma el valor del contrato'),
  manager_id: z.uuid().describe('Líder del proyecto: queda en el equipo con ese rol'),
};

export const createProjectRequestSchema = z.strictObject({
  contract_id: z
    .uuid()
    .nullable()
    .default(null)
    .describe('Contrato vigente de origen; vacío si la Dirección autorizará el inicio'),
  party_id: z
    .uuid()
    .nullable()
    .default(null)
    .describe('Cliente, desde Terceros; solo cuando no hay contrato'),
  ...projectDataFields,
});

export const updateProjectRequestSchema = z.strictObject(projectDataFields);

export const projectReasonRequestSchema = z.strictObject({
  reason: requiredText(3, 1000, 'Escriba el motivo.'),
});

const codeTitleRef = z.object({ id: z.uuid(), code: z.string(), title: z.string() });

export const projectProgressSchema = z.object({
  planned: z.number().int().nonnegative().describe('Historias, tareas y defectos planeados'),
  done: z.number().int().nonnegative().describe('De ellos, terminados'),
  percent: z.number().int().min(0).max(100),
});

export const projectSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().describe('PRY-AAAA-NNNN'),
  name: z.string(),
  party: personRefSchema.describe('Cliente'),
  contract: codeTitleRef.nullable(),
  status: projectStatusSchema,
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema,
  manager: personRefSchema.nullable(),
  progress: projectProgressSchema,
  version: versionSchema,
});

export const projectDetailSchema = projectSummarySchema.extend({
  type: projectTypeSchema,
  methodology: projectMethodologySchema,
  description: z.string().nullable(),
  budget_hours: z.number(),
  budget_amount: moneySchema.nullable(),
  status_reason: z.string().nullable().describe('Por qué está en riesgo o pausado'),
  contract_status: contractStatusSchema.nullable(),
  authorization: z.object({
    status: authorizationStatusSchema,
    reason: z.string().nullable(),
    note: z.string().nullable().describe('Comentario de la Dirección'),
    decided_by: personRefSchema.nullable(),
    decided_at: dateTimeSchema.nullable(),
  }),
  started_at: dateTimeSchema.nullable(),
  created_at: dateTimeSchema,
  members: z.array(memberSchema),
  milestones: z.array(milestoneSchema),
  sprints: z.array(sprintSchema),
  links: z.array(linkSchema),
  can: z.object({
    update: z.boolean().describe('Editar, cambiar el estado, hitos, iteraciones y enlaces'),
    manage_members: z.boolean(),
    manage_items: z.boolean(),
  }),
});

export const projectListQuerySchema = z.strictObject({
  status: projectStatusSchema.optional(),
  q: z.string().trim().min(1).max(120).optional().describe('Busca en código, nombre y cliente'),
  limit: listLimitSchema,
  cursor: z.uuid().optional(),
});

export const projectListResponseSchema = z.object({
  data: z.array(projectSummarySchema),
  next_cursor: z.uuid().nullable(),
});

/** Lo que necesita el asistente: los contratos vigentes sin proyecto y quién puede ser del equipo. */
export const projectOptionsSchema = z.object({
  contracts: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      title: z.string(),
      party: personRefSchema,
      starts_on: calendarDateSchema,
      ends_on: calendarDateSchema,
      value: moneySchema.nullable(),
    }),
  ),
  people: z.array(personRefSchema),
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export type ProjectReasonRequest = z.infer<typeof projectReasonRequestSchema>;
export type ProjectProgress = z.infer<typeof projectProgressSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type ProjectOptions = z.infer<typeof projectOptionsSchema>;
