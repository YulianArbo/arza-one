import { createdResponseSchema, definitionSchema } from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { tenantScope } from '../../iam/support/iam-fixtures.js';
import { sampleFlow } from '../../wf/support/wf-scenario.js';

// Llamadas del recorrido de escrituras (B11) para las rutas de flujos y tareas (B15). El
// administrador de plataforma inicia los trámites de prueba; como no tiene jefe, las aprobaciones
// del jefe quedan «sin responsable» y las atiende él, que reasigna tareas.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function admin(s: AccessScenario): Promise<Person> {
  return s.person('admin-flujos-recorrido', ['ADMIN_PLATAFORMA']);
}

async function created(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

async function rowVersion(s: AccessScenario, person: Person, id: string): Promise<number> {
  const response = await s.get(`/v1/workflows/${id}`, person.session);
  return definitionSchema.parse(response.body).row_version;
}

function publishCall(s: AccessScenario, person: Person, id: string, version: number) {
  return s
    .post(`/v1/workflows/${id}/actions/publish`, person.session)
    .set('If-Match', String(version));
}

async function published(s: AccessScenario, person: Person): Promise<string> {
  const id = await created(s.post('/v1/workflows', person.session, sampleFlow()));
  await publishCall(s, person, id, await rowVersion(s, person, id));
  return id;
}

/** Trámite de prueba en «Borrador», con su tarea asignada al administrador. */
async function draftTask(s: AccessScenario, person: Person) {
  const flow = await published(s, person);
  const body = { title: 'Trámite del recorrido', facts: { amount: 500 } };
  const instance = await created(
    s.post(`/v1/workflows/${flow}/actions/start-test`, person.session, body),
  );
  const task = await tenantScope(
    s.db,
    s.tenant.id,
  )((tx) =>
    tx.workflowTask.findFirstOrThrow({ where: { instanceId: instance, completedAt: null } }),
  );
  return { instance, task: task.id };
}

/** Trámite en «Revisión»: la aprobación del jefe queda sin responsable. */
async function reviewTask(s: AccessScenario, person: Person): Promise<string> {
  const { instance, task } = await draftTask(s, person);
  await s.post(`/v1/tasks/${task}/actions/complete`, person.session, { action: 'submit' });
  const review = await tenantScope(
    s.db,
    s.tenant.id,
  )((tx) =>
    tx.workflowTask.findFirstOrThrow({ where: { instanceId: instance, completedAt: null } }),
  );
  return review.id;
}

async function colleague(s: AccessScenario): Promise<string> {
  return (await s.person('colega-flujos-recorrido', ['COLABORADOR'])).id;
}

export const WF_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/workflows': async (s) => ({
    test: s.post('/v1/workflows', (await admin(s)).session, sampleFlow()),
  }),
  'PATCH /v1/workflows/{id}': async (s) => {
    const person = await admin(s);
    const flow = sampleFlow();
    const id = await created(s.post('/v1/workflows', person.session, flow));
    const edit = {
      name: 'Editado',
      description: null,
      states: flow.states,
      transitions: flow.transitions,
    };
    return {
      test: s.patch(`/v1/workflows/${id}`, person.session, edit, await rowVersion(s, person, id)),
    };
  },
  'POST /v1/workflows/{id}/actions/publish': async (s) => {
    const person = await admin(s);
    const id = await created(s.post('/v1/workflows', person.session, sampleFlow()));
    return { test: publishCall(s, person, id, await rowVersion(s, person, id)) };
  },
  'POST /v1/workflows/{id}/actions/new-version': async (s) => {
    const person = await admin(s);
    const id = await published(s, person);
    return { test: s.post(`/v1/workflows/${id}/actions/new-version`, person.session) };
  },
  'POST /v1/workflows/{id}/actions/start-test': async (s) => {
    const person = await admin(s);
    const id = await published(s, person);
    return {
      test: s.post(`/v1/workflows/${id}/actions/start-test`, person.session, {
        title: 'Recorrido',
      }),
    };
  },
  'POST /v1/workflow-instances/{id}/actions/{action}': async (s) => {
    const person = await admin(s);
    const { instance } = await draftTask(s, person);
    const body = { comment: 'Cancelada en el recorrido' };
    return {
      test: s.post(`/v1/workflow-instances/${instance}/actions/cancel`, person.session, body),
    };
  },
  'POST /v1/tasks/{id}/actions/start': async (s) => {
    const person = await admin(s);
    const { task } = await draftTask(s, person);
    return { test: s.post(`/v1/tasks/${task}/actions/start`, person.session) };
  },
  'POST /v1/tasks/{id}/actions/complete': async (s) => {
    const person = await admin(s);
    const { task } = await draftTask(s, person);
    return {
      test: s.post(`/v1/tasks/${task}/actions/complete`, person.session, { action: 'submit' }),
    };
  },
  'POST /v1/tasks/{id}/actions/approve': async (s) => {
    const person = await admin(s);
    return {
      test: s.post(`/v1/tasks/${await reviewTask(s, person)}/actions/approve`, person.session),
    };
  },
  'POST /v1/tasks/{id}/actions/reject': async (s) => {
    const person = await admin(s);
    const task = await reviewTask(s, person);
    return {
      test: s.post(`/v1/tasks/${task}/actions/reject`, person.session, { comment: 'No procede' }),
    };
  },
  'POST /v1/tasks/{id}/actions/delegate': async (s) => {
    const person = await admin(s);
    const { task } = await draftTask(s, person);
    const body = { to_user_id: await colleague(s) };
    return { test: s.post(`/v1/tasks/${task}/actions/delegate`, person.session, body) };
  },
  'POST /v1/tasks/{id}/actions/reassign': async (s) => {
    const person = await admin(s);
    const { task } = await draftTask(s, person);
    const body = { to_user_id: await colleague(s) };
    return { test: s.post(`/v1/tasks/${task}/actions/reassign`, person.session, body) };
  },
};
