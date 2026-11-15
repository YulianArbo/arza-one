import { deliverableListResponseSchema, timeListResponseSchema } from '@arza/contracts';
import { expect } from 'vitest';

import { renderPendingPdfs, seedDocForms } from '../../../../src/modules/doc/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { consentFor, personBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';
import { created, day, put, signedCopy, versioned, type PendingRequest } from './contract-steps.js';
import {
  detail,
  remove,
  running,
  step,
  withItem,
  type Crew,
  type RouteCall,
} from './project-route-calls.js';

// Llamadas del recorrido de escrituras (B11) para el control de proyectos (B27): horas,
// entregables y su acta, revisiones de código, riesgos, liberaciones, incidentes, la configuración
// y el cierre. Cada una prepara un proyecto en ejecución por la API.

const TIME = (s: AccessScenario) => ({
  work_date: day(s, 0),
  hours: 2,
  item_id: null,
  billable: true,
  note: null,
});

async function crewWithForms(s: AccessScenario): Promise<Crew> {
  await seedDocForms(apiDatabase(), [s.tenant.id], systemClock);
  return running(s);
}

/** Una persona del equipo con una hora registrada (para aprobarla o devolverla). */
async function withTeamTime(s: AccessScenario): Promise<Crew & { entry: string }> {
  const crew = await running(s);
  const developer = await s.person('equipo-horas-recorrido', ['EQUIPO_PROYECTO']);
  const member = { user_id: developer.id, role: 'development', allocation_pct: 50 };
  await created(s.post(`${crew.base}/members`, crew.leader.session, member));
  const entry = await created(s.post(`${crew.base}/time-entries`, developer.session, TIME(s)));
  return { ...crew, entry };
}

async function withOwnTime(s: AccessScenario): Promise<Crew & { entry: string; version: number }> {
  const crew = await running(s);
  const entry = await created(s.post(`${crew.base}/time-entries`, crew.leader.session, TIME(s)));
  const list = timeListResponseSchema.parse(
    (await s.get(`${crew.base}/time-entries`, crew.leader.session)).body,
  );
  return { ...crew, entry, version: list.data[0]?.version ?? 0 };
}

const DELIVERABLE = {
  name: 'Portal de clientes',
  description: null,
  version_label: '1.0.0',
  milestone_id: null,
  evidence_url: null,
};

/** El cliente del proyecto con un firmante autorizado (correo y documento). */
async function signerOf(s: AccessScenario, crew: Crew, sales: Person): Promise<string> {
  const email = `acta-${crypto.randomUUID().slice(0, 8)}@cliente.test`;
  const signer = await created(
    s.post('/v1/parties', sales.session, {
      ...personBody({ email }),
      consent: await consentFor(s),
    }),
  );
  const partyId = (await detail(s, crew)).party.id;
  const contact = { person_id: signer, can_sign: true };
  expect((await s.post(`/v1/parties/${partyId}/contacts`, sales.session, contact)).status).toBe(
    201,
  );
  return signer;
}

async function withDeliverable(s: AccessScenario): Promise<Crew & { deliverable: string }> {
  const crew = await crewWithForms(s);
  const path = `${crew.base}/deliverables`;
  const deliverable = await created(s.post(path, crew.leader.session, DELIVERABLE));
  return { ...crew, deliverable };
}

async function deliver(s: AccessScenario, crew: Crew & { deliverable: string }) {
  const sales = await s.person('comercial-actas-recorrido', ['COMERCIAL']);
  const signer = await signerOf(s, crew, sales);
  const body = { signer_id: signer, environment: 'test', pending_note: null, message: null };
  return step(s, crew, `/deliverables/${crew.deliverable}/actions/deliver`, 1, body);
}

async function withRelease(s: AccessScenario): Promise<Crew & { release: string }> {
  const crew = await running(s);
  const release = await created(
    s.post(`${crew.base}/releases`, crew.leader.session, {
      version_label: '1.0.0',
      environment: 'test',
      released_on: day(s, 0),
      notes: 'Primera versión.',
      test_report_file_id: await signedCopy(s, crew.leader),
    }),
  );
  return { ...crew, release };
}

