import { z } from 'zod';

import {
  qmsDateSchema,
  qmsEnumOf,
  qmsIdSchema,
  qmsOptionalText,
  qmsRefSchema,
  qmsTextSchema,
} from './common.js';

// Acciones correctivas y de mejora (B38, ficha 17.15; FT-SGC-005) y su bitácora (RE-SGC-002,
// decisión 10). Cada acción tiene responsable y fecha; quien responde la marca ejecutada con su
// evidencia y alguien distinto verifica su eficacia (decisión 8). Las vencidas escalan a la
// Dirección (decisión 11). Desde B39 también nacen de un hallazgo de auditoría (observación u
// oportunidad de mejora) o de una decisión de la revisión por la dirección; esas las crea la
// plataforma, no el formulario de acciones.

export const ACTION_ORIGINS = {
  nonconformity: 'No conformidad',
  risk: 'Riesgo u oportunidad',
  improvement: 'Mejora',
  audit: 'Hallazgo de auditoría',
  management_review: 'Revisión por la dirección',
  /** B46: un requisito del normograma evaluado como parcial o no cumplido. */
  legal_evaluation: 'Evaluación del cumplimiento legal',
} as const;
export type ActionOrigin = keyof typeof ACTION_ORIGINS;
export const actionOriginSchema = qmsEnumOf(ACTION_ORIGINS);

/** La de una no conformidad es correctiva; las demás, de mejora. */
export const ACTION_TYPES = { corrective: 'Correctiva', improvement: 'De mejora' } as const;
export type ActionType = keyof typeof ACTION_TYPES;
export const actionTypeSchema = qmsEnumOf(ACTION_TYPES);

export function actionTypeOf(origin: ActionOrigin): ActionType {
  return origin === 'nonconformity' ? 'corrective' : 'improvement';
}

export const ACTION_STATUSES = {
  open: 'Abierta',
  executed: 'Ejecutada, por verificar',
  effective: 'Eficaz',
  ineffective: 'No eficaz',
} as const;
export type ActionStatus = keyof typeof ACTION_STATUSES;
export const actionStatusSchema = qmsEnumOf(ACTION_STATUSES);

export const actionOriginRefSchema = z.object({ id: qmsIdSchema, code: z.string() });

/** Una fila de la bitácora de acciones (RE-SGC-002). */
export const qmsActionSchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  opened_on: qmsDateSchema,
  origin_type: actionOriginSchema,
  origin: actionOriginRefSchema.nullable(),
  process: qmsRefSchema.nullable(),
  finding: z.string().nullable(),
  root_cause: z.string().nullable(),
  action_type: actionTypeSchema,
  description: z.string(),
  responsible: qmsRefSchema,
  due_on: qmsDateSchema,
  executed_on: qmsDateSchema.nullable(),
  evidence_note: z.string().nullable(),
  evidence_file_id: qmsIdSchema.nullable(),
  status: actionStatusSchema,
  overdue: z.boolean(),
  verified_on: qmsDateSchema.nullable(),
  verified_by: qmsRefSchema.nullable(),
  verification_note: z.string().nullable(),
  notes: z.string().nullable(),
  version: z.number().int().positive(),
});
export const qmsActionListResponseSchema = z.object({ data: z.array(qmsActionSchema) });

export const actionQuerySchema = z.strictObject({
  status: actionStatusSchema.optional(),
  origin_type: actionOriginSchema.optional(),
});

/** Orígenes que Calidad registra a mano en la bitácora. */
export const manualActionOriginSchema = z.enum(['nonconformity', 'risk', 'improvement']);

export const createQmsActionSchema = z
  .strictObject({
    origin_type: manualActionOriginSchema,
    origin_id: qmsIdSchema.nullable().default(null),
    process_id: qmsIdSchema.nullable().default(null),
    description: qmsTextSchema(5, 2000).describe('Qué se hará'),
    responsible_id: qmsIdSchema.describe('Cuenta de quien responde por la acción'),
    due_on: qmsDateSchema.describe('Fecha compromiso'),
    notes: qmsOptionalText(1000),
  })
  .refine((input) => (input.origin_type === 'improvement') === (input.origin_id === null), {
    path: ['origin_id'],
    message: 'Indique la no conformidad o el riesgo; una mejora no lleva origen.',
  });

export const updateQmsActionSchema = z.strictObject({
  description: qmsTextSchema(5, 2000),
  responsible_id: qmsIdSchema,
  due_on: qmsDateSchema,
  notes: qmsOptionalText(1000),
});

export const executeQmsActionSchema = z.strictObject({
  executed_on: qmsDateSchema,
  evidence_note: qmsTextSchema(5, 2000).describe('Qué se hizo y dónde está la evidencia'),
  evidence_file_id: qmsIdSchema.nullable().default(null),
});

export const verifyQmsActionSchema = z.strictObject({
  effective: z.boolean().describe('¿La acción eliminó la causa?'),
  verified_on: qmsDateSchema,
  note: qmsTextSchema(5, 1000).describe('Cómo se verificó'),
});

/** Columnas de la bitácora descargable, en el orden de RE-SGC-002 (por validar). */
export const ACTION_LOG_COLUMNS = [
  'Código',
  'Fecha de apertura',
  'Origen',
  'Código del origen',
  'Proceso',
  'Hallazgo',
  'Causa raíz',
  'Acción',
  'Tipo',
  'Responsable',
  'Fecha compromiso',
  'Fecha de ejecución',
  'Estado',
  'Verificó',
  'Fecha de verificación',
  'Resultado de la verificación',
  'Observaciones',
] as const;

export type QmsAction = z.infer<typeof qmsActionSchema>;
export type CreateQmsAction = z.infer<typeof createQmsActionSchema>;
export type UpdateQmsAction = z.infer<typeof updateQmsActionSchema>;
export type ExecuteQmsAction = z.infer<typeof executeQmsActionSchema>;
export type VerifyQmsAction = z.infer<typeof verifyQmsActionSchema>;
