import { projectOptionsSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { ProjectScenario } from './support/project-scenario.js';

// Recorrido de Proyectos (B26, ficha 17.8): crear desde el contrato vigente, la autorización de la
// Dirección para iniciar sin él, los estados, el equipo, los hitos y los enlaces.

const scenario = new ProjectScenario('proyectos');

async function contractOptions(leader: Person): Promise<string[]> {
  const response = await scenario.get('/v1/projects/options', leader.session);
  return projectOptionsSchema.parse(response.body).contracts.map((row) => row.id);
}

/** La Dirección atiende desde Mis tareas la autorización pedida para el proyecto. */
async function decide(id: string, body: object): Promise<Person> {
  const director = await scenario.director();
  const task = await scenario.authorizationTask(id);
  const response = await scenario.post(
    `/v1/tasks/${task}/actions/complete`,
    director.session,
    body,
  );
  expect(response.status, response.text).toBeLessThan(300);
  return director;
}

describe('crear desde el contrato vigente', () => {
  it('el contrato aparece en el asistente, toma su cliente y su valor, y se inicia sin más', async () => {
    const leader = await scenario.leader();
    const contractId = await scenario.activeContract(await scenario.sales());
    expect(await contractOptions(leader)).toContain(contractId);
    const body = scenario.projectBody(leader, { contract_id: contractId });
    const id = await scenario.create('/v1/projects', leader, body);
    expect(await contractOptions(leader)).not.toContain(contractId);
    expect(await scenario.project(leader, id)).toMatchObject({
      code: expect.stringMatching(/^PRY-\d{4}-\d{4}$/u) as string,
      status: 'planning',
      contract: { id: contractId },
      contract_status: 'active',
      budget_amount: '12000000.00',
      budget_hours: 480.5,
      members: [{ person: { id: leader.id }, role: 'leader', allocation_pct: 100 }],
      can: { update: true, manage_members: true, manage_items: true },
    });
    expect((await scenario.projectStep(leader, id, 'start')).status).toBe(204);
    expect((await scenario.project(leader, id)).status).toBe('in_progress');
    const again = await scenario.post('/v1/projects', leader.session, body);
    expect(errorCode(again)).toBe('PROJECT_CONTRACT_INVALID');
  });
});

describe('crear desde el contrato vigente', () => {
  it('un contrato que no rige, de otro cliente, fechas al revés o un líder sin rol no sirven', async () => {
    const leader = await scenario.leader();
    const sales = await scenario.sales();
    const accountant = await scenario.person('contador', ['CONTADOR']);
    const draft = await scenario.contract(sales);
    const active = await scenario.activeContract(sales);
    const reversed = { starts_on: scenario.day(10), ends_on: scenario.day(1) };
    const cases: [object, string][] = [
      [{ contract_id: draft }, 'PROJECT_CONTRACT_INVALID'],
      [{ contract_id: active, party_id: await scenario.client(sales) }, 'PROJECT_PARTY_INVALID'],
      [{ party_id: null }, 'PROJECT_PARTY_INVALID'],
      [{ contract_id: active, ...reversed }, 'PROJECT_DATES_INVALID'],
      [{ contract_id: active, manager_id: accountant.id }, 'PROJECT_MEMBER_INVALID'],
    ];
    for (const [overrides, code] of cases) {
      const body = scenario.projectBody(leader, overrides);
      const response = await scenario.post('/v1/projects', leader.session, body);
      expect(errorCode(response), JSON.stringify(overrides)).toBe(code);
    }
  });
});

describe('sin contrato vigente, con la autorización de la Dirección', () => {
  it('no se inicia sin autorización; la Dirección la da desde Mis tareas', async () => {
    const leader = await scenario.leader();
    const id = await scenario.plannedProject(leader);
    expect(errorCode(await scenario.projectStep(leader, id, 'start'))).toBe(
      'PROJECT_AUTHORIZATION_REQUIRED',
    );
    const reason = { reason: 'El cliente firmará la próxima semana y necesita empezar ya.' };
    const asked = await scenario.projectStep(leader, id, 'request-authorization', reason);
    expect(asked.status, asked.text).toBe(204);
    const twice = await scenario.projectStep(leader, id, 'request-authorization', reason);
    expect(errorCode(twice)).toBe('PROJECT_STATUS_INVALID');
    const director = await decide(id, { action: 'authorize' });
    expect(await scenario.project(leader, id)).toMatchObject({
      status: 'in_progress',
      authorization: { status: 'granted', decided_by: { id: director.id } },
    });
    expect(await scenario.auditActions(id)).toEqual([
      'project.create',
      'project.authorization.request',
      'project.authorization.grant',
    ]);
  });
});

describe('sin contrato vigente, con la autorización de la Dirección', () => {
  it('si no autoriza, sigue en planeación con el comentario y se puede pedir de nuevo', async () => {
    const leader = await scenario.leader();
    const id = await scenario.plannedProject(leader);
    await scenario.projectStep(leader, id, 'request-authorization', { reason: 'Urgente.' });
    await decide(id, { action: 'deny', comment: 'Primero firme el contrato.' });
    expect(await scenario.project(leader, id)).toMatchObject({
      status: 'planning',
      authorization: { status: 'denied', note: 'Primero firme el contrato.' },
    });
    const again = await scenario.projectStep(leader, id, 'request-authorization', {
      reason: 'El cliente ya envió la orden de compra.',
    });
    expect(again.status, again.text).toBe(204);
  });
});

describe('estados del proyecto', () => {
  it('en riesgo y pausado piden motivo; se reanuda; no se salta pasos', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    expect((await scenario.projectStep(leader, id, 'risk', {})).status).toBe(422);
    const risk = await scenario.projectStep(leader, id, 'risk', { reason: 'Falta el acceso.' });
    expect(risk.status, risk.text).toBe(204);
    expect(await scenario.project(leader, id)).toMatchObject({
      status: 'at_risk',
      status_reason: 'Falta el acceso.',
    });
    const paused = await scenario.projectStep(leader, id, 'pause', { reason: 'Vacaciones.' });
    expect(paused.status).toBe(204);
    expect(errorCode(await scenario.projectStep(leader, id, 'start'))).toBe(
      'PROJECT_STATUS_INVALID',
    );
    expect((await scenario.projectStep(leader, id, 'resume')).status).toBe(204);
    expect(await scenario.project(leader, id)).toMatchObject({
      status: 'in_progress',
      status_reason: null,
    });
  });
});

