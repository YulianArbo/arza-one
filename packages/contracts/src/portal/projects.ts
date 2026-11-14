import { z } from 'zod';

import { calendarDateSchema, dateTimeSchema } from '../crm/common.js';
import {
  acceptanceStatusSchema,
  deliverableStatusSchema,
  milestoneStatusSchema,
  projectStatusSchema,
} from '../project/common.js';

// Proyectos en el portal (B30, decisiones 2 y 3): solo los que ya iniciaron y el líder dejó
// visibles. Nunca muestran dinero, horas, riesgos ni notas internas del equipo.

export const portalMilestoneSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  due_on: calendarDateSchema,
  status: milestoneStatusSchema,
});

export const portalDeliverableSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  version_label: z.string().nullable(),
  status: deliverableStatusSchema,
  milestone: z.string().nullable().describe('Nombre del hito al que pertenece'),
  acceptance: z
    .object({
      status: acceptanceStatusSchema,
      respond_by: calendarDateSchema,
      delivered_at: dateTimeSchema,
    })
    .nullable()
    .describe('El acta de entrega más reciente'),
});

export const portalProjectSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: projectStatusSchema,
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema,
  progress_pct: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Tareas terminadas sobre planeadas: el mismo avance que ve el equipo'),
  next_milestone: portalMilestoneSchema.nullable(),
  awaiting_client: z.number().int().describe('Actas que esperan la respuesta del cliente'),
});

export const portalProjectListSchema = z.object({ data: z.array(portalProjectSummarySchema) });

export const portalProjectDetailSchema = portalProjectSummarySchema.extend({
  description: z.string().nullable(),
  milestones: z.array(portalMilestoneSchema),
  deliverables: z.array(portalDeliverableSchema),
});

export type PortalMilestone = z.infer<typeof portalMilestoneSchema>;
export type PortalDeliverable = z.infer<typeof portalDeliverableSchema>;
export type PortalProjectSummary = z.infer<typeof portalProjectSummarySchema>;
export type PortalProjectList = z.infer<typeof portalProjectListSchema>;
export type PortalProjectDetail = z.infer<typeof portalProjectDetailSchema>;
