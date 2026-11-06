import { itemListResponseSchema, projectDetailSchema, type ProjectDetail } from '@arza/contracts';
import request from 'supertest';

import { seedProjects } from '../../../../src/modules/project/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { organizationBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';
import {
  active,
  created,
  day,
  people,
  put,
  versioned,
  type PendingRequest,
} from './contract-steps.js';

// Llamadas del recorrido de escrituras (B11) para Proyectos (B26): el proyecto y sus estados, el
// equipo, los hitos, los enlaces, las iteraciones y los ítems del tablero. Cada una prepara un
// proyecto nuevo por la API: en planeación sin contrato o en ejecución desde un contrato vigente.

export type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

export interface Crew {
  readonly leader: Person;
  readonly id: string;
  readonly base: string;
}

async function leaderOf(s: AccessScenario): Promise<Person> {
  await seedProjects(apiDatabase(), [s.tenant.id], systemClock);
  return s.person('lider-proyectos-recorrido', ['LIDER_TECNICO']);
}

function projectBody(s: AccessScenario, leader: Person, origin: object): object {
  return { contract_id: null, party_id: null, ...projectData(s, leader), ...origin };
}

/** Los datos que se editan con PUT: sin contrato ni cliente. */
function projectData(s: AccessScenario, leader: Person): object {
  return {
    name: 'Portal de clientes',
    type: 'development',
    methodology: 'scrum',
    description: null,
    starts_on: day(s, 0),
    ends_on: day(s, 90),
    budget_hours: 200,
    budget_amount: null,
    manager_id: leader.id,
  };
}

/** Proyecto en planeación, sin contrato, para un cliente nuevo. */
async function planned(s: AccessScenario): Promise<Crew> {
  const { sales } = await people(s);
  const leader = await leaderOf(s);
  const party = await created(s.post('/v1/parties', sales.session, organizationBody()));
  const id = await created(
    s.post('/v1/projects', leader.session, projectBody(s, leader, { party_id: party })),
  );
  return { leader, id, base: `/v1/projects/${id}` };
}

export async function detail(s: AccessScenario, crew: Crew): Promise<ProjectDetail> {
  return projectDetailSchema.parse((await s.get(crew.base, crew.leader.session)).body);
}

/** Paso con la versión vigente: la versión se pide antes de preparar la petición. */
export function step(
  s: AccessScenario,
  crew: Crew,
  path: string,
  version: number,
  body: object = {},
): PendingRequest {
  return { test: versioned(s.post(`${crew.base}${path}`, crew.leader.session, body), version) };
}

/** Proyecto en ejecución, desde un contrato vigente. */
export async function running(s: AccessScenario): Promise<Crew> {
  const { id: contractId } = await active(s);
  const leader = await leaderOf(s);
  const id = await created(
    s.post('/v1/projects', leader.session, projectBody(s, leader, { contract_id: contractId })),
  );
  const crew = { leader, id, base: `/v1/projects/${id}` };
  const { version } = await detail(s, crew);
  await step(s, crew, '/actions/start', version).test;
  return crew;
}

export function remove(s: AccessScenario, path: string, person: Person): request.Test {
  return request(s.app.getHttpServer())
    .delete(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token);
}

const ITEM_DATA = {
  title: 'Consultar facturas',
  acceptance_criteria: 'Ve sus facturas del último año.',
};

const ITEM = { type: 'story', ...ITEM_DATA };

export async function withItem(
  s: AccessScenario,
): Promise<Crew & { item: string; version: number }> {
  const crew = await running(s);
  const item = await created(s.post(`${crew.base}/items`, crew.leader.session, ITEM));
  const items = itemListResponseSchema.parse(
    (await s.get(`${crew.base}/items`, crew.leader.session)).body,
  );
  return { ...crew, item, version: items.data[0]?.version ?? 0 };
}

const SPRINT = (s: AccessScenario) => ({
  name: 'Iteración 1',
  starts_on: day(s, 1),
  ends_on: day(s, 14),
  goal: null,
});

