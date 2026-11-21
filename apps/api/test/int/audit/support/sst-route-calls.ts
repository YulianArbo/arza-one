import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import { availableFile } from '../../hr/support/people-fixture.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  ACCIDENT,
  answersFor,
  at,
  created,
  hazardBody,
  homeRequest,
  plannedIncident,
  processId,
  quickReport,
  sstFixture,
  today,
} from '../../sst/support/sst-fixture.js';

// Rutas de SST del B37 que escriben (peligros, plan, reportes, incidentes e inspecciones) para el
// recorrido de auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

const CONDITION = {
  kind: 'unsafe_condition',
  description: 'Cable suelto en el pasillo.',
  location: 'Pasillo',
};

export const SST_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/sst/hazards': async (s) => {
    const f = await sstFixture(s, 'auditoria-peligro');
    const body = hazardBody(await processId(s), today(s));
    return final(s.post('/v1/sst/hazards', f.sst.session, body));
  },
  'PATCH /v1/sst/hazards/{id}': async (s) => {
    const f = await sstFixture(s, 'auditoria-peligro-cambio');
    const body = hazardBody(await processId(s), today(s));
    const id = created(await s.post('/v1/sst/hazards', f.sst.session, body));
    return final(s.patch(`/v1/sst/hazards/${id}`, f.sst.session, { ...body, exposure: 1 }, 1));
  },
  'POST /v1/sst/work-plan': async (s) => {
    const f = await sstFixture(s, 'auditoria-plan');
    const body = {
      year: Number(today(s).slice(0, 4)),
      activity: 'Capacitación en pausas activas',
      responsible_id: f.sst.id,
      due_on: today(s),
    };
    return final(s.post('/v1/sst/work-plan', f.sst.session, body));
  },
  'POST /v1/sst/work-plan/{id}/actions/complete': async (s) => {
    const f = await sstFixture(s, 'auditoria-plan-hecho');
    const item = {
      year: Number(today(s).slice(0, 4)),
      activity: 'Simulacro de evacuación',
      responsible_id: f.sst.id,
      due_on: today(s),
    };
    const id = created(await s.post('/v1/sst/work-plan', f.sst.session, item));
    const body = { done_on: today(s), evidence_file_id: await availableFile(s, f.sst) };
    return final(at(s, `/v1/sst/work-plan/${id}/actions/complete`, f.sst, 1, body));
  },
  'POST /v1/sst/me/reports': async (s) => {
    const f = await sstFixture(s, 'auditoria-reporte');
    return final(
      s.post('/v1/sst/me/reports', f.worker.session, CONDITION).set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/sst/unsafe-reports/{id}/actions/attend': async (s) => {
    const f = await sstFixture(s, 'auditoria-atender');
    const id = await quickReport(s, f.worker, CONDITION);
    const body = { status: 'closed', response: 'Se aseguró el cable.' };
    return final(at(s, `/v1/sst/unsafe-reports/${id}/actions/attend`, f.sst, 1, body));
  },
  'POST /v1/sst/incidents/{id}/actions/report-arl': async (s) => {
    const f = await sstFixture(s, 'auditoria-arl');
    const id = await quickReport(s, f.worker, ACCIDENT);
    const body = { reported_on: today(s), filing_number: 'FURAT-123' };
    return final(at(s, `/v1/sst/incidents/${id}/actions/report-arl`, f.sst, 1, body));
  },
  'POST /v1/sst/incidents/{id}/actions/investigate': async (s) => {
    const f = await sstFixture(s, 'auditoria-investigar');
    const id = await quickReport(s, f.worker, ACCIDENT);
    const body = { team: 'SST, jefe inmediato y COPASST' };
    return final(at(s, `/v1/sst/incidents/${id}/actions/investigate`, f.sst, 1, body));
  },
  'POST /v1/sst/incidents/{id}/actions/plan': async (s) => {
    const f = await sstFixture(s, 'auditoria-plan-accion');
    const id = await quickReport(s, f.worker, ACCIDENT);
    await at(s, `/v1/sst/incidents/${id}/actions/investigate`, f.sst, 1, { team: 'SST' });
    const body = {
      immediate_causes: 'Piso mojado sin aviso.',
      root_causes: 'No hay protocolo de señalización de aseo.',
      actions: [
        {
          description: 'Comprar avisos de piso mojado',
          responsible_id: f.sst.id,
          due_on: today(s),
        },
      ],
    };
    return final(at(s, `/v1/sst/incidents/${id}/actions/plan`, f.sst, 2, body));
  },
  'POST /v1/sst/investigation-actions/{id}/actions/complete': async (s) => {
    const f = await sstFixture(s, 'auditoria-accion');
    const { actionId } = await plannedIncident(s, f);
    const body = { done_on: today(s), note: null };
    return final(
      at(s, `/v1/sst/investigation-actions/${actionId}/actions/complete`, f.worker, 1, body),
    );
  },
  'POST /v1/sst/incidents/{id}/actions/close': async (s) => {
    const f = await sstFixture(s, 'auditoria-cerrar');
    const { id, actionId } = await plannedIncident(s, f);
    const done = { done_on: today(s), note: null };
    await at(s, `/v1/sst/investigation-actions/${actionId}/actions/complete`, f.worker, 1, done);
    const body = { conclusion: 'Se aseguraron todos los soportes de monitores.' };
    return final(at(s, `/v1/sst/incidents/${id}/actions/close`, f.sst, 3, body));
  },
  'POST /v1/sst/inspections': async (s) => {
    const f = await sstFixture(s, 'auditoria-inspeccion');
    const body = {
      kind: 'emergency',
      inspected_on: today(s),
      place: 'Sede principal',
      answers: await answersFor(s, 'emergency'),
    };
    return final(s.post('/v1/sst/inspections', f.sst.session, body));
  },
  'POST /v1/sst/inspections/home-requests': async (s) => {
    const f = await sstFixture(s, 'auditoria-casa');
    const body = { employee_id: f.workerEmployeeId, due_on: today(s) };
    return final(s.post('/v1/sst/inspections/home-requests', f.sst.session, body));
  },
  'POST /v1/sst/me/inspections/{id}/answers': async (s) => {
    const f = await sstFixture(s, 'auditoria-casa-responder');
    const id = await homeRequest(s, f);
    const body = { place: 'Bogotá, Chapinero', answers: await answersFor(s, 'home') };
    return final(at(s, `/v1/sst/me/inspections/${id}/answers`, f.worker, 1, body));
  },
  'POST /v1/sst/inspections/{id}/actions/review': async (s) => {
    const f = await sstFixture(s, 'auditoria-casa-revisar');
    const id = await homeRequest(s, f);
    const answers = { place: 'Bogotá, Suba', answers: await answersFor(s, 'home') };
    await at(s, `/v1/sst/me/inspections/${id}/answers`, f.worker, 1, answers);
    const body = { findings: 'Ajustar la altura de la pantalla.' };
    return final(at(s, `/v1/sst/inspections/${id}/actions/review`, f.sst, 2, body));
  },
};
