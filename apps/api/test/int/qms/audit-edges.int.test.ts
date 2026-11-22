import { expect, it } from 'vitest';

import { auditReportHtml } from '../../../src/modules/qms/application/quality-documents.js';
import { renderQualityPdfs } from '../../../src/modules/qms/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../doc/support/file-scenario.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { auditActions } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import {
  auditDetail,
  indicatorBody,
  measurementBody,
  monthStart,
  planBody,
  plannedAudit,
  program,
  programBody,
  put,
  reportBody,
  reviewBody,
  reviewOf,
} from './support/qms-b39-fixture.js';
import {
  at,
  coded,
  created,
  later,
  processId,
  qualityFixture,
  today,
  type QualityStaff,
} from './support/qms-fixture.js';

// Casos límite de auditorías y actas (B39): lo que no existe, lo que no está en el estado debido y
// el cambio de auditor, que avisa al nuevo.

const scenario = new AccessScenario('calidad auditorias bordes');
const GHOST = '01900000-0000-7000-8000-00000000dead';

function assignedNotices(auditId: string): Promise<number> {
  return scenario.inTenant((tx) =>
    tx.outboxEvent.count({
      where: { eventType: 'qms.audit.assigned', payload: { path: ['audit_id'], equals: auditId } },
    }),
  );
}

it('cambiar de auditor avisa al nuevo; no se reprograma lo que no existe ni lo iniciado', async () => {
  const f = await qualityFixture(scenario, 'reprogramar');
  const programId = await program(scenario, f);
  const process = await processId(scenario, 1);
  const body = planBody(programId, process, f.worker.id, later(scenario, 5));
  const { id } = coded(await scenario.post('/v1/qms/audits', f.quality.session, body));
  const other = await scenario.person('nuevo-auditor', ['COLABORADOR']);
  const moved = { ...body, auditor_id: other.id, planned_on: later(scenario, 7) };
  expect(
    (await scenario.patch(`/v1/qms/audits/${GHOST}`, f.quality.session, moved, 1)).status,
  ).toBe(404);
  expect((await scenario.patch(`/v1/qms/audits/${id}`, f.quality.session, moved, 1)).status).toBe(
    204,
  );
  expect(await assignedNotices(id)).toBe(2);
  expect((await auditDetail(scenario, f.quality, id)).audit.auditor.id).toBe(other.id);
  const start = `/v1/qms/audits/${id}/actions/start`;
  expect((await at(scenario, start, other, 2, { started_on: today(scenario) })).status).toBe(204);
  expect((await scenario.patch(`/v1/qms/audits/${id}`, f.quality.session, body, 3)).status).toBe(
    409,
  );
});

it('no hay enlace de descarga de lo que no existe ni del PDF que aún no se genera', async () => {
  const f = await qualityFixture(scenario, 'enlaces');
  const audit = await plannedAudit(scenario, f);
  const report = (id: string) => `/v1/qms/audits/${id}/report/download-link`;
  expect((await scenario.post(report(GHOST), f.quality.session)).status).toBe(404);
  expect((await scenario.post(report(audit.id), f.quality.session)).status).toBe(409);
  const review = (id: string) => `/v1/qms/management-reviews/${id}/download-link`;
  const draft = coded(
    await scenario.post('/v1/qms/management-reviews', f.quality.session, reviewBody(scenario)),
  );
  expect((await scenario.post(review(GHOST), f.quality.session)).status).toBe(404);
  expect((await scenario.post(review(draft.id), f.quality.session)).status).toBe(409);
});

