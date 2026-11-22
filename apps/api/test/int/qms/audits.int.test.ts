import {
  auditFindingListResponseSchema,
  auditListResponseSchema,
  auditProgramListResponseSchema,
  QMS_ERROR_CODES,
} from '@arza/contracts';
import { expect, it } from 'vitest';

import { renderQualityPdfs } from '../../../src/modules/qms/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../doc/support/file-scenario.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { auditActions } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import {
  auditDetail,
  FINDING,
  placeIn,
  planBody,
  plannedAudit,
  program,
  put,
  programBody,
  reportBody,
  reportedAudit,
  started,
} from './support/qms-b39-fixture.js';
import { at, coded, created, later, processId, qualityFixture } from './support/qms-fixture.js';

// Programa y auditorías internas (B39; ficha 17.15, decisiones 1 a 4 y 9).

const scenario = new AccessScenario('calidad auditorias');

it('Calidad arma y publica el programa anual; uno por año', async () => {
  const f = await qualityFixture(scenario, 'programa');
  const body = programBody();
  expect((await scenario.post('/v1/qms/audit-programs', f.director.session, body)).status).toBe(
    403,
  );
  const id = created(await scenario.post('/v1/qms/audit-programs', f.quality.session, body));
  expect((await scenario.post('/v1/qms/audit-programs', f.quality.session, body)).status).toBe(409);
  const publish = `/v1/qms/audit-programs/${id}/actions/publish`;
  expect((await at(scenario, publish, f.quality, 1)).status).toBe(204);
  expect((await at(scenario, publish, f.quality, 2)).status).toBe(409);
  const list = auditProgramListResponseSchema.parse(
    (await scenario.get('/v1/qms/audit-programs', f.auditor.session)).body,
  );
  expect(list.data.find((item) => item.id === id)).toMatchObject({ status: 'published' });
  expect((await scenario.get('/v1/qms/audit-programs', f.worker.session)).status).toBe(403);
  expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
    'qms.audit_program.create:success',
    'qms.audit_program.publish:success',
  ]);
});

it('un auditor no audita el proceso de su cargo (ficha 17.15, decisión 2)', async () => {
  const f = await qualityFixture(scenario, 'independencia');
  const own = await processId(scenario, 0);
  await placeIn(scenario, f.worker, own);
  const programId = await program(scenario, f);
  const mine = planBody(programId, own, f.worker.id, later(scenario, 5));
  const denied = await scenario.post('/v1/qms/audits', f.quality.session, mine);
  expect(denied.status).toBe(403);
  expect(denied.body).toMatchObject({ error: { code: QMS_ERROR_CODES.auditorOwnProcess } });
  const other = planBody(programId, await processId(scenario, 1), f.worker.id, later(scenario, 5));
  const { id, code } = coded(await scenario.post('/v1/qms/audits', f.quality.session, other));
  expect(code).toMatch(/^AUD-\d{4}-\d{4}$/);
  const notices = await scenario.inTenant((tx) =>
    tx.outboxEvent.count({
      where: { eventType: 'qms.audit.assigned', payload: { path: ['audit_id'], equals: id } },
    }),
  );
  expect(notices).toBe(1);
  // Cambiarlo a su propio proceso también se rechaza.
  const replan = await scenario.patch(`/v1/qms/audits/${id}`, f.quality.session, mine, 1);
  expect(replan.status).toBe(403);
});

it('si el auditor pasa al proceso antes de iniciar, ya no puede auditarlo', async () => {
  const f = await qualityFixture(scenario, 'traslado');
  const audit = await plannedAudit(scenario, f);
  await placeIn(scenario, f.worker, await processId(scenario, 0));
  const response = await started(scenario, f.worker, audit.id);
  expect(response.status).toBe(403);
  expect(response.body).toMatchObject({ error: { code: QMS_ERROR_CODES.auditorOwnProcess } });
});

it('solo el auditor asignado o Calidad ejecutan la auditoría', async () => {
  const f = await qualityFixture(scenario, 'ejecucion');
  const audit = await plannedAudit(scenario, f);
  const other = await scenario.person('auditor-ajeno', ['COLABORADOR']);
  expect((await started(scenario, other, audit.id)).status).toBe(403);
  expect((await started(scenario, f.auditor, audit.id)).status).toBe(403);
  expect((await started(scenario, f.worker, audit.id)).status).toBe(204);
  const checklist = {
    items: [
      {
        requirement: 'ISO 9001 8.7',
        question: '¿Se registran las salidas no conformes?',
        result: 'nonconforming',
        evidence: 'Sin registro en octubre',
      },
    ],
  };
  const path = `/v1/qms/audits/${audit.id}/checklist`;
  expect((await put(scenario, path, other, 2, checklist)).status).toBe(403);
  expect((await put(scenario, path, f.worker, 2, checklist)).status).toBe(204);
  const detail = await auditDetail(scenario, f.quality, audit.id);
  expect(detail.audit.checklist).toEqual([checklist.items[0]]);
  const mine = auditListResponseSchema.parse(
    (await scenario.get('/v1/qms/my/audits', f.worker.session)).body,
  );
  expect(mine.data.map((item) => item.id)).toContain(audit.id);
  expect((await scenario.get(`/v1/qms/my/audits/${audit.id}`, other.session)).status).toBe(403);
  expect((await scenario.get(`/v1/qms/audits/${audit.id}`, f.worker.session)).status).toBe(403);
});

