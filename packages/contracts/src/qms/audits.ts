import { z } from 'zod';

import {
  qmsDateSchema,
  qmsEnumOf,
  qmsIdSchema,
  qmsOptionalText,
  qmsRefSchema,
  qmsTextSchema,
} from './common.js';

// Programa y auditorías internas (B39; PL-SGC-001, PL-SGC-002, RE-SGC-003 y RE-SGC-004). Calidad
// publica el programa anual (decisión 4) y asigna cada auditoría a un colaborador, que la ejecuta
// (decisión 1). Un auditor no audita su propio proceso (decisión 2). Los hallazgos de no
// conformidad abren su no conformidad; las observaciones y oportunidades de mejora pueden volverse
// una acción de mejora (decisión 3).

export const AUDIT_PROGRAM_STATUSES = { draft: 'Borrador', published: 'Publicado' } as const;
export type AuditProgramStatus = keyof typeof AUDIT_PROGRAM_STATUSES;
export const auditProgramStatusSchema = qmsEnumOf(AUDIT_PROGRAM_STATUSES);

export const AUDIT_STATUSES = {
  planned: 'Programada',
  in_progress: 'En ejecución',
  reported: 'Informe emitido',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
} as const;
export type AuditStatus = keyof typeof AUDIT_STATUSES;
export const auditStatusSchema = qmsEnumOf(AUDIT_STATUSES);

export type AuditStep = 'start' | 'checklist' | 'finding' | 'report' | 'close' | 'cancel';

const AUDIT_STEP_FROM: Readonly<Record<AuditStep, readonly AuditStatus[]>> = {
  start: ['planned'],
  checklist: ['in_progress'],
  finding: ['in_progress'],
  report: ['in_progress'],
  close: ['reported'],
  cancel: ['planned', 'in_progress'],
};

export function canAuditStep(step: AuditStep, status: AuditStatus): boolean {
  return AUDIT_STEP_FROM[step].includes(status);
}

/** Resultado de cada pregunta de la lista de chequeo (RE-SGC-003). */
export const CHECKLIST_RESULTS = {
  conforming: 'Conforme',
  nonconforming: 'No conforme',
  observation: 'Observación',
  not_evaluated: 'No evaluado',
} as const;
export const checklistResultSchema = qmsEnumOf(CHECKLIST_RESULTS);

/** Decisión 3. */
export const FINDING_TYPES = {
  major: 'No conformidad mayor',
  minor: 'No conformidad menor',
  observation: 'Observación',
  opportunity: 'Oportunidad de mejora',
} as const;
export type FindingType = keyof typeof FINDING_TYPES;
export const findingTypeSchema = qmsEnumOf(FINDING_TYPES);

/** Los hallazgos de no conformidad abren su no conformidad al emitir el informe. */
export function findingOpensNonconformity(type: FindingType): boolean {
  return type === 'major' || type === 'minor';
}

export const saveAuditProgramSchema = z.strictObject({
  year: z.number().int().min(2020).max(2100),
  objectives: qmsTextSchema(10, 2000).describe('Objetivos del programa'),
  scope: qmsTextSchema(5, 2000).describe('Alcance: procesos y sedes'),
  criteria: qmsTextSchema(5, 1000).describe('Criterios: norma y documentos de referencia'),
});

export const auditChecklistItemSchema = z.strictObject({
  requirement: qmsTextSchema(2, 200).describe('Requisito o numeral, como «ISO 9001 8.5.1»'),
  question: qmsTextSchema(5, 500),
  result: checklistResultSchema.default('not_evaluated'),
  evidence: qmsOptionalText(1000),
});

export const saveChecklistSchema = z.strictObject({
  items: z.array(auditChecklistItemSchema).min(1).max(80),
});

export const planAuditSchema = z.strictObject({
  program_id: qmsIdSchema,
  process_id: qmsIdSchema,
  auditor_id: qmsIdSchema.describe('Cuenta de quien audita; no puede ser de ese proceso'),
  planned_on: qmsDateSchema,
  objective: qmsTextSchema(5, 1000),
  criteria: qmsOptionalText(1000),
});

