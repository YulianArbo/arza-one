import { describe, expect, it } from 'vitest';

import {
  createRetentionRuleSchema,
  dispositionItemDecisionSchema,
  documentSearchQuerySchema,
  updateRetentionRuleSchema,
} from '../index.js';

const PROCESS = '01900000-0000-7000-8000-000000000002';

const FIELDS = {
  name: 'Contratos con clientes',
  doc_type: 'CT',
  process_id: null,
  active_years: 2,
  archive_years: 8,
  disposition: 'destroy',
  legal_basis: 'Ley 962 de 2005, art. 28',
};

const RULE = { code: 'con-01', ...FIELDS };

describe('Tabla de retención (RE-SGC-005)', () => {
  it('una regla lleva su serie, sus años y su disposición; el código va en mayúsculas', () => {
    const parsed = createRetentionRuleSchema.parse(RULE);
    expect(parsed.code).toBe('CON-01');
  });

  it('se aplica a un tipo, a un proceso o a los dos, nunca a nada', () => {
    const byProcess = { ...RULE, doc_type: null, process_id: PROCESS };
    expect(createRetentionRuleSchema.safeParse(byProcess).success).toBe(true);
    const nothing = { ...RULE, doc_type: null, process_id: null };
    expect(createRetentionRuleSchema.safeParse(nothing).success).toBe(false);
  });

  it('la retención suma por lo menos un año y a lo más cien por archivo', () => {
    const zero = { ...RULE, active_years: 0, archive_years: 0 };
    expect(createRetentionRuleSchema.safeParse(zero).success).toBe(false);
    const tooLong = { ...RULE, active_years: 101 };
    expect(createRetentionRuleSchema.safeParse(tooLong).success).toBe(false);
  });

  it('el código no cambia al editar; la regla se puede desactivar', () => {
    const fields = { ...FIELDS, is_active: false };
    expect(updateRetentionRuleSchema.safeParse(fields).success).toBe(true);
    expect(updateRetentionRuleSchema.safeParse({ ...RULE, is_active: true }).success).toBe(false);
  });
});

describe('Disposición final', () => {
  it('conservar un documento exige el motivo; eliminarlo no lo lleva', () => {
    const keep = { action: 'keep', keep_reason: 'Tiene valor histórico.' };
    expect(dispositionItemDecisionSchema.safeParse(keep).success).toBe(true);
    const keepWithout = { action: 'keep', keep_reason: null };
    expect(dispositionItemDecisionSchema.safeParse(keepWithout).success).toBe(false);
    const destroyWith = { action: 'destroy', keep_reason: 'Sobra este texto.' };
    expect(dispositionItemDecisionSchema.safeParse(destroyWith).success).toBe(false);
  });
});

describe('Búsqueda de documentos', () => {
  it('pide por lo menos dos letras y a lo más 50 resultados', () => {
    expect(documentSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(documentSearchQuerySchema.parse({ q: ' gestión ' })).toEqual({
      q: 'gestión',
      limit: 20,
    });
    expect(documentSearchQuerySchema.safeParse({ q: 'pr', limit: '51' }).success).toBe(false);
  });
});
