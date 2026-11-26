import { accessReviewResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';
import { created, qualityFixture } from '../qms/support/qms-fixture.js';
import { complies, fails, requirement } from '../qms/support/qms-legal-fixture.js';
import { board, drilldown, figure } from './support/dashboard-fixture.js';

// Tablero de cumplimiento (B46, ficha 17.17 y decisiones 9 y 10): accesos, segregación de
// funciones, tareas vencidas, documentos por revisar y requisitos legales.

const scenario = new AccessScenario('tablero de cumplimiento');
const legalScenario = new AccessScenario('porcentaje de cumplimiento legal');

it('los accesos coinciden con el informe de revisión de accesos', async () => {
  const f = await qualityFixture(scenario, 'accesos');
  const admin = await scenario.person('administrador', ['ADMIN_PLATAFORMA']);
  const idle = await scenario.person('cuenta-sin-uso', ['COMERCIAL']);
  const unused = await scenario.newUser('cuenta-sin-ingreso', { withSecondFactor: false });
  const oldDate = new Date(scenario.clock.now().getTime() - 91 * 86_400_000);
  await scenario.inTenant(async (tx) => {
    await tx.user.update({ where: { id: idle.id }, data: { lastLoginAt: oldDate } });
    await tx.user.update({
      where: { id: unused.id },
      data: { displayName: null },
    });
  });
  const data = await board(scenario, f.director, 'compliance');
  const review = accessReviewResponseSchema.parse(
    (await scenario.get('/v1/access-review', f.director.session)).body,
  );
  expect(figure(data, 'accounts_without_mfa').value).toBe(
    String(review.totals.without_second_factor),
  );
  expect(figure(data, 'inactive_accounts').value).toBe(String(review.totals.unused));
  const inactive = await drilldown(scenario, f.director, 'compliance', 'inactive_accounts');
  expect(inactive.rows.find((item) => item.id === idle.id)?.cells['detail']).toBe(
    'Sin ingresar en el plazo de la revisión',
  );
  const withoutMfa = await drilldown(scenario, f.director, 'compliance', 'accounts_without_mfa');
  expect(withoutMfa.rows.find((item) => item.id === unused.id)?.cells).toEqual({
    name: unused.email,
    roles: 'Sin roles',
    detail: 'Sin segundo factor',
  });
  const admins = await drilldown(scenario, f.director, 'compliance', 'platform_admins');
  expect(admins.rows.map((row) => row.id)).toContain(admin.id);
  const conflicts = await drilldown(scenario, f.director, 'compliance', 'sod_conflicts');
  const row = conflicts.rows.find((item) => item.id === admin.id);
  expect(row?.cells['detail']).toContain('Crear roles y asignarlos');
});

it('tareas, documentos y requisitos coinciden con su módulo', async () => {
  const f = await qualityFixture(scenario, 'modulos');
  const { id } = await requirement(scenario, f);
  await scenario.post(
    `/v1/qms/legal-requirements/${id}/evaluations`,
    f.quality.session,
    fails(scenario, f.worker.id),
  );
  const data = await board(scenario, f.director, 'compliance');
  const [overdue, inReview] = await scenario.inTenant((tx) =>
    Promise.all([
      tx.workflowTask.count({ where: { status: 'overdue', deletedAt: null } }),
      tx.docVersion.count({
        where: {
          status: { in: ['in_review', 'approved'] },
          deletedAt: null,
          document: { classification: { not: 'restricted' }, deletedAt: null },
        },
      }),
    ]),
  );
  expect(figure(data, 'overdue_tasks').value).toBe(String(overdue));
  expect(figure(data, 'documents_in_review').value).toBe(String(inReview));
  const failing = await drilldown(scenario, f.director, 'compliance', 'legal_failing');
  expect(failing.rows.find((item) => item.id === id)?.cells['result']).toBe('No cumple');
});

it('Calidad no ve las cifras de accesos; una cifra de otro tablero no existe', async () => {
  const f = await qualityFixture(scenario, 'limites');
  const data = await board(scenario, f.quality, 'compliance');
  expect(figure(data, 'accounts_without_mfa')).toMatchObject({ allowed: false, value: null });
  expect(figure(data, 'legal_pending').allowed).toBe(true);
  const path = '/v1/dashboards/compliance/drilldown?figure=';
  expect((await scenario.get(`${path}sod_conflicts`, f.quality.session)).status).toBe(403);
  expect((await scenario.get(`${path}sales_month`, f.director.session)).status).toBe(404);
});

it('un colaborador no entra a ningún tablero', async () => {
  const f = await qualityFixture(scenario, 'colaborador');
  for (const path of [
    '/v1/dashboards/executive/data',
    '/v1/dashboards/compliance/data',
    '/v1/dashboards/scorecard/data',
    '/v1/dashboards/executive/drilldown?figure=sales_month',
  ]) {
    expect((await scenario.get(path, f.worker.session)).status).toBe(403);
  }
});

it('otra empresa no ve los requisitos de esta', async () => {
  const f = await qualityFixture(scenario, 'aislado');
  const { id } = await requirement(scenario, f);
  const other = await scenario.person('direccion-otra', ['DIRECCION'], {
    tenantId: scenario.otherTenant.id,
  });
  const pending = await drilldown(scenario, other, 'compliance', 'legal_pending');
  expect(pending.rows.some((row) => row.id === id)).toBe(false);
});

it('el porcentaje incluye solo requisitos aplicables con evaluación de cumplimiento', async () => {
  const s = legalScenario;
  const f = await qualityFixture(s, 'porcentaje');
  const met = await requirement(s, f, { article: null });
  const unmet = await requirement(s, f);
  const exempt = await requirement(s, f, { applies: false });
  const notApplicable = await requirement(s, f);
  const pending = await requirement(s, f);

  for (const [id, evaluation] of [
    [met.id, complies(s)],
    [unmet.id, fails(s, f.worker.id)],
    [exempt.id, complies(s)],
    [notApplicable.id, { ...complies(s), result: 'not_applicable' }],
  ] as const) {
    created(
      await s.post(`/v1/qms/legal-requirements/${id}/evaluations`, f.quality.session, evaluation),
    );
  }

  const data = await board(s, f.director, 'executive');
  expect(figure(data, 'legal_compliance').value).toBe('50.00');
  const detail = await drilldown(s, f.director, 'executive', 'legal_compliance');
  expect(detail.rows.map((row) => row.id).sort()).toEqual([met.id, unmet.id].sort());
  expect(detail.rows.find((row) => row.id === met.id)?.cells['article']).toBe('');
  const outstanding = await drilldown(s, f.director, 'compliance', 'legal_pending');
  expect(outstanding.rows.map((row) => row.id)).toEqual([pending.id]);
});
