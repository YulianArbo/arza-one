import { unassignedDocumentsResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { RetentionScenario } from './support/retention-scenario.js';

// Tabla de retención (B21, RE-SGC-005): reglas por tipo, proceso o los dos; la más específica gana;
// una excepción por documento; el plazo corre desde que el documento del SGC queda obsoleto.

const scenario = new RetentionScenario('tabla de retención');
let quality: Person;
let approver: Person;

beforeAll(async () => {
  await scenario.seed();
  quality = await scenario.quality('calidad-reglas');
  approver = await scenario.quality('aprueba-reglas');
});

describe('reglas de retención', () => {
  it('la regla más específica gana y se cuentan los documentos sin regla', async () => {
    const id = await scenario.createDocument(quality, { doc_type: 'IN' });
    const before = await scenario.rules(quality);
    expect(before.unassigned_documents).toBeGreaterThan(0);
    const unassigned = await scenario.get(
      '/v1/retention-rules/unassigned-documents',
      quality.session,
    );
    const listed = unassignedDocumentsResponseSchema.parse(unassigned.body);
    expect(listed.data.map((row) => row.id)).toContain(id);
    const byType = await scenario.rule(quality, { doc_type: 'IN', name: 'Instructivos' });
    const sgc = await scenario.processId('SGC');
    const byBoth = await scenario.rule(quality, { doc_type: 'IN', process_id: sgc });
    expect((await scenario.retentionOf(quality, id)).rule?.id).toBe(byBoth);
    const after = await scenario.rules(quality);
    expect(after.unassigned_documents).toBe(before.unassigned_documents - 1);
    const counts = new Map(after.data.map((rule) => [rule.id, rule.documents]));
    expect(counts.get(byBoth)).toBe(1);
    expect(counts.get(byType)).toBe(0);
  });

  it('el código y el tipo con proceso de una regla activa no se repiten', async () => {
    const body = scenario.ruleBody({ doc_type: 'MN' });
    expect((await scenario.post('/v1/retention-rules', quality.session, body)).status).toBe(201);
    const sameCode = await scenario.post('/v1/retention-rules', quality.session, body);
    expect(errorCode(sameCode)).toBe('DOC_RETENTION_RULE_CONFLICT');
    const sameTarget = scenario.ruleBody({ doc_type: 'MN' });
    const again = await scenario.post('/v1/retention-rules', quality.session, sameTarget);
    expect(errorCode(again)).toBe('DOC_RETENTION_RULE_CONFLICT');
  });
});

describe('reglas de retención: referencias y edición', () => {
  it('un tipo o un proceso que no existe no sirve', async () => {
    const badType = scenario.ruleBody({ doc_type: 'ZZ' });
    const response = await scenario.post('/v1/retention-rules', quality.session, badType);
    expect(errorCode(response)).toBe('DOC_REFERENCE_INVALID');
    const badProcess = scenario.ruleBody({
      doc_type: null,
      process_id: '01900000-0000-7000-8000-000000000999',
    });
    const other = await scenario.post('/v1/retention-rules', quality.session, badProcess);
    expect(errorCode(other)).toBe('DOC_REFERENCE_INVALID');
  });

  it('editar exige la versión vista; una regla inactiva deja de aplicarse', async () => {
    const id = await scenario.createDocument(quality, { doc_type: 'PT' });
    const ruleId = await scenario.rule(quality, { doc_type: 'PT', name: 'Protocolos' });
    expect((await scenario.retentionOf(quality, id)).rule?.id).toBe(ruleId);
    const edit = {
      ...scenario.ruleBody({ doc_type: 'PT', name: 'Protocolos técnicos' }),
      code: undefined,
      is_active: false,
    };
    const stale = await scenario.putJson(`/v1/retention-rules/${ruleId}`, quality.session, edit, 9);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const done = await scenario.putJson(`/v1/retention-rules/${ruleId}`, quality.session, edit, 1);
    expect(done.status, done.text).toBe(204);
    expect((await scenario.retentionOf(quality, id)).rule).toBeNull();
    expect(await scenario.auditActions(ruleId)).toEqual([
      'doc.retention_rule.create',
      'doc.retention_rule.update',
    ]);
  });
});

describe('retención de un documento', () => {
  it('un documento del SGC vigente no vence; obsoleto, vence según sus años', async () => {
    await scenario.rule(quality, { doc_type: 'PR', active_years: 1, archive_years: 2 });
    const id = await scenario.createDocument(quality);
    await scenario.publishLatest(quality, approver, id);
    const current = await scenario.retentionOf(quality, id);
    expect(current.rule?.code).toMatch(/^R-/u);
    expect(current).toMatchObject({ base_on: null, due_on: null, expired: false });
    const obsolete = await scenario.obsoleteDocument(quality, approver);
    const fresh = await scenario.retentionOf(quality, obsolete);
    expect(fresh.base_on).not.toBeNull();
    expect(fresh.expired).toBe(false);
    const base = new Date(`${fresh.base_on ?? ''}T00:00:00Z`);
    expect(fresh.due_on).toBe(
      `${String(base.getUTCFullYear() + 3)}${fresh.base_on?.slice(4) ?? ''}`,
    );
    await scenario.age(obsolete, 4);
    expect((await scenario.retentionOf(quality, obsolete)).expired).toBe(true);
  });
});

describe('retención de un documento: excepciones', () => {
  it('Calidad le da otra regla como excepción y puede volver a la de su tipo', async () => {
    const id = await scenario.createDocument(quality, { doc_type: 'PL' });
    const general = await scenario.rule(quality, { doc_type: 'PL', name: 'Planes' });
    const special = await scenario.rule(quality, {
      doc_type: 'DC',
      name: 'Planes estratégicos',
      active_years: 5,
      archive_years: 20,
      disposition: 'keep',
    });
    const seen = await scenario.retentionOf(quality, id);
    const set = await scenario.putJson(
      `/v1/documents/${id}/retention-rule`,
      quality.session,
      { retention_rule_id: special },
      seen.version,
    );
    expect(set.status, set.text).toBe(204);
    const exception = await scenario.retentionOf(quality, id);
    expect(exception).toMatchObject({ explicit: true, rule: { id: special, disposition: 'keep' } });
    const reset = await scenario.putJson(
      `/v1/documents/${id}/retention-rule`,
      quality.session,
      { retention_rule_id: null },
      exception.version,
    );
    expect(reset.status, reset.text).toBe(204);
    expect((await scenario.retentionOf(quality, id)).rule?.id).toBe(general);
    expect(await scenario.auditActions(id)).toContain('doc.document.retention_rule');
  });
});

describe('retención de un documento: reglas que no existen', () => {
  it('una regla inexistente no sirve como excepción', async () => {
    const id = await scenario.createDocument(quality, { doc_type: 'MP' });
    const seen = await scenario.retentionOf(quality, id);
    const response = await scenario.putJson(
      `/v1/documents/${id}/retention-rule`,
      quality.session,
      { retention_rule_id: '01900000-0000-7000-8000-000000000998' },
      seen.version,
    );
    expect(errorCode(response)).toBe('DOC_RETENTION_RULE_NOT_FOUND');
  });
});
