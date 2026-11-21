import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  addMember,
  at,
  examFor,
  fileComplaint,
  ppeFor,
  put,
  sstFixture,
  today,
} from '../../sst/support/sst-fixture.js';

// Rutas de SST del B37 que escriben o se consultan con registro (salud, elementos de protección,
// comités, quejas y estándares mínimos) para el recorrido de auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

const MINUTE = { meeting_on: '2026-01-15', summary: 'Se revisaron los reportes del mes.' };

export const SST_PEOPLE_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/sst/medical-exams': async (s) => {
    const f = await sstFixture(s, 'auditoria-examen');
    const body = {
      employee_id: f.workerEmployeeId,
      kind: 'periodic',
      exam_date: today(s),
      provider: 'IPS de prueba',
      concept: 'fit',
    };
    return final(
      s.post('/v1/sst/medical-exams', f.sst.session, body).set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/sst/medical-exams/{id}/read': async (s) => {
    const f = await sstFixture(s, 'auditoria-examen-leer');
    const id = await examFor(s, f);
    return final(s.post(`/v1/sst/medical-exams/${id}/read`, f.sst.session));
  },
  'POST /v1/sst/me/medical-exams/read': async (s) => {
    const f = await sstFixture(s, 'auditoria-examen-propio');
    await examFor(s, f);
    return final(s.post('/v1/sst/me/medical-exams/read', f.worker.session));
  },
  'POST /v1/sst/ppe-deliveries': async (s) => {
    const f = await sstFixture(s, 'auditoria-epp');
    const body = { employee_id: f.workerEmployeeId, item: 'DIADEMA', delivered_on: today(s) };
    return final(
      s.post('/v1/sst/ppe-deliveries', f.sst.session, body).set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/sst/me/ppe-deliveries/{id}/actions/acknowledge': async (s) => {
    const f = await sstFixture(s, 'auditoria-epp-recibo');
    const id = await ppeFor(s, f);
    return final(at(s, `/v1/sst/me/ppe-deliveries/${id}/actions/acknowledge`, f.worker, 1));
  },
  'POST /v1/sst/committee-members': async (s) => {
    const f = await sstFixture(s, 'auditoria-integrante');
    const body = {
      committee: 'copasst',
      user_id: f.peer.id,
      represents: 'workers',
      from_on: today(s),
    };
    return final(s.post('/v1/sst/committee-members', f.sst.session, body));
  },
  'POST /v1/sst/committee-members/{id}/actions/end': async (s) => {
    const f = await sstFixture(s, 'auditoria-integrante-fin');
    const id = await addMember(s, f, 'copasst', f.peer);
    const body = { until_on: '2099-12-31' };
    return final(at(s, `/v1/sst/committee-members/${id}/actions/end`, f.sst, 1, body));
  },
  'POST /v1/sst/committee-minutes': async (s) => {
    const f = await sstFixture(s, 'auditoria-acta');
    const body = { ...MINUTE, committee: 'copasst', meeting_on: today(s) };
    return final(s.post('/v1/sst/committee-minutes', f.sst.session, body));
  },
  'POST /v1/sst/committee-minutes/read': async (s) => {
    const f = await sstFixture(s, 'auditoria-acta-leer');
    await addMember(s, f, 'coexistence', f.peer);
    const minute = { ...MINUTE, committee: 'coexistence', meeting_on: today(s) };
    await s.post('/v1/sst/committee-minutes', f.peer.session, minute);
    return final(
      s.post('/v1/sst/committee-minutes/read', f.peer.session, { committee: 'coexistence' }),
    );
  },
  'POST /v1/sst/complaints': async (s) => {
    const f = await sstFixture(s, 'auditoria-queja');
    const body = { facts: 'Recibo burlas constantes de un compañero en el chat del equipo.' };
    return final(
      s.post('/v1/sst/complaints', f.worker.session, body).set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/sst/complaints/read': async (s) => {
    const f = await sstFixture(s, 'auditoria-queja-leer');
    await addMember(s, f, 'coexistence', f.peer);
    await fileComplaint(s, f.worker);
    return final(s.post('/v1/sst/complaints/read', f.peer.session));
  },
  'POST /v1/sst/complaints/{id}/actions/handle': async (s) => {
    const f = await sstFixture(s, 'auditoria-queja-tramite');
    await addMember(s, f, 'coexistence', f.peer);
    const id = await fileComplaint(s, f.worker);
    const body = { status: 'in_review', outcome: null };
    return final(at(s, `/v1/sst/complaints/${id}/actions/handle`, f.peer, 1, body));
  },
  'PUT /v1/sst/standards-assessments/{year}/standards/{code}': async (s) => {
    const f = await sstFixture(s, 'auditoria-estandar');
    const year = today(s).slice(0, 4);
    const body = { result: 'meets' };
    return final(put(s, `/v1/sst/standards-assessments/${year}/standards/1.1.1`, f.sst, body));
  },
};
