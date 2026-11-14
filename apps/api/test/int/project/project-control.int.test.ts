import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { DeliveryScenario } from './support/delivery-scenario.js';

// Control del proyecto (B27, ficha 17.8): revisiones de código FT-TEC-002, riesgos, liberaciones
// con informe de pruebas, incidentes, indicadores (el avance coincide con los ítems terminados) y
// el cierre, que exige todo aceptado y deja el proyecto solo para consulta.

const scenario = new DeliveryScenario('control de proyectos');

/** Proyecto en ejecución con una persona del equipo, además del líder. */
async function teamProject(): Promise<{ leader: Person; developer: Person; id: string }> {
  const leader = await scenario.leader();
  const developer = await scenario.developer();
  const id = await scenario.runningProject(leader);
  await scenario.addMember(leader, id, developer);
  return { leader, developer, id };
}

async function moveThrough(leader: Person, id: string, item: string, statuses: string[]) {
  for (const status of statuses) await scenario.itemStep(leader, id, item, 'move', { status });
}

describe('revisión de código (FT-TEC-002): quién revisa', () => {
  it('se revisa en revisión o pruebas, y quien hizo el ítem no se revisa', async () => {
    const { leader, developer, id } = await teamProject();
    const item = await scenario.item(leader, id, { assignee_id: developer.id });
    const path = `/v1/projects/${id}/code-reviews`;
    const early = await scenario.post(path, leader.session, scenario.reviewBody(item));
    expect(errorCode(early)).toBe('PROJECT_REVIEW_INVALID');
    await moveThrough(leader, id, item, ['in_progress', 'in_review']);
    const own = await scenario.post(path, developer.session, scenario.reviewBody(item));
    expect(errorCode(own)).toBe('PROJECT_REVIEW_INVALID');
  });
});

describe('revisión de código (FT-TEC-002): resultado', () => {
  it('con un punto que no cumple no se aprueba; queda su registro FT-TEC-002', async () => {
    const { leader, developer, id } = await teamProject();
    const item = await scenario.item(leader, id, { assignee_id: developer.id });
    await moveThrough(leader, id, item, ['in_progress', 'in_review']);
    const path = `/v1/projects/${id}/code-reviews`;
    const answers = ['yes', 'no', 'yes', 'yes', 'yes', 'yes', 'na', 'yes'];
    const body = scenario.reviewBody(item, { answers });
    expect(errorCode(await scenario.post(path, leader.session, body))).toBe(
      'PROJECT_REVIEW_INVALID',
    );
    const changes = { ...body, result: 'changes_requested' };
    const created = await scenario.post(path, leader.session, changes);
    expect(created.status, created.text).toBe(201);
    expect((await scenario.itemOf(leader, id, item)).last_review).toBe('changes_requested');
    const reviews = await scenario.get(`${path}?item_id=${item}`, developer.session);
    expect(reviews.status).toBe(200);
    const [first] = (reviews.body as { data: { record_code: string }[] }).data;
    expect(first?.record_code).toMatch(/^FT-TEC-002-\d{4}-\d{4}$/u);
  });
});

describe('riesgos y liberaciones', () => {
  it('un riesgo alto avisa al líder; la liberación exige su informe en PDF', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const risk = await scenario.create(`/v1/projects/${id}/risks`, leader, {
      description: 'El proveedor de pagos cambia su interfaz.',
      probability: 4,
      impact: 5,
      response: 'Encapsular la integración.',
      owner_id: leader.id,
    });
    expect(await scenario.outboxEvents(risk)).toEqual(['project.risk.high']);
    const release = {
      version_label: '1.0.0',
      environment: 'test',
      released_on: scenario.day(0),
      notes: 'Primera versión para pruebas del cliente.',
    };
    const path = `/v1/projects/${id}/releases`;
    const image = await scenario.signedCopy(leader, 'image/png');
    const bad = await scenario.post(path, leader.session, {
      ...release,
      test_report_file_id: image,
    });
    expect(errorCode(bad)).toBe('PROJECT_FILE_INVALID');
    const report = await scenario.signedCopy(leader);
    const done = await scenario.post(path, leader.session, {
      ...release,
      test_report_file_id: report,
    });
    expect(done.status, done.text).toBe(201);
  });
});