export const startAuditSchema = z.strictObject({ started_on: qmsDateSchema });

export const addFindingSchema = z.strictObject({
  type: findingTypeSchema,
  requirement: qmsTextSchema(2, 200).describe('Requisito incumplido o que se puede mejorar'),
  description: qmsTextSchema(10, 2000),
  evidence: qmsTextSchema(5, 2000).describe('Evidencia objetiva'),
});

export const reportAuditSchema = z.strictObject({
  reported_on: qmsDateSchema,
  conclusions: qmsTextSchema(10, 4000).describe('Conclusiones del informe'),
});

export const cancelAuditSchema = z.strictObject({ reason: qmsTextSchema(5, 1000) });

/** Una observación o una oportunidad de mejora que Calidad convierte en acción de mejora. */
export const findingActionSchema = z.strictObject({
  description: qmsTextSchema(5, 2000),
  responsible_id: qmsIdSchema,
  due_on: qmsDateSchema,
});

export const codeRefSchema = z.object({ id: qmsIdSchema, code: z.string() });

export const auditFindingSchema = z.object({
  id: qmsIdSchema,
  audit: codeRefSchema,
  process: qmsRefSchema,
  type: findingTypeSchema,
  requirement: z.string(),
  description: z.string(),
  evidence: z.string(),
  nonconformity: codeRefSchema.nullable(),
  action: codeRefSchema.nullable(),
});
export const auditFindingListResponseSchema = z.object({ data: z.array(auditFindingSchema) });

export const auditSummarySchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  program_id: qmsIdSchema,
  process: qmsRefSchema,
  auditor: qmsRefSchema,
  planned_on: qmsDateSchema,
  status: auditStatusSchema,
  findings: z.number().int(),
  version: z.number().int().positive(),
});

export const auditSchema = auditSummarySchema.extend({
  objective: z.string(),
  criteria: z.string().nullable(),
  started_on: qmsDateSchema.nullable(),
  reported_on: qmsDateSchema.nullable(),
  conclusions: z.string().nullable(),
  cancel_reason: z.string().nullable(),
  checklist: z.array(
    auditChecklistItemSchema.extend({ evidence: z.string().nullable() }).required({ result: true }),
  ),
  report_document_id: qmsIdSchema.nullable(),
});

export const auditDetailResponseSchema = z.object({
  audit: auditSchema,
  findings: z.array(auditFindingSchema),
});

export const auditProgramSchema = z.object({
  id: qmsIdSchema,
  year: z.number().int(),
  objectives: z.string(),
  scope: z.string(),
  criteria: z.string(),
  status: auditProgramStatusSchema,
  audits: z.array(auditSummarySchema),
  version: z.number().int().positive(),
});
export const auditProgramListResponseSchema = z.object({ data: z.array(auditProgramSchema) });
export const auditListResponseSchema = z.object({ data: z.array(auditSummarySchema) });

export type SaveAuditProgram = z.infer<typeof saveAuditProgramSchema>;
export type AuditProgram = z.infer<typeof auditProgramSchema>;
export type PlanAudit = z.infer<typeof planAuditSchema>;
export type StartAudit = z.infer<typeof startAuditSchema>;
export type SaveChecklist = z.infer<typeof saveChecklistSchema>;
export type AuditChecklistItem = z.infer<typeof auditChecklistItemSchema>;
export type AddFinding = z.infer<typeof addFindingSchema>;
export type ReportAudit = z.infer<typeof reportAuditSchema>;
export type CancelAudit = z.infer<typeof cancelAuditSchema>;
export type FindingAction = z.infer<typeof findingActionSchema>;
export type AuditFinding = z.infer<typeof auditFindingSchema>;
export type AuditSummary = z.infer<typeof auditSummarySchema>;
export type Audit = z.infer<typeof auditSchema>;
export type AuditDetailResponse = z.infer<typeof auditDetailResponseSchema>;
