import { z } from 'zod';

import { calendarDateSchema, dateTimeSchema, moneySchema, personRefSchema } from '../crm/common.js';
import { optionalText, requiredText } from './common.js';

// Lo que sigue a la firma (B24, ficha 17.7): obligaciones e hitos con su responsable y su fecha, y
// otrosíes y prórrogas. Un otrosí lo aprueba la Dirección, tiene su PDF y rige cuando se registra
// su copia firmada; una prórroga la decide la Dirección y rige igual, al registrar la firmada.

export const OBLIGATION_STATUSES = {
  pending: 'Pendiente',
  done: 'Cumplida',
  overdue: 'Vencida',
} as const;

export type ObligationStatus = keyof typeof OBLIGATION_STATUSES;

export const obligationStatusSchema = z.enum(
  Object.keys(OBLIGATION_STATUSES) as [ObligationStatus, ...ObligationStatus[]],
);

export const obligationRequestSchema = z.strictObject({
  description: requiredText(3, 1000, 'Describa la obligación o el hito.'),
  responsible_id: z.uuid().describe('Colaborador que responde por ella'),
  due_on: calendarDateSchema.describe('Fecha en que debe cumplirse'),
});

export const completeObligationRequestSchema = z.strictObject({
  note: optionalText(1000).describe('Cómo se cumplió; opcional'),
});

export const obligationSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  responsible: personRefSchema.nullable(),
  due_on: calendarDateSchema,
  status: obligationStatusSchema,
  done_at: dateTimeSchema.nullable(),
  done_note: z.string().nullable(),
  version: z.number().int().positive(),
});

export const AMENDMENT_KINDS = { amendment: 'Otrosí', extension: 'Prórroga' } as const;

export type AmendmentKind = keyof typeof AMENDMENT_KINDS;

export const amendmentKindSchema = z.enum(
  Object.keys(AMENDMENT_KINDS) as [AmendmentKind, ...AmendmentKind[]],
);

export const AMENDMENT_STATUSES = {
  in_review: 'En revisión',
  approved: 'Aprobado, por firmar',
  in_signature: 'En firma electrónica',
  returned: 'Devuelto',
  signed: 'Firmado y vigente',
} as const;

export type AmendmentStatus = keyof typeof AMENDMENT_STATUSES;

export const amendmentStatusSchema = z.enum(
  Object.keys(AMENDMENT_STATUSES) as [AmendmentStatus, ...AmendmentStatus[]],
);

/** Otrosí: cambia lo acordado. Si cambia la fecha de fin o el valor, se dice aquí. */
export const createAmendmentRequestSchema = z.strictObject({
  summary: requiredText(3, 500, 'Escriba en una línea qué cambia.'),
  body: requiredText(10, 10000, 'Escriba el texto del otrosí.'),
  effective_on: calendarDateSchema.describe('Desde cuándo rige'),
  new_ends_on: calendarDateSchema
    .nullable()
    .default(null)
    .describe('Nueva fecha de fin, si cambia'),
  new_value: moneySchema.nullable().default(null).describe('Nuevo valor total, si cambia'),
});

export const amendmentDecisionRequestSchema = z.strictObject({
  comment: optionalText(2000),
});

export const amendmentSchema = z.object({
  id: z.uuid(),
  code: z.string().describe('Código del contrato más -OT01'),
  kind: amendmentKindSchema,
  status: amendmentStatusSchema,
  summary: z.string(),
  body: z.string(),
  effective_on: calendarDateSchema,
  new_ends_on: calendarDateSchema.nullable(),
  new_value: moneySchema.nullable(),
  author: personRefSchema.nullable(),
  decided_by: personRefSchema.nullable(),
  decision_note: z.string().nullable(),
  pdf_ready: z.boolean(),
  signed_on: calendarDateSchema.nullable(),
  created_at: dateTimeSchema,
  version: z.number().int().positive(),
});

export type ObligationRequest = z.infer<typeof obligationRequestSchema>;
export type CompleteObligationRequest = z.infer<typeof completeObligationRequestSchema>;
export type Obligation = z.infer<typeof obligationSchema>;
export type CreateAmendmentRequest = z.infer<typeof createAmendmentRequestSchema>;
export type AmendmentDecisionRequest = z.infer<typeof amendmentDecisionRequestSchema>;
export type Amendment = z.infer<typeof amendmentSchema>;
