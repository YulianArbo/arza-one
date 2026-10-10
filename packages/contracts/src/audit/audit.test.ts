import { describe, expect, it } from 'vitest';

import {
  auditEventListQuerySchema,
  auditExportRequestSchema,
  entityHistoryParamsSchema,
} from './audit.js';

describe('contratos de la auditoría', () => {
  it('la consulta trae 25 por página y acepta una acción o su comienzo', () => {
    expect(auditEventListQuerySchema.parse({}).limit).toBe(25);
    expect(auditEventListQuerySchema.safeParse({ action: 'iam.role' }).success).toBe(true);
    expect(auditEventListQuerySchema.safeParse({ action: 'IAM role' }).success).toBe(false);
  });

  it('el cursor es una posición de la cadena y no se aceptan filtros arbitrarios', () => {
    expect(auditEventListQuerySchema.safeParse({ cursor: '120' }).success).toBe(true);
    expect(auditEventListQuerySchema.safeParse({ cursor: '1; DROP' }).success).toBe(false);
    expect(auditEventListQuerySchema.safeParse({ sql: 'x' }).success).toBe(false);
  });

  it('la exportación no lleva página ni cursor', () => {
    expect(auditExportRequestSchema.safeParse({ limit: 10 }).success).toBe(false);
    expect(auditExportRequestSchema.safeParse({ result: 'failure' }).success).toBe(true);
  });

  it('el historial pide un tipo de registro en minúsculas y un identificador', () => {
    const id = '01920000-0000-7000-8000-000000000001';
    expect(entityHistoryParamsSchema.safeParse({ type: 'iam_user', id }).success).toBe(true);
    expect(entityHistoryParamsSchema.safeParse({ type: '../x', id }).success).toBe(false);
  });
});