async function withSprint(s: AccessScenario): Promise<Crew & { sprint: string }> {
  const crew = await running(s);
  const sprint = await created(s.post(`${crew.base}/sprints`, crew.leader.session, SPRINT(s)));
  return { ...crew, sprint };
}

async function sprintVersion(s: AccessScenario, crew: Crew, sprint: string): Promise<number> {
  return (await detail(s, crew)).sprints.find((row) => row.id === sprint)?.version ?? 0;
}

async function withMember(s: AccessScenario): Promise<Crew & { member: string; version: number }> {
  const crew = await planned(s);
  const developer = await s.person('equipo-proyectos-recorrido', ['EQUIPO_PROYECTO']);
  const member = await created(
    s.post(`${crew.base}/members`, crew.leader.session, {
      user_id: developer.id,
      role: 'development',
      allocation_pct: 50,
    }),
  );
  const version = (await detail(s, crew)).members.find((row) => row.id === member)?.version ?? 0;
  return { ...crew, member, version };
}

const MILESTONE = (s: AccessScenario) => ({
  name: 'Anticipo',
  due_on: day(s, 20),
  billing_pct: 30,
});

async function withMilestone(s: AccessScenario): Promise<Crew & { milestone: string }> {
  const crew = await planned(s);
  const milestone = await created(
    s.post(`${crew.base}/milestones`, crew.leader.session, MILESTONE(s)),
  );
  return { ...crew, milestone };
}

