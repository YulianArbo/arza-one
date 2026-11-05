import { z } from 'zod';

import { calendarDateSchema, personRefSchema, versionSchema } from '../crm/common.js';
import { optionalText, requiredText } from '../contract/common.js';
import {
  hasAtMostDecimals,
  linkKindSchema,
  memberRoleSchema,
  milestoneStatusSchema,
  sprintStatusSchema,
} from './common.js';

// La estructura del proyecto (B26, ficha 17.8): el equipo, los hitos con su porcentaje de
// facturación, las iteraciones y los enlaces al repositorio, a los entornos y al diseño. ARZA ONE
// guarda los enlaces, nunca el código del cliente.

export const memberRequestSchema = z.strictObject({
  user_id: z.uuid().describe('Colaborador activo de la empresa'),
  role: memberRoleSchema,
  allocation_pct: z
    .number()
    .int('Escriba un porcentaje entero.')
    .min(1, 'La dedicación va de 1 % a 100 %.')
    .max(100, 'La dedicación va de 1 % a 100 %.')
    .describe('Dedicación al proyecto, en porcentaje'),
});

export const updateMemberRequestSchema = memberRequestSchema.omit({ user_id: true });

export const memberSchema = z.object({
  id: z.uuid(),
  person: personRefSchema,
  role: memberRoleSchema,
  allocation_pct: z.number().int(),
  version: versionSchema,
});

/** Porcentaje del valor del contrato que se factura al cumplir el hito, con dos decimales. */
export const billingPctSchema = z
  .number()
  .min(0, 'El porcentaje va de 0 % a 100 %.')
  .max(100, 'El porcentaje va de 0 % a 100 %.')
  .refine((pct) => hasAtMostDecimals(pct, 2), 'Use como máximo dos decimales.')
  .describe('Porcentaje de facturación del hito');

export const milestoneRequestSchema = z.strictObject({
  name: requiredText(3, 160, 'Escriba el nombre del hito.'),
  due_on: calendarDateSchema.describe('Fecha comprometida'),
  billing_pct: billingPctSchema,
});

export const milestoneSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  due_on: calendarDateSchema,
  billing_pct: z.number(),
  status: milestoneStatusSchema,
  version: versionSchema,
});

export const sprintRequestSchema = z.strictObject({
  name: requiredText(3, 80, 'Escriba el nombre de la iteración.'),
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema,
  goal: optionalText(1000).describe('Qué se quiere lograr'),
});

export const sprintSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema,
  goal: z.string().nullable(),
  status: sprintStatusSchema,
  items: z.number().int().nonnegative().describe('Ítems en la iteración'),
  version: versionSchema,
});

export const linkRequestSchema = z.strictObject({
  kind: linkKindSchema,
  url: z
    .url({ protocol: /^https$/u, error: 'Escriba una dirección completa que empiece por https://' })
    .max(500)
    .describe('Dirección https'),
  label: requiredText(3, 120, 'Escriba un nombre corto para el enlace.'),
});

export const linkSchema = z.object({
  id: z.uuid(),
  kind: linkKindSchema,
  url: z.string(),
  label: z.string(),
});

export type MemberRequest = z.infer<typeof memberRequestSchema>;
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
export type ProjectMember = z.infer<typeof memberSchema>;
export type MilestoneRequest = z.infer<typeof milestoneRequestSchema>;
export type ProjectMilestone = z.infer<typeof milestoneSchema>;
export type SprintRequest = z.infer<typeof sprintRequestSchema>;
export type ProjectSprint = z.infer<typeof sprintSchema>;
export type LinkRequest = z.infer<typeof linkRequestSchema>;
export type ProjectLink = z.infer<typeof linkSchema>;
