import type request from 'supertest';

import { renderQualityPdfs } from '../../../../src/modules/qms/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  FINDING,
  indicatorBody,
  measurementBody,
  monthStart,
  planBody,
  plannedAudit,
  program,
  programBody,
  put,
  reportBody,
  reportedAudit,
  started,
} from '../../qms/support/qms-b39-fixture.js';
import {
  at,
  coded,
  created,
  later,
  processId,
  qualityFixture,
  today,
} from '../../qms/support/qms-fixture.js';

// Rutas de auditorías e indicadores del B39 que escriben, para el recorrido de auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

/** Genera los PDF pendientes con un PDF de muestra. */
export async function renderPdfs(): Promise<void> {
  await renderQualityPdfs({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: () => Promise.resolve(samplePdf('Calidad')),
  });
}

async function startedAudit(s: AccessScenario, label: string) {
  const f = await qualityFixture(s, label);
  const audit = await plannedAudit(s, f);
  await started(s, f.worker, audit.id);
  return { f, audit };
}

export const QMS_AUDIT_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/qms/audit-programs': async (s) => {
    const f = await qualityFixture(s, 'auditoria-programa');
    return final(s.post('/v1/qms/audit-programs', f.quality.session, programBody()));
  },
  'PATCH /v1/qms/audit-programs/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-programa-cambio');
    const id = await program(s, f);
    return final(s.patch(`/v1/qms/audit-programs/${id}`, f.quality.session, programBody(), 1));
  },
  'POST /v1/qms/audit-programs/{id}/actions/publish': async (s) => {
    const f = await qualityFixture(s, 'auditoria-programa-publica');
    const id = await program(s, f);
    return final(at(s, `/v1/qms/audit-programs/${id}/actions/publish`, f.quality, 1));
  },
  'POST /v1/qms/audits': async (s) => {
    const f = await qualityFixture(s, 'auditoria-programar');
    const body = planBody(await program(s, f), await processId(s, 0), f.worker.id, today(s));
    return final(s.post('/v1/qms/audits', f.quality.session, body));
  },
  'PATCH /v1/qms/audits/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-reprogramar');
    const id = await program(s, f);
    const body = planBody(id, await processId(s, 0), f.worker.id, today(s));
    const audit = coded(await s.post('/v1/qms/audits', f.quality.session, body));
    const moved = { ...body, planned_on: later(s, 7) };
    return final(s.patch(`/v1/qms/audits/${audit.id}`, f.quality.session, moved, 1));
  },
  'POST /v1/qms/audits/{id}/actions/start': async (s) => {
    const f = await qualityFixture(s, 'auditoria-iniciar');
    const audit = await plannedAudit(s, f);
    return final(started(s, f.worker, audit.id));
  },
  'PUT /v1/qms/audits/{id}/checklist': async (s) => {
    const { f, audit } = await startedAudit(s, 'auditoria-lista');
    const items = [{ requirement: 'ISO 9001 9.2', question: '¿Hay programa de auditorías?' }];
    return final(put(s, `/v1/qms/audits/${audit.id}/checklist`, f.worker, 2, { items }));
  },
  'POST /v1/qms/audits/{id}/findings': async (s) => {
    const { f, audit } = await startedAudit(s, 'auditoria-hallazgo');
    return final(s.post(`/v1/qms/audits/${audit.id}/findings`, f.worker.session, FINDING));
  },
  'POST /v1/qms/audits/{id}/actions/report': async (s) => {
    const { f, audit } = await startedAudit(s, 'auditoria-informe');
    const path = `/v1/qms/audits/${audit.id}/actions/report`;
    return final(at(s, path, f.worker, 2, reportBody(s)));
  },
  'POST /v1/qms/audits/{id}/actions/close': async (s) => {
    const f = await qualityFixture(s, 'auditoria-cerrar');
    const audit = await reportedAudit(s, f, []);
    return final(at(s, `/v1/qms/audits/${audit.id}/actions/close`, f.quality, 3));
  },
  'POST /v1/qms/audits/{id}/actions/cancel': async (s) => {
    const f = await qualityFixture(s, 'auditoria-cancelar');
    const audit = await plannedAudit(s, f);
    const path = `/v1/qms/audits/${audit.id}/actions/cancel`;
    return final(at(s, path, f.quality, 1, { reason: 'Se reprograma para el año siguiente.' }));
  },
  'POST /v1/qms/findings/{id}/actions/action': async (s) => {
    const f = await qualityFixture(s, 'auditoria-oportunidad');
    const audit = await reportedAudit(s, f, ['opportunity']);
    const finding = await s.inTenant((tx) =>
      tx.qmsFinding.findFirstOrThrow({ where: { auditId: audit.id } }),
    );
    const body = {
      description: 'Estandarizar la lista de chequeo.',
      responsible_id: f.worker.id,
      due_on: later(s, 20),
    };
    return final(s.post(`/v1/qms/findings/${finding.id}/actions/action`, f.quality.session, body));
  },
  'POST /v1/qms/audits/{id}/report/download-link': async (s) => {
    const f = await qualityFixture(s, 'auditoria-informe-pdf');
    const audit = await reportedAudit(s, f, []);
    await renderPdfs();
    return final(s.post(`/v1/qms/audits/${audit.id}/report/download-link`, f.director.session));
  },
  'POST /v1/qms/my/audits/{id}/report/download-link': async (s) => {
    const f = await qualityFixture(s, 'auditoria-mi-informe-pdf');
    const audit = await reportedAudit(s, f, []);
    await renderPdfs();
    return final(s.post(`/v1/qms/my/audits/${audit.id}/report/download-link`, f.worker.session));
  },
  'POST /v1/qms/indicators': async (s) => {
    const f = await qualityFixture(s, 'auditoria-indicador');
    const body = await indicatorBody(s, f.worker.id);
    return final(s.post('/v1/qms/indicators', f.quality.session, body));
  },
  'PATCH /v1/qms/indicators/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-indicador-cambio');
    const body = await indicatorBody(s, f.worker.id);
    const { id } = coded(await s.post('/v1/qms/indicators', f.quality.session, body));
    return final(
      s.patch(`/v1/qms/indicators/${id}`, f.quality.session, { ...body, target: '4.5' }, 1),
    );
  },
  'POST /v1/qms/indicators/export': async (s) => {
    const f = await qualityFixture(s, 'auditoria-matriz');
    return final(s.post('/v1/qms/indicators/export', f.auditor.session));
  },
  'POST /v1/qms/indicators/{id}/measurements': async (s) => {
    const f = await qualityFixture(s, 'auditoria-medicion');
    const body = await indicatorBody(s, f.worker.id);
    const { id } = coded(await s.post('/v1/qms/indicators', f.quality.session, body));
    const measurement = measurementBody(monthStart(s, 1), '4');
    return final(s.post(`/v1/qms/indicators/${id}/measurements`, f.worker.session, measurement));
  },
  'POST /v1/qms/indicators/{id}/actions/calculate': async (s) => {
    const f = await qualityFixture(s, 'auditoria-calculo');
    const body = await indicatorBody(s, f.worker.id, {
      unit: 'count',
      target: '0',
      direction: 'lower_better',
      source: 'sst_incidents',
    });
    const { id } = coded(await s.post('/v1/qms/indicators', f.quality.session, body));
    return final(s.post(`/v1/qms/indicators/${id}/actions/calculate`, f.quality.session, {}));
  },
  'PATCH /v1/qms/measurements/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-analisis');
    const body = await indicatorBody(s, f.worker.id);
    const { id } = coded(await s.post('/v1/qms/indicators', f.quality.session, body));
    const measurement = created(
      await s.post(
        `/v1/qms/indicators/${id}/measurements`,
        f.worker.session,
        measurementBody(monthStart(s, 1), '4'),
      ),
    );
    const analysis = { analysis: 'Se mantiene dentro de la meta.' };
    return final(s.patch(`/v1/qms/measurements/${measurement}`, f.worker.session, analysis, 1));
  },
};
