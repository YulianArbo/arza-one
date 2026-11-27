import { aiStatusSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { runTenantExportWork } from '../../../src/modules/tenancy/index.js';
import { enable } from '../ai/support/ai-fixture.js';
import { storage } from '../doc/support/file-scenario.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import { exportsOf, requestExport } from './support/export-steps.js';
import { card, operator, sendAs } from './support/tenancy-fixture.js';

// Bordes de multiempresa (B48): el plan Básico no incluye el asistente de IA, y una exportación
// que falla queda «fallida» para la Dirección sin esconder el error al worker.

const s = new AccessScenario('plan y fallas');

const BASIC = {
  plan: 'basic',
  max_internal_users: 200,
  max_portal_users: null,
  storage_mb: null,
  ai_assistant: null,
};

describe('el plan decide el asistente', () => {
  it('con el plan Básico el asistente no tiene usos y no responde', async () => {
    const officer = await s.person('oficial-plan', ['OFICIAL_DATOS']);
    await enable(s, officer, ['doc_search']);
    const worker = await s.person('colaborador-plan', ['COLABORADOR']);
    const before = aiStatusSchema.parse((await s.get('/v1/ai/status', worker.session)).body);
    expect(before.enabled_use_cases).toContain('doc_search');

    const op = await operator(s, 'operador-plan-ia');
    const { version } = await card(s, op, s.tenant.id);
    const path = `/v1/platform/tenants/${s.tenant.id}/plan`;
    const changed = await sendAs(s, 'put', path, op.session, { body: BASIC, version });
    expect(changed.status, changed.text).toBe(204);

    const after = aiStatusSchema.parse((await s.get('/v1/ai/status', worker.session)).body);
    expect(after.enabled_use_cases).toEqual([]);
    const asked = await s.post('/v1/ai/search', worker.session, {
      question: '¿Cómo pido vacaciones?',
    });
    expect(asked.status).toBe(409);
    expect(errorCode(asked)).toBe('PLAN_LIMIT_REACHED');
  });
});

describe('exportación que falla', () => {
  it('queda «fallida» para la Dirección y el worker informa el error', async () => {
    const boss = await s.person('direccion-falla', ['DIRECCION'], { tenantId: s.otherTenant.id });
    const id = await requestExport(s, boss);
    const real = storage();
    const broken = {
      list: () => Promise.reject(new Error('Almacenamiento no disponible')),
      stream: real.stream.bind(real),
      put: real.put.bind(real),
      delete: real.delete.bind(real),
    };
    const work = runTenantExportWork({ database: apiDatabase(), clock: s.clock, storage: broken });
    await expect(work).rejects.toThrow(/exportaciones/);
    const failed = (await exportsOf(s, boss)).find((entry) => entry.id === id);
    expect(failed?.status).toBe('failed');
    const again = await sendAs(s, 'post', '/v1/tenant/exports', boss.session);
    expect(again.status, again.text).toBe(201);
  });
});
