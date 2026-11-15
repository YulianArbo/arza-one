import { z } from 'zod';

import { optionalText, requiredText } from '../contract/common.js';
import {
  calendarDateSchema,
  dateTimeSchema,
  moneySchema,
  personRefSchema,
  versionSchema,
} from '../crm/common.js';
import { hasAtMostDecimals } from '../project/common.js';
import {
  compensationStatusSchema,
  compensationTypeSchema,
  SLA_RULES,
  slaCalendarSchema,
  ticketPrioritySchema,
} from './common.js';

// Acuerdos de tiempo por prioridad (wf_sla_policies), garantías por entregable (svc_warranties) y
// compensaciones técnicas RE-SAC-001 (svc_compensations) de la mesa de ayuda (B28, ficha 17.9).

// Acuerdos de tiempo -----------------------------------------------------------------------------

const hoursSchema = z
  .number()
  .gt(0, 'Escriba un plazo mayor que cero.')
  .max(SLA_RULES.maxHours, `El plazo va hasta ${String(SLA_RULES.maxHours)} horas.`)
  .refine((value) => hasAtMostDecimals(value, 2), 'Use máximo dos decimales.');

export const slaPolicyRequestSchema = z
  .strictObject({
    first_response_hours: hoursSchema.describe('Horas para la primera respuesta'),
    resolution_hours: hoursSchema.describe('Horas para la solución'),
    calendar: slaCalendarSchema,
  })
  .refine((value) => value.resolution_hours >= value.first_response_hours, {
    path: ['resolution_hours'],
    message: 'La solución no puede tardar menos que la primera respuesta.',
  });

export const slaPolicySchema = z.object({
  id: z.uuid(),
  priority: ticketPrioritySchema,
  first_response_hours: z.number(),
  resolution_hours: z.number(),
  calendar: slaCalendarSchema,
  version: versionSchema,
});

export const slaPolicyListResponseSchema = z.object({
  data: z.array(slaPolicySchema),
  can_manage: z.boolean().describe('Puede cambiar los acuerdos'),
});

// Garantías ------------------------------------------------------------------------------------

export const warrantyRequestSchema = z.strictObject({
  ends_on: calendarDateSchema.describe('Hasta cuándo cubre la garantía'),
  scope: requiredText(3, 2000, 'Escriba qué cubre la garantía.'),
});

export const warrantySchema = z.object({
  id: z.uuid(),
  project: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  deliverable: z.object({ id: z.uuid(), name: z.string() }),
  party: personRefSchema.nullable(),
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema,
  scope: z.string(),
  active: z.boolean().describe('Hoy está vigente'),
  version: versionSchema,
});

export const warrantyListQuerySchema = z.strictObject({
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .describe('Solo las vigentes (true) o solo las vencidas (false)'),
});

export const warrantyListResponseSchema = z.object({
  data: z.array(warrantySchema),
  can_manage: z.boolean(),
});

// Compensaciones (RE-SAC-001) ------------------------------------------------------------------

export const compensationRequestSchema = z
  .strictObject({
    type: compensationTypeSchema,
    amount: moneySchema.nullable().default(null).describe('Pesos, para un descuento'),
    hours: z
      .number()
      .gt(0, 'Escriba las horas.')
      .max(1000)
      .refine((value) => hasAtMostDecimals(value, 2), 'Use máximo dos decimales.')
      .nullable()
      .default(null)
      .describe('Horas de soporte sin costo'),
    days: z
      .number()
      .int('Escriba días enteros.')
      .min(1, 'Escriba los días.')
      .max(365)
      .nullable()
      .default(null)
      .describe('Días de extensión del servicio'),
    reason: requiredText(3, 2000, 'Escriba por qué se compensa al cliente.'),
  })
  .superRefine((value, context) => {
    const needed = {
      discount: 'amount',
      support_hours: 'hours',
      service_extension: 'days',
    } as const;
    const field = needed[value.type];
    for (const key of ['amount', 'hours', 'days'] as const) {
      const present = value[key] !== null;
      if (key === field && !present) {
        context.addIssue({ code: 'custom', path: [key], message: 'Escriba este valor.' });
      }
      if (key !== field && present) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Este valor no aplica a este tipo de compensación.',
        });
      }
    }
  });

export const compensationDecisionRequestSchema = z.strictObject({
  approve: z.boolean().describe('true aprueba; false rechaza'),
  note: optionalText(1000).describe('Comentario de quien decide'),
});

export const compensationApplyRequestSchema = z.strictObject({
  applied_on: calendarDateSchema.describe('Cuándo se aplicó al cliente'),
});

export const compensationSchema = z.object({
  id: z.uuid(),
  ticket: z.object({ id: z.uuid(), code: z.string() }),
  type: compensationTypeSchema,
  amount: moneySchema.nullable(),
  hours: z.number().nullable(),
  days: z.number().int().nullable(),
  reason: z.string(),
  status: compensationStatusSchema,
  proposed_by: personRefSchema.nullable(),
  decided_by: personRefSchema.nullable(),
  decided_at: dateTimeSchema.nullable(),
  decision_note: z.string().nullable(),
  applied_on: calendarDateSchema.nullable(),
  created_at: dateTimeSchema,
  version: versionSchema,
});

export const compensationListResponseSchema = z.object({ data: z.array(compensationSchema) });

export type SlaPolicyRequest = z.infer<typeof slaPolicyRequestSchema>;
export type SlaPolicy = z.infer<typeof slaPolicySchema>;
export type SlaPolicyListResponse = z.infer<typeof slaPolicyListResponseSchema>;
export type WarrantyRequest = z.infer<typeof warrantyRequestSchema>;
export type Warranty = z.infer<typeof warrantySchema>;
export type WarrantyListQuery = z.infer<typeof warrantyListQuerySchema>;
export type WarrantyListResponse = z.infer<typeof warrantyListResponseSchema>;
export type CompensationRequest = z.infer<typeof compensationRequestSchema>;
export type CompensationDecisionRequest = z.infer<typeof compensationDecisionRequestSchema>;
export type CompensationApplyRequest = z.infer<typeof compensationApplyRequestSchema>;
export type Compensation = z.infer<typeof compensationSchema>;
export type CompensationListResponse = z.infer<typeof compensationListResponseSchema>;