export const PROJECT_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/projects': async (s) => {
    const { sales } = await people(s);
    const leader = await leaderOf(s);
    const party = await created(s.post('/v1/parties', sales.session, organizationBody()));
    return {
      test: s.post('/v1/projects', leader.session, projectBody(s, leader, { party_id: party })),
    };
  },
  'PUT /v1/projects/{id}': async (s) => {
    const crew = await planned(s);
    const { version } = await detail(s, crew);
    const body = projectData(s, crew.leader);
    return { test: versioned(put(s, crew.base, crew.leader, body), version) };
  },
  'POST /v1/projects/{id}/actions/start': async (s) => {
    const { id: contractId } = await active(s);
    const leader = await leaderOf(s);
    const id = await created(
      s.post('/v1/projects', leader.session, projectBody(s, leader, { contract_id: contractId })),
    );
    const crew = { leader, id, base: `/v1/projects/${id}` };
    return step(s, crew, '/actions/start', (await detail(s, crew)).version);
  },
  'POST /v1/projects/{id}/actions/risk': async (s) => {
    const crew = await running(s);
    const { version } = await detail(s, crew);
    return step(s, crew, '/actions/risk', version, { reason: 'Falta el acceso.' });
  },
  'POST /v1/projects/{id}/actions/pause': async (s) => {
    const crew = await running(s);
    const { version } = await detail(s, crew);
    return step(s, crew, '/actions/pause', version, { reason: 'El cliente pidió esperar.' });
  },
  'POST /v1/projects/{id}/actions/resume': async (s) => {
    const crew = await running(s);
    const paused = step(s, crew, '/actions/pause', (await detail(s, crew)).version, {
      reason: 'Espera.',
    });
    await paused.test;
    return step(s, crew, '/actions/resume', (await detail(s, crew)).version);
  },
  'POST /v1/projects/{id}/actions/request-authorization': async (s) => {
    const crew = await planned(s);
    const { version } = await detail(s, crew);
    return step(s, crew, '/actions/request-authorization', version, { reason: 'Urgente.' });
  },
  'POST /v1/projects/{id}/members': async (s) => {
    const crew = await planned(s);
    const developer = await s.person('equipo-proyectos-recorrido', ['EQUIPO_PROYECTO']);
    const body = { user_id: developer.id, role: 'testing', allocation_pct: 40 };
    return { test: s.post(`${crew.base}/members`, crew.leader.session, body) };
  },
  'PUT /v1/projects/{id}/members/{memberId}': async (s) => {
    const crew = await withMember(s);
    const body = { role: 'testing', allocation_pct: 30 };
    const path = `${crew.base}/members/${crew.member}`;
    return { test: versioned(put(s, path, crew.leader, body), crew.version) };
  },
  'DELETE /v1/projects/{id}/members/{memberId}': async (s) => {
    const crew = await withMember(s);
    const path = `${crew.base}/members/${crew.member}`;
    return { test: versioned(remove(s, path, crew.leader), crew.version) };
  },
  'POST /v1/projects/{id}/milestones': async (s) => {
    const crew = await planned(s);
    return { test: s.post(`${crew.base}/milestones`, crew.leader.session, MILESTONE(s)) };
  },
  'PUT /v1/projects/{id}/milestones/{milestoneId}': async (s) => {
    const crew = await withMilestone(s);
    const path = `${crew.base}/milestones/${crew.milestone}`;
    return { test: versioned(put(s, path, crew.leader, { ...MILESTONE(s), billing_pct: 40 }), 1) };
  },
  'POST /v1/projects/{id}/milestones/{milestoneId}/actions/complete': async (s) => {
    const crew = await withMilestone(s);
    return step(s, crew, `/milestones/${crew.milestone}/actions/complete`, 1);
  },
  'POST /v1/projects/{id}/links': async (s) => {
    const crew = await planned(s);
    const body = { kind: 'repository', url: 'https://git.example.com/portal', label: 'Código' };
    return { test: s.post(`${crew.base}/links`, crew.leader.session, body) };
  },
  'DELETE /v1/projects/{id}/links/{linkId}': async (s) => {
    const crew = await planned(s);
    const body = { kind: 'design', url: 'https://design.example.com/portal', label: 'Diseño' };
    const link = await created(s.post(`${crew.base}/links`, crew.leader.session, body));
    return { test: remove(s, `${crew.base}/links/${link}`, crew.leader) };
  },
  'POST /v1/projects/{id}/items': async (s) => {
    const crew = await running(s);
    return { test: s.post(`${crew.base}/items`, crew.leader.session, ITEM) };
  },
  'PUT /v1/projects/{id}/items/{itemId}': async (s) => {
    const crew = await withItem(s);
    const path = `${crew.base}/items/${crew.item}`;
    return { test: versioned(put(s, path, crew.leader, ITEM_DATA), crew.version) };
  },
  'POST /v1/projects/{id}/items/{itemId}/actions/move': async (s) => {
    const crew = await withItem(s);
    return step(s, crew, `/items/${crew.item}/actions/move`, crew.version, {
      status: 'in_progress',
    });
  },
  'POST /v1/projects/{id}/items/{itemId}/actions/plan': async (s) => {
    const crew = await withItem(s);
    const sprint = await created(s.post(`${crew.base}/sprints`, crew.leader.session, SPRINT(s)));
    return step(s, crew, `/items/${crew.item}/actions/plan`, crew.version, { sprint_id: sprint });
  },
  'POST /v1/projects/{id}/sprints': async (s) => {
    const crew = await running(s);
    return { test: s.post(`${crew.base}/sprints`, crew.leader.session, SPRINT(s)) };
  },
  'PUT /v1/projects/{id}/sprints/{sprintId}': async (s) => {
    const crew = await withSprint(s);
    const version = await sprintVersion(s, crew, crew.sprint);
    const path = `${crew.base}/sprints/${crew.sprint}`;
    return { test: versioned(put(s, path, crew.leader, SPRINT(s)), version) };
  },
  'POST /v1/projects/{id}/sprints/{sprintId}/actions/start': async (s) => {
    const crew = await withSprint(s);
    const version = await sprintVersion(s, crew, crew.sprint);
    return step(s, crew, `/sprints/${crew.sprint}/actions/start`, version);
  },
  'POST /v1/projects/{id}/sprints/{sprintId}/actions/close': async (s) => {
    const crew = await withSprint(s);
    const started = step(
      s,
      crew,
      `/sprints/${crew.sprint}/actions/start`,
      await sprintVersion(s, crew, crew.sprint),
    );
    await started.test;
    const version = await sprintVersion(s, crew, crew.sprint);
    return step(s, crew, `/sprints/${crew.sprint}/actions/close`, version);
  },
};