it('el informe abre la no conformidad de cada hallazgo de no conformidad (decisión 3)', async () => {
  const f = await qualityFixture(scenario, 'informe');
  const audit = await reportedAudit(scenario, f, ['minor', 'opportunity']);
  const detail = await auditDetail(scenario, f.quality, audit.id);
  expect(detail.audit).toMatchObject({ status: 'reported', findings: 2 });
  const minor = detail.findings.find((finding) => finding.type === 'minor');
  expect(minor?.nonconformity?.code).toMatch(/^NC-/);
  const nc = await scenario.inTenant((tx) =>
    tx.qmsNonconformity.findFirstOrThrow({ where: { id: minor?.nonconformity?.id ?? '' } }),
  );
  expect(nc).toMatchObject({ source: 'audit', originCode: audit.code, status: 'detected' });
  expect(detail.findings.find((finding) => finding.type === 'opportunity')?.nonconformity).toBe(
    null,
  );
  const stored = await scenario.inTenant((tx) =>
    tx.qmsAudit.findFirstOrThrow({ where: { id: audit.id } }),
  );
  expect(stored.pdfStatus).toBe('pending');
  expect(await auditActions(scenario.db, scenario.tenant.id, audit.id)).toEqual([
    'qms.audit.plan:success',
    'qms.audit.start:success',
    'qms.audit.report:success',
  ]);
});

it('una oportunidad de mejora se vuelve acción; una no conformidad no', async () => {
  const f = await qualityFixture(scenario, 'oportunidad');
  const audit = await reportedAudit(scenario, f, ['minor', 'opportunity']);
  const findings = auditFindingListResponseSchema
    .parse((await scenario.get('/v1/qms/findings', f.director.session)).body)
    .data.filter((finding) => finding.audit.id === audit.id);
  const byType = (type: string) => findings.find((finding) => finding.type === type)?.id ?? '';
  const body = {
    description: 'Registrar el tratamiento de cada salida no conforme.',
    responsible_id: f.worker.id,
    due_on: later(scenario, 15),
  };
  const path = (id: string) => `/v1/qms/findings/${id}/actions/action`;
  expect((await scenario.post(path(byType('opportunity')), f.worker.session, body)).status).toBe(
    403,
  );
  const action = coded(await scenario.post(path(byType('opportunity')), f.quality.session, body));
  expect(action.code).toMatch(/^AC-/);
  expect((await scenario.post(path(byType('opportunity')), f.quality.session, body)).status).toBe(
    409,
  );
  expect((await scenario.post(path(byType('minor')), f.quality.session, body)).status).toBe(409);
  const stored = await scenario.inTenant((tx) =>
    tx.qmsAction.findFirstOrThrow({ where: { id: action.id } }),
  );
  expect(stored).toMatchObject({ originType: 'audit', actionType: 'improvement' });
});

it('Calidad cierra la auditoría con informe y cancela una programada', async () => {
  const f = await qualityFixture(scenario, 'cierre');
  const audit = await reportedAudit(scenario, f, []);
  const close = `/v1/qms/audits/${audit.id}/actions/close`;
  expect((await at(scenario, close, f.worker, 3)).status).toBe(403);
  expect((await at(scenario, close, f.quality, 3)).status).toBe(204);
  const other = await plannedAudit(scenario, f);
  const cancel = `/v1/qms/audits/${other.id}/actions/cancel`;
  const reason = { reason: 'El proceso se fusionó con otro.' };
  expect((await at(scenario, cancel, f.quality, 1, reason)).status).toBe(204);
  expect((await started(scenario, f.worker, other.id)).status).toBe(409);
});

it('el informe no se emite sin iniciar ni con fecha futura', async () => {
  const f = await qualityFixture(scenario, 'fechas');
  const audit = await plannedAudit(scenario, f);
  const report = `/v1/qms/audits/${audit.id}/actions/report`;
  expect((await at(scenario, report, f.worker, 1, reportBody(scenario))).status).toBe(409);
  await started(scenario, f.worker, audit.id);
  const future = { ...reportBody(scenario), reported_on: later(scenario, 2) };
  expect((await at(scenario, report, f.worker, 2, future)).status).toBe(422);
  const finding = await scenario.post(
    `/v1/qms/audits/${audit.id}/findings`,
    f.auditor.session,
    FINDING,
  );
  expect(finding.status).toBe(403);
});

it('el worker genera el PDF del informe y lo amarra a la auditoría (decisión 9)', async () => {
  const f = await qualityFixture(scenario, 'pdf');
  const audit = await reportedAudit(scenario, f);
  const result = await renderQualityPdfs({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: () => Promise.resolve(samplePdf('Informe')),
  });
  expect(result.reports).toBeGreaterThanOrEqual(1);
  const detail = await auditDetail(scenario, f.quality, audit.id);
  expect(detail.audit.report_document_id).not.toBeNull();
  expect(await auditActions(scenario.db, scenario.tenant.id, audit.id)).toContain(
    'qms.audit.render:success',
  );
});

it('otra empresa no ve ni ejecuta las auditorías', async () => {
  const f = await qualityFixture(scenario, 'ajena');
  const audit = await plannedAudit(scenario, f);
  const stranger = await scenario.person('auditoria-ajena', ['CALIDAD'], {
    tenantId: scenario.otherTenant.id,
  });
  expect((await scenario.get(`/v1/qms/audits/${audit.id}`, stranger.session)).status).toBe(404);
  expect((await started(scenario, stranger, audit.id)).status).toBe(404);
  const theirs = auditProgramListResponseSchema.parse(
    (await scenario.get('/v1/qms/audit-programs', stranger.session)).body,
  );
  expect(theirs.data.flatMap((item) => item.audits).map((item) => item.id)).not.toContain(audit.id);
});