describe('equipo', () => {
  it('el equipo no repite personas y el líder cambia editando el proyecto', async () => {
    const leader = await scenario.leader();
    const developer = await scenario.developer();
    const id = await scenario.plannedProject(leader);
    await scenario.addMember(leader, id, developer);
    const repeated = await scenario.post(`/v1/projects/${id}/members`, leader.session, {
      user_id: developer.id,
      role: 'testing',
      allocation_pct: 20,
    });
    expect(errorCode(repeated)).toBe('PROJECT_MEMBER_DUPLICATE');
    const { version } = await scenario.project(leader, id);
    const data = scenario.projectData(leader, { manager_id: developer.id });
    const saved = await scenario.put(`/v1/projects/${id}`, leader, data, version);
    expect(saved.status, saved.text).toBe(204);
    const { members } = await scenario.project(leader, id);
    expect(members.map((row) => [row.person.id, row.role])).toEqual(
      expect.arrayContaining([
        [developer.id, 'leader'],
        [leader.id, 'development'],
      ]),
    );
  });
});

describe('hitos y enlaces', () => {
  it('entre todos los hitos se factura máximo el 100 %', async () => {
    const leader = await scenario.leader();
    const id = await scenario.plannedProject(leader);
    const path = `/v1/projects/${id}/milestones`;
    const milestone = (name: string, pct: number) => ({
      name,
      due_on: scenario.day(30),
      billing_pct: pct,
    });
    await scenario.create(path, leader, milestone('Anticipo', 33.33));
    await scenario.create(path, leader, milestone('Entrega', 33.33));
    const over = await scenario.post(path, leader.session, milestone('Cierre', 33.35));
    expect(errorCode(over)).toBe('PROJECT_BILLING_EXCEEDED');
    await scenario.create(path, leader, milestone('Cierre', 33.34));
    expect((await scenario.project(leader, id)).milestones).toHaveLength(3);
  });
});

describe('hitos y enlaces', () => {
  it('los enlaces solo aceptan https y se pueden quitar', async () => {
    const leader = await scenario.leader();
    const id = await scenario.plannedProject(leader);
    const link = { kind: 'repository', label: 'Repositorio del cliente' };
    const path = `/v1/projects/${id}/links`;
    const insecure = await scenario.post(path, leader.session, {
      ...link,
      url: 'http://git.example.com/portal',
    });
    expect(insecure.status).toBe(422);
    const linkId = await scenario.create(path, leader, {
      ...link,
      url: 'https://git.example.com/portal',
    });
    expect((await scenario.project(leader, id)).links).toHaveLength(1);
    expect((await scenario.delete(`${path}/${linkId}`, leader.session)).status).toBe(204);
    expect((await scenario.project(leader, id)).links).toHaveLength(0);
  });
});
