import { dispositionListResponseSchema, retentionRuleListResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { RetentionScenario } from './support/retention-scenario.js';

// Permiso denegado y aislamiento entre empresas de la retención y la disposición final (B21,
// capítulo 21): la tabla de retención es de Calidad; las propuestas las ven y deciden quienes
// aprueban la disposición; nada de una empresa se ve ni se decide desde otra.

const scenario = new RetentionScenario('retención acceso');
let quality: Person;
let proposalId: string;
let itemId: string;
let ruleId: string;
let documentId: string;

beforeAll(async () => {
  await scenario.seed();
  quality = await scenario.quality('calidad-acceso');
  ruleId = await scenario.rule(quality, { doc_type: 'PR' });
  documentId = await scenario.expiredDocument(quality, await scenario.quality('aprueba-acceso'));
  proposalId = (await scenario.propose(quality)).proposal_id ?? '';
  itemId = (await scenario.disposition(quality, proposalId)).items[0]?.id ?? '';
});

function calls(person: Person): (() => PromiseLike<request.Response>)[] {
  const { session } = person;
  return [
    () => scenario.get('/v1/retention-rules', session),
    () => scenario.get('/v1/retention-rules/unassigned-documents', session),
    () => scenario.post('/v1/retention-rules', session, scenario.ruleBody()),
    () => scenario.putJson(`/v1/retention-rules/${ruleId}`, session, {}, 1),
    () => scenario.putJson(`/v1/documents/${documentId}/retention-rule`, session, {}, 1),
    () => scenario.post('/v1/dispositions/propose', session),
    () => scenario.putJson(`/v1/dispositions/${proposalId}/items/${itemId}`, session, {}, 1),
    () => scenario.post(`/v1/dispositions/${proposalId}/actions/send`, session),
  ];
}

function approvalCalls(person: Person): (() => PromiseLike<request.Response>)[] {
  const { session } = person;
  return [
    () => scenario.get('/v1/dispositions', session),
    () => scenario.get(`/v1/dispositions/${proposalId}`, session),
    () => scenario.post(`/v1/dispositions/${proposalId}/actions/approve`, session),
    () => scenario.post(`/v1/dispositions/${proposalId}/certificate`, session),
  ];
}

describe('permiso denegado', () => {
  it('sin rol, desde el portal, el Colaborador y Comercial no tocan retención ni disposición', async () => {
    const people = [
      await scenario.person('sin-rol-retencion', []),
      await scenario.person('portal-retencion', ['CLIENTE_ADMIN'], { kind: 'portal' }),
      await scenario.person('colaborador-retencion', ['COLABORADOR']),
      await scenario.person('comercial-retencion', ['COMERCIAL']),
    ];
    for (const person of people) {
      for (const call of [...calls(person), ...approvalCalls(person)]) {
        expect(errorCode(await call())).toBe('PERMISSION_DENIED');
      }
    }
  });

  it('Dirección ve y decide las propuestas, pero no administra la tabla ni las prepara', async () => {
    const director = await scenario.director();
    for (const call of calls(director)) {
      expect(errorCode(await call())).toBe('PERMISSION_DENIED');
    }
    expect((await scenario.get('/v1/dispositions', director.session)).status).toBe(200);
    expect((await scenario.disposition(director, proposalId)).can_edit_items).toBe(false);
  });

  it('Dirección no aprueba una propuesta que Calidad aún no envía', async () => {
    const director = await scenario.director();
    const early = await scenario.dispositionStep(director, proposalId, 'approve');
    expect(early.status).toBeGreaterThanOrEqual(400);
    expect((await scenario.disposition(quality, proposalId)).status).toBe('review');
  });

  it('el acta no existe mientras la propuesta no se ejecute', async () => {
    const response = await scenario.post(
      `/v1/dispositions/${proposalId}/certificate`,
      quality.session,
    );
    expect(errorCode(response)).toBe('DOC_PDF_NOT_READY');
  });
});

describe('aislamiento entre empresas', () => {
  it('otra empresa no ve, cambia ni decide la tabla y las propuestas de esta', async () => {
    const outsider = await scenario.quality('calidad-otra', scenario.otherTenant.id);
    const rules = await scenario.get('/v1/retention-rules', outsider.session);
    const ruleIds = retentionRuleListResponseSchema.parse(rules.body).data.map((r) => r.id);
    expect(ruleIds).not.toContain(ruleId);
    const proposals = await scenario.get('/v1/dispositions', outsider.session);
    const listed = dispositionListResponseSchema.parse(proposals.body).data.map((p) => p.id);
    expect(listed).not.toContain(proposalId);
    const notFound = [
      await scenario.get(`/v1/dispositions/${proposalId}`, outsider.session),
      await scenario.putJson(
        `/v1/retention-rules/${ruleId}`,
        outsider.session,
        {
          ...scenario.ruleBody(),
          code: undefined,
          is_active: true,
        },
        1,
      ),
      await scenario.putJson(
        `/v1/dispositions/${proposalId}/items/${itemId}`,
        outsider.session,
        { action: 'keep', keep_reason: 'Desde otra empresa' },
        1,
      ),
      await scenario.get(`/v1/documents/${documentId}/retention-rule`, outsider.session),
    ];
    expect(notFound.map(errorCode)).toEqual([
      'DOC_DISPOSITION_NOT_FOUND',
      'DOC_RETENTION_RULE_NOT_FOUND',
      'DOC_DISPOSITION_NOT_FOUND',
      'DOC_DOCUMENT_NOT_FOUND',
    ]);
  });
});

describe('aislamiento entre empresas: propuestas', () => {
  it('la propuesta de otra empresa nunca toma los documentos vencidos de esta', async () => {
    const outsider = await scenario.quality('calidad-propia', scenario.otherTenant.id);
    await scenario.rule(outsider, { doc_type: 'PR' });
    const empty = await scenario.propose(outsider);
    expect(empty).toEqual({ proposal_id: null, created: false });
    const own = await scenario.disposition(quality, proposalId);
    expect(own.code).toMatch(/^DIS-\d{4}-0001$/u);
  });
});
