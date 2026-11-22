import { ACTION_LOG_COLUMNS, qmsActionListResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { runQmsDailyWork } from '../../../src/modules/qms/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { auditActions } from '../iam/support/iam-fixtures.js';
import { sstFixture, quickReport } from '../sst/support/sst-fixture.js';
import {
  actionBody,
  coded,
  later,
  plannedNonconformity,
  qualityFixture,
  today,
} from './support/qms-fixture.js';

// Bitácora de acciones (RE-SGC-002, decisión 10), escalamiento de las vencidas (decisión 11) y
// no conformidad enlazada a un incidente de SST (decisión 5).

const scenario = new AccessScenario('calidad bitacora');
const DAY = 24 * 60 * 60 * 1000;

it('la bitácora trae el origen, la causa raíz y la verificación, y se descarga en CSV', async () => {
  const f = await qualityFixture(scenario, 'bitacora');
  const { id, actionId } = await plannedNonconformity(scenario, f);
  const log = qmsActionListResponseSchema.parse(
    (await scenario.get('/v1/qms/actions?origin_type=nonconformity', f.director.session)).body,
  );
  const row = log.data.find((action) => action.id === actionId);
  expect(row).toMatchObject({
    origin: { id },
    finding: 'El informe mensual salió sin revisión.',
    root_cause: 'El procedimiento no asigna quién revisa el informe.',
    action_type: 'corrective',
    responsible: { id: f.worker.id },
    status: 'open',
    overdue: false,
    opened_on: today(scenario),
  });
  expect(row?.code).toMatch(/^AC-\d{4}-\d{4}$/);
  expect(row?.origin?.code).toMatch(/^NC-\d{4}-\d{4}$/);
  expect((await scenario.get('/v1/qms/actions', f.worker.session)).status).toBe(403);
  const file = await scenario.post('/v1/qms/actions/export', f.auditor.session);
  expect(file.status).toBe(200);
  expect(file.headers['content-type']).toContain('text/csv');
  const lines = file.text.replace('﻿', '').split('\r\n');
  expect(lines[0]).toBe(ACTION_LOG_COLUMNS.join(';'));
  expect(file.text).toContain(row?.code ?? 'sin código');
  const tenant = scenario.tenant.id;
  expect(await auditActions(scenario.db, tenant, tenant)).toContain('qms.action.export:success');
});

it('solo Calidad registra acciones y no con fecha pasada ni sobre una no conformidad sin análisis', async () => {
  const f = await qualityFixture(scenario, 'registro');
  const improvement = actionBody(
    { type: 'improvement', id: null },
    f.worker.id,
    later(scenario, 3),
  );
  expect((await scenario.post('/v1/qms/actions', f.worker.session, improvement)).status).toBe(403);
  const past = { ...improvement, due_on: later(scenario, -1) };
  expect((await scenario.post('/v1/qms/actions', f.quality.session, past)).status).toBe(422);
  const fresh = coded(
    await scenario.post('/v1/qms/nonconformities', f.worker.session, {
      description: 'Se entregó un producto sin pruebas.',
      detected_on: today(scenario),
    }),
  );
  const early = actionBody(
    { type: 'nonconformity', id: fresh.id },
    f.worker.id,
    later(scenario, 3),
  );
  expect((await scenario.post('/v1/qms/actions', f.quality.session, early)).status).toBe(409);
  const id = coded(await scenario.post('/v1/qms/actions', f.quality.session, improvement)).id;
  const edit = { ...improvement, responsible_id: f.verifier.id, notes: 'Cambio de responsable' };
  delete (edit as Partial<typeof edit>).origin_type;
  delete (edit as Partial<typeof edit>).origin_id;
  expect((await scenario.patch(`/v1/qms/actions/${id}`, f.quality.session, edit, 1)).status).toBe(
    204,
  );
  expect((await scenario.patch(`/v1/qms/actions/${id}`, f.worker.session, edit, 2)).status).toBe(
    403,
  );
});

it('una acción vencida escala a su responsable, a Calidad y a la Dirección, cada 7 días', async () => {
  const f = await qualityFixture(scenario, 'escala');
  const body = actionBody({ type: 'improvement', id: null }, f.worker.id, today(scenario));
  const { id } = coded(await scenario.post('/v1/qms/actions', f.quality.session, body));
  const runAt = (days: number) =>
    runQmsDailyWork({
      database: scenario.db,
      clock: { now: () => new Date(scenario.clock.now().getTime() + days * DAY) },
    });
  await runAt(2);
  await runAt(3);
  const count = () =>
    scenario.inTenant((tx) =>
      tx.outboxEvent.count({
        where: { eventType: 'qms.action.overdue', payload: { path: ['action_id'], equals: id } },
      }),
    );
  expect(await count()).toBe(1);
  const event = await scenario.inTenant((tx) =>
    tx.outboxEvent.findFirstOrThrow({
      where: { eventType: 'qms.action.overdue', payload: { path: ['action_id'], equals: id } },
    }),
  );
  const recipients = (event.payload as { recipients: string[] }).recipients;
  expect(recipients).toEqual(expect.arrayContaining([f.worker.id, f.quality.id, f.director.id]));
  await runAt(9);
  expect(await count()).toBe(2);
});

it('Calidad abre la no conformidad de un incidente de SST, una sola vez', async () => {
  const f = await qualityFixture(scenario, 'incidente');
  const sst = await sstFixture(scenario, 'incidente-sst');
  const incident = await quickReport(scenario, sst.worker, {
    kind: 'incident',
    description: 'Casi se cae un monitor mal asegurado.',
    location: 'Oficina',
  });
  const body = {
    description: 'El soporte de los monitores no tiene mantenimiento.',
    detected_on: today(scenario),
    sst_incident_id: incident,
  };
  expect((await scenario.post('/v1/qms/nonconformities', f.worker.session, body)).status).toBe(403);
  const nc = coded(await scenario.post('/v1/qms/nonconformities', f.quality.session, body));
  const stored = await scenario.inTenant((tx) =>
    tx.qmsNonconformity.findFirstOrThrow({ where: { id: nc.id } }),
  );
  expect(stored).toMatchObject({ source: 'sst_incident', originId: incident });
  expect(stored.originCode).toMatch(/^SST-/);
  expect((await scenario.post('/v1/qms/nonconformities', f.quality.session, body)).status).toBe(
    422,
  );
  const ghost = { ...body, sst_incident_id: '01900000-0000-7000-8000-00000000dead' };
  expect((await scenario.post('/v1/qms/nonconformities', f.quality.session, ghost)).status).toBe(
    422,
  );
});
