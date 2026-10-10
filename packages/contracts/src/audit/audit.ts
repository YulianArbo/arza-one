import { z } from 'zod';

// Contratos de la auditoría (M19, B11): consulta, historial de un registro, eventos de seguridad,
// exportación y verificación de la cadena (numeral 14.4).

const dateTime = z.iso.datetime({ offset: true });

/** Códigos estables de los errores de la auditoría (numeral 14.2). */
export const AUDIT_ERROR_CODES = {
  exportTooLarge: 'AUDIT_EXPORT_TOO_LARGE',
} as const;

/** Posición de un evento en la cadena de su empresa; sirve de cursor. */
const seqCursor = z.string().regex(/^\d{1,18}$/, 'Cursor inválido');

const pageLimit = z.coerce.number().int().min(1).max(100).default(25);

export const auditResultSchema = z.enum(['success', 'failure']).describe('Éxito o fallo');

/** Filtros de la consulta y de la exportación; nunca filtros arbitrarios (numeral 14.1). */
const auditFilterFields = {
  from: dateTime.optional().describe('Desde este instante, incluido'),
  to: dateTime.optional().describe('Hasta este instante, excluido'),
  actor_id: z.uuid().optional().describe('Quién actuó'),
  action: z
    .string()
    .trim()
    .regex(/^[a-z]+(\.[a-z_]+)*$/, 'Acción inválida')
    .max(80)
    .optional()
    .describe('Acción o comienzo de la acción, por ejemplo «iam.role» o «iam.role.update»'),
  entity_type: z.string().trim().min(1).max(60).optional(),
  entity_id: z.uuid().optional(),
  result: auditResultSchema.optional(),
};

const auditFilterSchema = z.strictObject(auditFilterFields);

export const auditEventListQuerySchema = z.strictObject({
  ...auditFilterFields,
  limit: pageLimit,
  cursor: seqCursor.optional().describe('next_cursor de la página anterior'),
});

const actorSchema = z.object({
  kind: z.enum(['user', 'system', 'anonymous']).describe('Una persona, el sistema o sin sesión'),
  id: z.uuid().nullable(),
  email: z.email().nullable(),
  display_name: z.string().nullable(),
});

export const auditEventSchema = z.object({
  id: z.uuid(),
  seq: z.number().int().describe('Posición en la cadena de la empresa'),
  occurred_at: dateTime,
  actor: actorSchema,
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.uuid().nullable(),
  result: auditResultSchema,
  changes: z
    .record(z.string(), z.unknown())
    .describe('Valor anterior y nuevo; en campos restringidos, solo que cambió'),
  ip: z.string().nullable(),
  correlation_id: z.string().nullable(),
  hash: z.string(),
});

export const auditEventListResponseSchema = z.object({
  data: z.array(auditEventSchema),
  next_cursor: seqCursor.nullable(),
});

export const entityHistoryQuerySchema = z.strictObject({
  limit: pageLimit,
  cursor: seqCursor.optional(),
});

export const entityHistoryParamsSchema = z.strictObject({
  type: z
    .string()
    .regex(/^[a-z][a-z_]{0,59}$/, 'Tipo inválido')
    .describe('Tipo de registro, por ejemplo «iam_user»'),
  id: z.uuid(),
});

export const securitySeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const securityEventListQuerySchema = z.strictObject({
  from: dateTime.optional(),
  to: dateTime.optional(),
  severity: securitySeveritySchema.optional(),
  user_id: z.uuid().optional(),
  limit: pageLimit,
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
});

export const securityEventSchema = z.object({
  id: z.uuid(),
  occurred_at: dateTime,
  type: z.string(),
  severity: securitySeveritySchema,
  user: actorSchema.omit({ kind: true }).nullable(),
  ip: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
});

export const securityEventListResponseSchema = z.object({
  data: z.array(securityEventSchema),
  next_cursor: z.uuid().nullable(),
});

/** Máximo de eventos por exportación mientras se descarga en el acto (hasta B14). */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

export const auditExportRequestSchema = auditFilterSchema;

export const auditExportSchema = z.object({
  id: z.uuid(),
  requested_by: actorSchema.omit({ kind: true }),
  scope: z.record(z.string(), z.unknown()).describe('Filtros con que se exportó'),
  row_count: z.number().int(),
  exported_at: dateTime,
});

export const auditExportListQuerySchema = z.strictObject({
  limit: pageLimit,
  cursor: z.uuid().optional(),
});

export const auditExportListResponseSchema = z.object({
  data: z.array(auditExportSchema),
  next_cursor: z.uuid().nullable(),
});

export const chainProblemSchema = z
  .enum(['missing', 'altered', 'broken_link', 'truncated'])
  .describe(
    'missing: falta o sobra un evento; altered: el evento cambió; broken_link: no apunta al ' +
      'anterior; truncated: se borraron los últimos',
  );

export const chainVerificationSchema = z.object({
  intact: z.boolean(),
  checked: z.number().int().describe('Eventos revisados'),
  broken_seq: z.number().int().nullable().describe('Primer lugar dañado'),
  problem: chainProblemSchema.nullable(),
  verified_at: dateTime,
});

export type AuditResult = z.infer<typeof auditResultSchema>;
export type AuditFilter = z.infer<typeof auditFilterSchema>;
export type AuditEventListQuery = z.infer<typeof auditEventListQuerySchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditEventListResponse = z.infer<typeof auditEventListResponseSchema>;
export type EntityHistoryQuery = z.infer<typeof entityHistoryQuerySchema>;
export type EntityHistoryParams = z.infer<typeof entityHistoryParamsSchema>;
export type SecuritySeverity = z.infer<typeof securitySeveritySchema>;
export type SecurityEventListQuery = z.infer<typeof securityEventListQuerySchema>;
export type SecurityEvent = z.infer<typeof securityEventSchema>;
export type SecurityEventListResponse = z.infer<typeof securityEventListResponseSchema>;
export type AuditExportRequest = z.infer<typeof auditExportRequestSchema>;
export type AuditExport = z.infer<typeof auditExportSchema>;
export type AuditExportListQuery = z.infer<typeof auditExportListQuerySchema>;
export type AuditExportListResponse = z.infer<typeof auditExportListResponseSchema>;
export type ChainProblem = z.infer<typeof chainProblemSchema>;
export type ChainVerification = z.infer<typeof chainVerificationSchema>;
