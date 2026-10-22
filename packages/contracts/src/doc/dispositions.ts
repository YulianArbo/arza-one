import { z } from 'zod';

import { retentionDispositionSchema } from './retention.js';

// Contratos de la disposición final (M03, B21; RE-SGC-005, numeral 12.4): cada mes la plataforma
// propone los documentos con la retención vencida. Calidad revisa la propuesta (puede conservar un
// documento con su motivo) y la envía; otra persona la aprueba o la rechaza. La aprobada se ejecuta
// sola: se borra el contenido de los documentos y queda el acta de disposición en PDF.

const dateTime = z.iso.datetime({ offset: true });
const calendarDate = z.iso.date();

export const DISPOSITION_PROPOSAL_STATUSES = {
  review: 'En revisión de Calidad',
  in_approval: 'En aprobación',
  approved: 'Aprobada, en ejecución',
  rejected: 'Rechazada',
  executed: 'Ejecutada',
} as const;

export const DISPOSITION_ACTIONS = {
  destroy: 'Eliminar',
  keep: 'Conservar',
} as const;

export type DispositionProposalStatus = keyof typeof DISPOSITION_PROPOSAL_STATUSES;
export type DispositionAction = keyof typeof DISPOSITION_ACTIONS;

export const dispositionProposalStatusSchema = z
  .enum(
    Object.keys(DISPOSITION_PROPOSAL_STATUSES) as [
      DispositionProposalStatus,
      ...DispositionProposalStatus[],
    ],
  )
  .describe('En revisión, en aprobación, aprobada, rechazada o ejecutada');

export const dispositionActionSchema = z
  .enum(Object.keys(DISPOSITION_ACTIONS) as [DispositionAction, ...DispositionAction[]])
  .describe('Eliminar el documento o conservarlo para siempre');

/** Pasos de la aprobación: quien aprueba la disposición (no quien la envió). */
export const dispositionDecisionSchema = z
  .enum(['approve', 'reject'])
  .describe('Aprobar o rechazar la propuesta');

export type DispositionDecision = z.infer<typeof dispositionDecisionSchema>;

/** Pasos que una persona da sobre la propuesta desde su ficha. */
export const dispositionStepSchema = z.enum(['send', 'approve', 'reject']);

export type DispositionStep = z.infer<typeof dispositionStepSchema>;

/** Código de la propuesta y de su acta: DIS-2026-0001. */
export const dispositionCodeSchema = z.string().regex(/^DIS-\d{4}-\d{4,8}$/u);

const person = z.object({ id: z.uuid(), name: z.string() });

export const dispositionItemSchema = z.object({
  id: z.uuid(),
  document: z.object({
    id: z.uuid(),
    code: z.string(),
    title: z.string(),
    doc_type: z.string(),
    status: z.string().describe('Estado del documento: obsoleto, vigente o eliminado'),
  }),
  rule: z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    disposition: retentionDispositionSchema,
  }),
  due_on: calendarDate.describe('Cuándo venció su retención'),
  action: dispositionActionSchema,
  keep_reason: z.string().nullable(),
  executed_at: dateTime.nullable().describe('Cuándo se eliminó su contenido'),
  version: z.number().int().positive(),
});

export const dispositionProposalSchema = z.object({
  id: z.uuid(),
  code: dispositionCodeSchema,
  period: calendarDate.describe('Mes de la propuesta (su primer día)'),
  status: dispositionProposalStatusSchema,
  to_destroy: z.number().int().nonnegative().describe('Documentos que se eliminan'),
  to_keep: z.number().int().nonnegative().describe('Documentos que se conservan'),
  created_at: dateTime,
  sent_by: person.nullable(),
  sent_at: dateTime.nullable(),
  decided_by: person.nullable(),
  decided_at: dateTime.nullable(),
  decision_note: z.string().nullable(),
  executed_at: dateTime.nullable(),
  has_certificate: z.boolean().describe('El acta de disposición en PDF está lista'),
  workflow_instance_id: z.uuid().nullable().describe('Trámite en el motor de flujos'),
  step: z.string().nullable().describe('Paso actual del trámite'),
  actions: z.array(dispositionStepSchema).describe('Pasos que la persona puede dar ahora'),
  can_edit_items: z.boolean().describe('La persona puede decidir conservar documentos'),
  version: z.number().int().positive(),
});

export const dispositionProposalDetailSchema = dispositionProposalSchema.extend({
  items: z.array(dispositionItemSchema).describe('En orden de código'),
});

export const dispositionListQuerySchema = z.strictObject({
  status: dispositionProposalStatusSchema.optional(),
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const dispositionListResponseSchema = z.object({
  data: z.array(dispositionProposalSchema).describe('De la más reciente a la más antigua'),
  next_cursor: z.uuid().nullable(),
});

export const proposeDispositionsResponseSchema = z.object({
  proposal_id: z
    .uuid()
    .nullable()
    .describe('La propuesta del mes; null si no hay documentos con la retención vencida'),
  created: z.boolean().describe('Se creó ahora; false si ya existía la del mes'),
});

export const dispositionItemDecisionSchema = z
  .strictObject({
    action: dispositionActionSchema,
    keep_reason: z
      .string()
      .trim()
      .min(5)
      .max(500)
      .nullable()
      .describe('Por qué se conserva; obligatorio al conservar'),
  })
  .superRefine((value, context) => {
    if ((value.action === 'keep') !== (value.keep_reason !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['keep_reason'],
        message: 'Escriba el motivo solo cuando decide conservar el documento.',
      });
    }
  });

export const dispositionStepRequestSchema = z.strictObject({
  comment: z
    .string()
    .trim()
    .min(5)
    .max(2000)
    .nullable()
    .default(null)
    .describe('Obligatorio al rechazar'),
});

export type DispositionItem = z.infer<typeof dispositionItemSchema>;
export type DispositionProposal = z.infer<typeof dispositionProposalSchema>;
export type DispositionProposalDetail = z.infer<typeof dispositionProposalDetailSchema>;
export type DispositionListQuery = z.infer<typeof dispositionListQuerySchema>;
export type DispositionListResponse = z.infer<typeof dispositionListResponseSchema>;
export type ProposeDispositionsResponse = z.infer<typeof proposeDispositionsResponseSchema>;
export type DispositionItemDecision = z.infer<typeof dispositionItemDecisionSchema>;
export type DispositionStepRequest = z.infer<typeof dispositionStepRequestSchema>;