it('el programa se edita con su versión, sin repetir año, y no se publica lo que no existe', async () => {
  const f = await qualityFixture(scenario, 'programa-bordes');
  const first = programBody();
  const firstId = created(await scenario.post('/v1/qms/audit-programs', f.quality.session, first));
  const second = programBody();
  const id = created(await scenario.post('/v1/qms/audit-programs', f.quality.session, second));
  const edit = (target: string, body: object, version: number) =>
    scenario.patch(`/v1/qms/audit-programs/${target}`, f.quality.session, body, version);
  expect((await edit(GHOST, second, 1)).status).toBe(404);
  expect((await edit(id, { ...second, year: first.year }, 1)).status).toBe(409);
  expect((await edit(id, second, 5)).status).toBe(409);
  expect((await edit(id, { ...second, scope: 'Solo los procesos misionales.' }, 1)).status).toBe(
    204,
  );
  const publish = (target: string, version: number) =>
    at(scenario, `/v1/qms/audit-programs/${target}/actions/publish`, f.quality, version);
  expect((await publish(GHOST, 1)).status).toBe(404);
  expect((await publish(firstId, 4)).status).toBe(409);
  expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
    'qms.audit_program.create:success',
    'qms.audit_program.update:success',
  ]);
});

/** Auditoría sin criterios, con un ítem sin evidencia, hasta el informe emitido. */
async function reportedWithoutCriteria(f: QualityStaff): Promise<string> {
  const process = await processId(scenario, 1);
  const plan = planBody(await program(scenario, f), process, f.worker.id, today(scenario));
  const audits = '/v1/qms/audits';
  const { id } = coded(
    await scenario.post(audits, f.quality.session, { ...plan, criteria: undefined }),
  );
  const step = (name: string, version: number, body: object) =>
    at(scenario, `${audits}/${id}/actions/${name}`, f.worker, version, body);
  expect((await step('start', 1, { started_on: today(scenario) })).status).toBe(204);
  const item = {
    requirement: 'ISO 9001 7.5',
    question: '¿Se controla la información documentada?',
    result: 'conforming',
  };
  const checklist = await put(scenario, `${audits}/${id}/checklist`, f.worker, 2, {
    items: [item],
  });
  expect(checklist.status).toBe(204);
  expect((await step('report', 3, reportBody(scenario))).status).toBe(204);
  return id;
}

it('el informe en PDF muestra «—» donde no hay criterios ni evidencia', async () => {
  const f = await qualityFixture(scenario, 'pdf-vacios');
  const id = await reportedWithoutCriteria(f);
  await renderQualityPdfs({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: () => Promise.resolve(samplePdf('Informe')),
  });
  expect((await auditDetail(scenario, f.quality, id)).audit.report_document_id).not.toBeNull();
  const page = await scenario.inTenant(async (tx) =>
    auditReportHtml(tx, await tx.qmsAudit.findFirstOrThrow({ where: { id } })),
  );
  expect(page.index).toContain('<td>—</td>');
});

it('la precarga del acta dice qué indicadores no tienen medición', async () => {
  const f = await qualityFixture(scenario, 'entradas-bordes');
  const newIndicator = async (overrides: Record<string, unknown>) =>
    coded(
      await scenario.post(
        '/v1/qms/indicators',
        f.quality.session,
        await indicatorBody(scenario, f.worker.id, overrides),
      ),
    );
  const pending = await newIndicator({ name: 'Indicador aún sin medir' });
  const measured = await newIndicator({ unit: 'percent', target: '90' });
  const value = measurementBody(monthStart(scenario, 1), '95');
  const measure = `/v1/qms/indicators/${measured.id}/measurements`;
  created(await scenario.post(measure, f.worker.session, value));
  const body = reviewBody(scenario);
  const { id } = coded(await scenario.post('/v1/qms/management-reviews', f.quality.session, body));
  const load = `/v1/qms/management-reviews/${id}/actions/load-inputs`;
  expect((await at(scenario, load, f.quality, 1)).status).toBe(204);
  const review = await reviewOf(scenario, f.quality, id);
  const lines = review.inputs.find((input) => input.key === 'indicators')?.lines ?? [];
  expect(lines.find((line) => line.startsWith(pending.code))).toContain('sin medición');
  expect(lines.find((line) => line.startsWith(measured.code))).toContain('95 %');
});
