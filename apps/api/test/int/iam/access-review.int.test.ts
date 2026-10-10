import { accessReviewResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { MINUTE, errorCode } from './support/iam-fixtures.js';
import { AccessScenario } from './support/access-scenario.js';

// Informe de revisión de accesos (B10, ficha 17.2): usuarios, roles, último ingreso y cuentas
// sin uso en 60 días. Cada consulta queda en la auditoría.

const scenario = new AccessScenario('revision');
const DAY = 24 * 60 * MINUTE;

describe('informe de revisión de accesos', () => {
  it('lista usuarios con roles y último ingreso, y marca las cuentas sin uso', async () => {
    const director = await scenario.person('director-revision', ['DIRECCION']);
    const idle = await scenario.person('sin-uso', ['COMERCIAL']);
    const oldLogin = new Date(scenario.clock.now().getTime() - 61 * DAY);
    await scenario.inTenant((tx) =>
      tx.user.update({ where: { id: idle.id }, data: { lastLoginAt: oldLogin } }),
    );
    const response = await scenario.get('/v1/access-review', director.session);
    expect(response.status).toBe(200);
    const report = accessReviewResponseSchema.parse(response.body);
    expect(report.unused_days).toBe(60);
    const row = report.users.find((user) => user.id === idle.id);
    expect(row).toMatchObject({ unused: true, roles: [{ code: 'COMERCIAL' }] });
    expect(report.users.find((user) => user.id === director.id)?.unused).toBe(false);
    expect(report.totals.unused).toBeGreaterThanOrEqual(1);
  });

  it('la consulta queda en la auditoría', async () => {
    const auditor = await scenario.person('auditor-revision', ['AUDITOR']);
    await scenario.get('/v1/access-review', auditor.session);
    const events = await scenario.inTenant((tx) =>
      tx.auditEvent.findMany({ where: { action: 'iam.access_review.read', actorId: auditor.id } }),
    );
    expect(events).toHaveLength(1);
  });

  it('un colaborador no lo ve y el de una empresa no incluye a la otra', async () => {
    const worker = await scenario.person('colaborador-revision', ['COLABORADOR']);
    expect(errorCode(await scenario.get('/v1/access-review', worker.session))).toBe(
      'PERMISSION_DENIED',
    );
    const foreign = await scenario.person('director-b', ['DIRECCION'], {
      tenantId: scenario.otherTenant.id,
    });
    const report = accessReviewResponseSchema.parse(
      (await scenario.get('/v1/access-review', foreign.session)).body,
    );
    expect(report.users.map((user) => user.id)).not.toContain(worker.id);
    expect(report.users.map((user) => user.id)).toContain(foreign.id);
  });
});
