import { auditEventListResponseSchema, chainVerificationSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';

// Permiso denegado y aislamiento entre empresas en la auditoría (B11, numeral 15.3: solo
// dirección, administración, calidad, el oficial de datos y el auditor la leen; solo el auditor
// exporta).

const scenario = new AccessScenario('acceso a la auditoría');
const SOME_ID = '01920000-0000-7000-8000-000000000001';

const ROUTES: readonly (readonly ['get' | 'post', string])[] = [
  ['get', '/v1/audit-events'],
  ['get', `/v1/entities/iam_user/${SOME_ID}/history`],
  ['get', '/v1/security-events'],
  ['get', '/v1/audit-exports'],
  ['post', '/v1/audit-exports'],
  ['post', '/v1/audit-events/verify-chain'],
];

describe('permiso denegado', () => {
  it.each(ROUTES)('un colaborador no puede %s %s', async (method, path) => {
    const person = await scenario.person('colaborador', ['COLABORADOR']);
    const response =
      method === 'get'
        ? await scenario.get(path, person.session)
        : await scenario.post(path, person.session);
    expect(response.status).toBe(403);
  });

  it('quien lee la auditoría no la exporta: solo el auditor', async () => {
    const admin = await scenario.person('admin', ['ADMIN_PLATAFORMA']);
    expect((await scenario.get('/v1/audit-events', admin.session)).status).toBe(200);
    expect((await scenario.post('/v1/audit-exports', admin.session)).status).toBe(403);
  });
});

describe('aislamiento entre empresas', () => {
  it('cada empresa ve y verifica solo su propia auditoría', async () => {
    const adminA = await scenario.person('admin-a', ['ADMIN_PLATAFORMA']);
    const adminB = await scenario.person('admin-b', ['ADMIN_PLATAFORMA'], {
      tenantId: scenario.otherTenant.id,
    });
    const seenByB = auditEventListResponseSchema.parse(
      (await scenario.get('/v1/audit-events?limit=100', adminB.session)).body,
    );
    const ids = seenByB.data.flatMap((event) => [event.actor.id, event.entity_id]);
    expect(ids).not.toContain(adminA.id);
    const history = auditEventListResponseSchema.parse(
      (await scenario.get(`/v1/entities/iam_user/${adminA.id}/history`, adminB.session)).body,
    );
    expect(history.data).toEqual([]);
    const verifyB = chainVerificationSchema.parse(
      (await scenario.post('/v1/audit-events/verify-chain', adminB.session)).body,
    );
    const ownCount = await scenario.db.withTenant(
      { tenantId: scenario.otherTenant.id, userId: null },
      (tx) => tx.auditEvent.count(),
    );
    // La verificación de B revisó solo los eventos de B (más su propio evento, posterior).
    expect(verifyB.checked).toBe(ownCount - 1);
  });
});