const INCIDENT = (s: AccessScenario) => ({
  title: 'Caída del portal',
  kind: 'failure',
  severity: 'high',
  description: 'El portal no respondió durante diez minutos.',
  detected_at: new Date(Date.parse(`${day(s, 0)}T12:00:00Z`) - 86_400_000).toISOString(),
  personal_data: false,
});

const RISK = (leader: Person) => ({
  description: 'Cambia la interfaz del proveedor.',
  probability: 2,
  impact: 3,
  response: null,
  owner_id: leader.id,
});

async function projectVersioned(
  s: AccessScenario,
  crew: Crew,
  path: string,
  body: object = {},
): Promise<PendingRequest> {
  return step(s, crew, path, (await detail(s, crew)).version, body);
}

export const PROJECT_CONTROL_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/projects/{id}/time-entries': async (s) => {
    const crew = await running(s);
    return { test: s.post(`${crew.base}/time-entries`, crew.leader.session, TIME(s)) };
  },
  'PUT /v1/projects/{id}/time-entries/{entryId}': async (s) => {
    const crew = await withOwnTime(s);
    const path = `${crew.base}/time-entries/${crew.entry}`;
    return { test: versioned(put(s, path, crew.leader, { ...TIME(s), hours: 3 }), crew.version) };
  },
  'DELETE /v1/projects/{id}/time-entries/{entryId}': async (s) => {
    const crew = await withOwnTime(s);
    const path = `${crew.base}/time-entries/${crew.entry}`;
    return { test: versioned(remove(s, path, crew.leader), crew.version) };
  },
  'POST /v1/projects/{id}/time-entries/actions/approve': async (s) => {
    const crew = await withTeamTime(s);
    const path = `${crew.base}/time-entries/actions/approve`;
    return { test: s.post(path, crew.leader.session, { ids: [crew.entry] }) };
  },
  'POST /v1/projects/{id}/time-entries/{entryId}/actions/return': async (s) => {
    const crew = await withTeamTime(s);
    return step(s, crew, `/time-entries/${crew.entry}/actions/return`, 1, {
      reason: 'Indique el ítem.',
    });
  },
  'POST /v1/projects/{id}/deliverables': async (s) => {
    const crew = await running(s);
    return { test: s.post(`${crew.base}/deliverables`, crew.leader.session, DELIVERABLE) };
  },
  'PUT /v1/projects/{id}/deliverables/{deliverableId}': async (s) => {
    const crew = await withDeliverable(s);
    const path = `${crew.base}/deliverables/${crew.deliverable}`;
    return { test: versioned(put(s, path, crew.leader, { ...DELIVERABLE, name: 'Portal' }), 1) };
  },
  'POST /v1/projects/{id}/deliverables/{deliverableId}/actions/deliver': async (s) =>
    deliver(s, await withDeliverable(s)),
  'POST /v1/projects/{id}/deliverables/{deliverableId}/acta-link': async (s) => {
    const crew = await withDeliverable(s);
    expect((await (await deliver(s, crew)).test).status).toBe(201);
    await renderPendingPdfs({
      database: apiDatabase(),
      clock: systemClock,
      storage: storage(),
      convertHtml: () => Promise.resolve(samplePdf('Acta')),
      convertOffice: () => Promise.resolve(samplePdf('Acta')),
      stamp: (pdf) => Promise.resolve(pdf),
    });
    const list = deliverableListResponseSchema.parse(
      (await s.get(`${crew.base}/deliverables`, crew.leader.session)).body,
    );
    expect(list.data[0]?.acceptance?.record_code).not.toBeNull();
    const path = `${crew.base}/deliverables/${crew.deliverable}/acta-link`;
    return { test: s.post(path, crew.leader.session, {}) };
  },
  'POST /v1/projects/{id}/code-reviews': async (s) => {
    const crew = await withItem(s);
    await seedDocForms(apiDatabase(), [s.tenant.id], systemClock);
    const developer = await s.person('equipo-revision-recorrido', ['EQUIPO_PROYECTO']);
    const member = { user_id: developer.id, role: 'development', allocation_pct: 50 };
    await created(s.post(`${crew.base}/members`, crew.leader.session, member));
    const item = `${crew.base}/items/${crew.item}`;
    const assign = {
      parent_id: null,
      title: 'Consultar facturas',
      description: null,
      acceptance_criteria: 'Ve sus facturas del último año.',
      priority: 'normal',
      estimate_hours: null,
      assignee_id: developer.id,
    };
    expect((await versioned(put(s, item, crew.leader, assign), crew.version)).status).toBe(204);
    for (const [status, version] of [
      ['in_progress', crew.version + 1],
      ['in_review', crew.version + 2],
    ] as const) {
      const moved = await step(s, crew, `/items/${crew.item}/actions/move`, version, { status })
        .test;
      expect(moved.status, moved.text).toBe(204);
    }
    return {
      test: s.post(`${crew.base}/code-reviews`, crew.leader.session, {
        item_id: crew.item,
        reference_url: 'https://git.example.com/portal/pull/1',
        answers: Array.from({ length: 8 }, () => 'yes'),
        result: 'approved',
        notes: null,
      }),
    };
  },
  'POST /v1/projects/{id}/risks': async (s) => {
    const crew = await running(s);
    return { test: s.post(`${crew.base}/risks`, crew.leader.session, RISK(crew.leader)) };
  },
  'PUT /v1/projects/{id}/risks/{riskId}': async (s) => {
    const crew = await running(s);
    const risk = await created(
      s.post(`${crew.base}/risks`, crew.leader.session, RISK(crew.leader)),
    );
    const body = { ...RISK(crew.leader), status: 'closed' };
    return { test: versioned(put(s, `${crew.base}/risks/${risk}`, crew.leader, body), 1) };
  },
  'POST /v1/projects/{id}/releases': async (s) => {
    const crew = await running(s);
    return {
      test: s.post(`${crew.base}/releases`, crew.leader.session, {
        version_label: '1.0.0',
        environment: 'production',
        released_on: day(s, 0),
        notes: 'Versión para producción.',
        test_report_file_id: await signedCopy(s, crew.leader),
      }),
    };
  },
  'POST /v1/projects/{id}/releases/{releaseId}/report-link': async (s) => {
    const crew = await withRelease(s);
    const path = `${crew.base}/releases/${crew.release}/report-link`;
    return { test: s.post(path, crew.leader.session, {}) };
  },
  'POST /v1/projects/{id}/incidents': async (s) => {
    const crew = await running(s);
    return { test: s.post(`${crew.base}/incidents`, crew.leader.session, INCIDENT(s)) };
  },
  'POST /v1/projects/{id}/incidents/{incidentId}/actions/resolve': async (s) => {
    const crew = await running(s);
    const incident = await created(
      s.post(`${crew.base}/incidents`, crew.leader.session, INCIDENT(s)),
    );
    return step(s, crew, `/incidents/${incident}/actions/resolve`, 1, {
      resolved_at: new Date(Date.parse(`${day(s, 0)}T00:00:00Z`)).toISOString(),
      root_cause: 'Memoria agotada.',
      actions: 'Límite de memoria y alerta.',
    });
  },
  'PUT /v1/projects/{id}/control-settings': async (s) => {
    const crew = await running(s);
    const body = {
      hour_cost: '40000',
      respond_days: 8,
      tacit_acceptance: false,
      tacit_clause: null,
    };
    const { version } = await detail(s, crew);
    return { test: versioned(put(s, `${crew.base}/control-settings`, crew.leader, body), version) };
  },
  'POST /v1/projects/{id}/actions/start-closing': async (s) => {
    const crew = await running(s);
    return projectVersioned(s, crew, '/actions/start-closing');
  },
  'POST /v1/projects/{id}/actions/close': async (s) => {
    const crew = await running(s);
    await (
      await projectVersioned(s, crew, '/actions/start-closing')
    ).test;
    return projectVersioned(s, crew, '/actions/close', { lessons: 'Acordar antes las pruebas.' });
  },
};