it('el incidente con datos personales avisa al Oficial de datos; se resuelve con su causa', async () => {
  const leader = await scenario.leader();
  const officer = await scenario.person('oficial', ['OFICIAL_DATOS']);
  const id = await scenario.runningProject(leader);
  const incident = await scenario.create(`/v1/projects/${id}/incidents`, leader, {
    title: 'Acceso indebido a reportes',
    kind: 'security',
    severity: 'critical',
    description: 'Un enlace de reporte quedó público por error.',
    detected_at: scenario.clock.now().toISOString(),
    personal_data: true,
  });
  await scenario.dispatchNotices();
  expect((await scenario.noticesFor(officer.id)).join(' ')).toContain('SIC');
  const list = await scenario.get(`/v1/projects/${id}/incidents`, leader.session);
  const [row] = (list.body as { data: { code: string; version: number }[] }).data;
  expect(row?.code).toMatch(/^INC-\d{4}-\d{4}$/u);
  const path = `/v1/projects/${id}/incidents/${incident}/actions/resolve`;
  const version = row?.version ?? 0;
  const resolution = {
    resolved_at: scenario.clock.now().toISOString(),
    root_cause: 'Permiso público por omisión.',
    actions: 'Enlaces firmados y revisión de permisos.',
  };
  for (const offset of [-60_000, 60_000]) {
    const outsideWindow = await scenario.action(path, leader, version, {
      ...resolution,
      resolved_at: new Date(scenario.clock.now().getTime() + offset).toISOString(),
    });
    expect(outsideWindow.status).toBe(422);
  }
  const stale = await scenario.action(path, leader, version + 1, resolution);
  expect(stale.status).toBe(409);
  const resolved = await scenario.action(path, leader, version, resolution);
  expect(resolved.status, resolved.text).toBe(204);
  const repeated = await scenario.action(path, leader, version + 1, resolution);
  expect(errorCode(repeated)).toBe('PROJECT_STATUS_INVALID');
});
it('avisa al líder al subir un riesgo y lo excluye del indicador al cerrarlo', async () => {
  const leader = await scenario.leader();
  const outsider = await scenario.developer();
  const id = await scenario.runningProject(leader);
  const path = `/v1/projects/${id}/risks`;
  const risk = {
    description: 'El proveedor puede retrasar su entrega.',
    probability: 1,
    impact: 2,
    response: 'Acordar una fecha de respaldo.',
    owner_id: leader.id,
    status: 'open',
  };
  expect(
    errorCode(await scenario.post(path, leader.session, { ...risk, owner_id: outsider.id })),
  ).toBe('PROJECT_MEMBER_INVALID');
  const riskId = await scenario.create(path, leader, risk);
  const [row] = ((await scenario.get(path, leader.session)).body as { data: { version: number }[] })
    .data;
  if (row === undefined) throw new Error('No aparece el riesgo registrado');
  const high = { ...risk, probability: 5, impact: 5 };
  expect((await scenario.put(`${path}/${riskId}`, leader, high, row.version + 1)).status).toBe(409);
  expect((await scenario.put(`${path}/${riskId}`, leader, high, row.version)).status).toBe(204);
  expect((await scenario.indicators(leader, id)).risks_high).toBe(1);
  expect(await scenario.outboxEvents(riskId)).toContain('project.risk.high');
  const closed = await scenario.put(
    `${path}/${riskId}`,
    leader,
    { ...high, status: 'closed' },
    row.version + 1,
  );
  expect(closed.status, closed.text).toBe(204);
  expect((await scenario.indicators(leader, id)).risks_high).toBe(0);
});

/** Dos historias y una épica; una historia terminada con su revisión aprobada. */
async function oneDone(leader: Person, id: string): Promise<void> {
  const done = await scenario.item(leader, id);
  await scenario.item(leader, id, { title: 'Segunda historia' });
  await scenario.item(leader, id, { type: 'epic', title: 'Épica que no cuenta' });
  await moveThrough(leader, id, done, ['in_progress', 'in_review', 'in_testing']);
  await scenario.approveReview(leader, id, done);
  const moved = await scenario.itemStep(leader, id, done, 'move', {
    status: 'done',
    test_note: 'Pruebas automáticas y revisión en el entorno de pruebas.',
  });
  expect(moved.status, moved.text).toBe(204);
}

describe('indicadores', () => {
  it('el avance coincide con los ítems terminados; el equipo no ve la rentabilidad', async () => {
    const { leader, developer, id } = await teamProject();
    await oneDone(leader, id);
    const project = await scenario.project(leader, id);
    await scenario.put(
      `/v1/projects/${id}/control-settings`,
      leader,
      { hour_cost: '50000.00', respond_days: 10, tacit_acceptance: false, tacit_clause: null },
      project.version,
    );
    const indicators = await scenario.indicators(leader, id);
    expect(indicators.progress).toEqual({ planned: 2, done: 1, percent: 50 });
    expect(indicators.progress).toEqual((await scenario.project(leader, id)).progress);
    expect(indicators.money).toMatchObject({ income: '12000000.00', cost: '0.00' });
    expect((await scenario.indicators(developer, id)).money).toBeNull();
    expect((await scenario.project(developer, id)).control.hour_cost).toBeNull();
  });
});

describe('cierre', () => {
  it('no se cierra con pendientes; cerrado, solo se consulta', async () => {
    const delivery = await scenario.deliveryProject();
    const { leader, projectId } = delivery;
    const lessons = { lessons: 'Conviene acordar antes el plan de pruebas con el cliente.' };
    const deliverable = await scenario.create(
      `/v1/projects/${projectId}/deliverables`,
      leader,
      scenario.deliverableBody(),
    );
    expect((await scenario.projectStep(leader, projectId, 'start-closing')).status).toBe(204);
    const blocked = await scenario.projectStep(leader, projectId, 'close', lessons);
    expect(errorCode(blocked)).toBe('PROJECT_CLOSING_BLOCKED');
    await scenario.deliveredToClient(delivery, deliverable);
    await scenario.clientSigns(delivery.client.signers[0]?.email ?? '');
    await scenario.acceptanceWork();
    const closed = await scenario.projectStep(leader, projectId, 'close', lessons);
    expect(closed.status, closed.text).toBe(204);
    expect((await scenario.project(leader, projectId)).status).toBe('closed');
    expect(errorCode(await scenario.logTime(leader, projectId))).toBe('PROJECT_STATUS_INVALID');
  });
});
