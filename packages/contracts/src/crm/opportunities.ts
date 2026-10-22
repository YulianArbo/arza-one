import { z } from 'zod';

import {
  calendarDateSchema,
  crmCatalogCodeSchema,
  dateTimeSchema,
  listLimitSchema,
  moneySchema,
  optionRefSchema,
  optionalNoteSchema,
  personRefSchema,
  versionSchema,
} from './common.js';

// Oportunidades (ficha 17.6): prospección → diagnóstico → propuesta → negociación → ganada o
// perdida. Una oportunidad perdida exige motivo; ganada o perdida ya no cambia.

export const OPPORTUNITY_STAGES = {
  prospecting: 'Prospección',
  diagnosis: 'Diagnóstico',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  won: 'Ganada',
  lost: 'Perdida',
} as const;

export type OpportunityStage = keyof typeof OPPORTUNITY_STAGES;

export const opportunityStageSchema = z
  .enum(Object.keys(OPPORTUNITY_STAGES) as [OpportunityStage, ...OpportunityStage[]])
  .describe('Etapa del embudo');

/** Etapas abiertas, en el orden del embudo; entre ellas se avanza o se retrocede. */
export const OPEN_STAGES = ['prospecting', 'diagnosis', 'proposal', 'negotiation'] as const;

export type OpenStage = (typeof OPEN_STAGES)[number];

export const openStageSchema = z.enum(OPEN_STAGES).describe('Etapa abierta del embudo');

export function isOpenStage(stage: OpportunityStage): stage is OpenStage {
  return OPEN_STAGES.some((open) => open === stage);
}

/** Probabilidad con la que empieza cada etapa; cada oportunidad la puede cambiar (B22). */
export const DEFAULT_PROBABILITY: Readonly<Record<OpportunityStage, number>> = {
  prospecting: 10,
  diagnosis: 25,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0,
};

const probability = z.number().int().min(0).max(100).describe('Probabilidad de ganarla, en %');

const opportunityFields = {
  title: z.string().trim().min(3, 'Escriba al menos tres letras.').max(200),
  estimated_value: moneySchema.describe('Valor estimado en pesos'),
  expected_close: calendarDateSchema.describe('Fecha esperada de cierre'),
  owner_id: z.uuid().nullable().default(null).describe('Responsable; por defecto, quien registra'),
};

export const createOpportunityRequestSchema = z.strictObject({
  party_id: z.uuid().describe('Cliente: persona u organización de Terceros'),
  ...opportunityFields,
  stage: openStageSchema.default('prospecting'),
  probability: probability.nullable().default(null).describe('Vacío: la de la etapa'),
});

export const updateOpportunityRequestSchema = z.strictObject({
  ...opportunityFields,
  probability,
});

export const moveOpportunityRequestSchema = z.strictObject({
  stage: openStageSchema,
  probability: probability.nullable().default(null).describe('Vacío: la de la nueva etapa'),
});

export const loseOpportunityRequestSchema = z.strictObject({
  reason: crmCatalogCodeSchema.describe('Código del catálogo «Motivos de pérdida»'),
  note: optionalNoteSchema,
});

export const opportunitySummarySchema = z.object({
  id: z.uuid(),
  code: z.string().describe('OPO-AAAA-NNNN'),
  title: z.string(),
  party: personRefSchema.describe('Cliente'),
  stage: opportunityStageSchema,
  estimated_value: moneySchema,
  probability,
  weighted_value: moneySchema.describe('Valor por probabilidad'),
  expected_close: calendarDateSchema,
  owner: personRefSchema.nullable(),
  lost_reason: optionRefSchema.nullable(),
  closed_at: dateTimeSchema.nullable(),
  version: versionSchema,
});

export const opportunityDetailSchema = opportunitySummarySchema.extend({
  lead: z.object({ id: z.uuid(), code: z.string() }).nullable(),
  lost_note: z.string().nullable(),
  created_at: dateTimeSchema,
});

export const opportunityListQuerySchema = z.strictObject({
  view: z
    .enum(['open', 'closed', 'all'])
    .default('open')
    .describe('Abiertas (el tablero), cerradas o todas'),
  stage: opportunityStageSchema.optional(),
  owner_id: z.uuid().optional(),
  party_id: z.uuid().optional(),
  q: z.string().trim().min(1).max(120).optional().describe('Busca en código, título y cliente'),
  limit: listLimitSchema,
  cursor: z.uuid().optional(),
});

export const opportunityListResponseSchema = z.object({
  data: z.array(opportunitySummarySchema),
  next_cursor: z.uuid().nullable(),
});

export type CreateOpportunityRequest = z.infer<typeof createOpportunityRequestSchema>;
export type UpdateOpportunityRequest = z.infer<typeof updateOpportunityRequestSchema>;
export type MoveOpportunityRequest = z.infer<typeof moveOpportunityRequestSchema>;
export type LoseOpportunityRequest = z.infer<typeof loseOpportunityRequestSchema>;
export type OpportunitySummary = z.infer<typeof opportunitySummarySchema>;
export type OpportunityDetail = z.infer<typeof opportunityDetailSchema>;
export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;
export type OpportunityListResponse = z.infer<typeof opportunityListResponseSchema>;
