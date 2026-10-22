import { z } from 'zod';

import { calendarDateSchema, dateTimeSchema, moneySchema, optionRefSchema } from './common.js';
import { opportunityStageSchema } from './opportunities.js';

// Informe del embudo, RE-COM-001 Registro de Oportunidades (B22). El formato original no está en el
// repositorio: el dueño del producto aprobó estas columnas el 22/10/2026.

export const funnelQuerySchema = z
  .strictObject({
    from: calendarDateSchema.optional().describe('Oportunidades creadas desde este día'),
    to: calendarDateSchema.optional().describe('Hasta este día, incluido'),
    owner_id: z.uuid().optional(),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la inicial.',
  });

export const funnelStageSchema = z.object({
  stage: opportunityStageSchema,
  label: z.string(),
  count: z.number().int(),
  value: moneySchema,
  weighted_value: moneySchema,
});

export const funnelRowStatusSchema = z.enum(['open', 'won', 'lost']).describe('Estado');

/** Una fila del RE-COM-001. */
export const funnelRowSchema = z.object({
  code: z.string(),
  created_on: calendarDateSchema,
  client: z.string(),
  title: z.string(),
  stage: opportunityStageSchema,
  estimated_value: moneySchema,
  probability: z.number().int(),
  weighted_value: moneySchema,
  expected_close: calendarDateSchema,
  owner: z.string().nullable(),
  status: funnelRowStatusSchema,
  lost_reason: z.string().nullable(),
  closed_on: calendarDateSchema.nullable(),
});

export const funnelTotalsSchema = z.object({
  open_count: z.number().int(),
  open_value: moneySchema,
  weighted_value: moneySchema.describe('Suma del valor por probabilidad de las abiertas'),
  won_count: z.number().int(),
  won_value: moneySchema,
  lost_count: z.number().int(),
  lost_value: moneySchema,
  win_rate: z.number().nullable().describe('Ganadas sobre cerradas, en %; vacío sin cerradas'),
  leads_count: z.number().int().describe('Prospectos del periodo'),
  converted_leads: z.number().int(),
  lead_conversion_rate: z.number().nullable().describe('Convertidos sobre prospectos, en %'),
});

export const funnelReportSchema = z.object({
  generated_at: dateTimeSchema,
  stages: z.array(funnelStageSchema),
  totals: funnelTotalsSchema,
  lost_reasons: z.array(optionRefSchema.extend({ count: z.number().int(), value: moneySchema })),
  rows: z.array(funnelRowSchema),
});

export type FunnelQuery = z.infer<typeof funnelQuerySchema>;
export type FunnelStage = z.infer<typeof funnelStageSchema>;
export type FunnelRow = z.infer<typeof funnelRowSchema>;
export type FunnelRowStatus = z.infer<typeof funnelRowStatusSchema>;
export type FunnelTotals = z.infer<typeof funnelTotalsSchema>;
export type FunnelReport = z.infer<typeof funnelReportSchema>;
