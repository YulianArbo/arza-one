import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { ProjectScenario } from './support/project-scenario.js';

// Lista de pendientes, iteraciones y tablero (B26, ficha 17.8): la numeración por proyecto, la
// jerarquía, los criterios de aceptación para entrar a una iteración, las columnas del tablero y la
// evidencia para terminar.

const scenario = new ProjectScenario('tablero de proyectos');

const EVIDENCE = {
  review_url: 'https://git.example.com/portal/pull/12',
  test_note: 'Pruebas unitarias y revisión manual en el entorno de pruebas.',
};

describe('lista de pendientes', () => {
  it('numera los ítems dentro del proyecto y respeta la jerarquía', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const { code } = await scenario.project(leader, id);
    const epic = await scenario.item(leader, id, { type: 'epic', title: 'Facturación' });
    const story = await scenario.item(leader, id, { parent_id: epic });
    const task = await scenario.item(leader, id, { type: 'task', parent_id: story });
    const items = await scenario.items(leader, id);
    expect(items.map((item) => [item.number, item.code])).toEqual([
      [1, `${code}-1`],
      [2, `${code}-2`],
      [3, `${code}-3`],
    ]);
    expect(items.find((item) => item.id === task)?.parent).toMatchObject({ id: story, number: 2 });
    const wrong = [
      { type: 'epic', parent_id: epic },
      { type: 'story', parent_id: task },
      { type: 'task', parent_id: crypto.randomUUID() },
    ];
    for (const body of wrong) {
      const response = await scenario.post(
        `/v1/projects/${id}/items`,
        leader.session,
        scenario.itemBody(body),
      );
      expect(errorCode(response), JSON.stringify(body)).toBe('PROJECT_ITEM_PARENT_INVALID');
    }
  });
});

describe('iteraciones', () => {
  it('un ítem sin criterios de aceptación no entra; una épica tampoco', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const sprint = await scenario.sprint(leader, id);
    const bare = await scenario.item(leader, id, { type: 'task', acceptance_criteria: null });
    const epic = await scenario.item(leader, id, { type: 'epic' });
    for (const item of [bare, epic]) {
      const response = await scenario.itemStep(leader, id, item, 'plan', { sprint_id: sprint });
      expect(errorCode(response)).toBe('PROJECT_ITEM_CRITERIA_REQUIRED');
    }
    const ready = await scenario.item(leader, id);
    expect((await scenario.itemStep(leader, id, ready, 'plan', { sprint_id: sprint })).status).toBe(
      204,
    );
    const current = await scenario.itemOf(leader, id, ready);
    const cleared = await scenario.put(
      `/v1/projects/${id}/items/${ready}`,
      leader,
      { title: current.title, acceptance_criteria: null },
      current.version,
    );
    expect(errorCode(cleared)).toBe('PROJECT_ITEM_CRITERIA_REQUIRED');
  });
});

describe('iteraciones', () => {
  it('solo una en curso, dentro de las fechas del proyecto; al cerrar vuelve lo pendiente', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const outside = await scenario.post(`/v1/projects/${id}/sprints`, leader.session, {
      name: 'Fuera de fechas',
      starts_on: scenario.day(-5),
      ends_on: scenario.day(5),
      goal: null,
    });
    expect(errorCode(outside)).toBe('PROJECT_DATES_INVALID');
    const first = await scenario.sprint(leader, id);
    const second = await scenario.sprint(leader, id, { name: 'Iteración 2' });
    expect((await scenario.sprintStep(leader, id, first, 'start')).status).toBe(204);
    expect(errorCode(await scenario.sprintStep(leader, id, second, 'start'))).toBe(
      'PROJECT_SPRINT_ACTIVE',
    );
    const open = await scenario.item(leader, id);
    const finished = await scenario.item(leader, id, { title: 'Descargar facturas' });
    for (const item of [open, finished]) {
      await scenario.itemStep(leader, id, item, 'plan', { sprint_id: first });
    }
    for (const status of ['in_progress', 'in_review', 'in_testing']) {
      await scenario.itemStep(leader, id, finished, 'move', { status });
    }
    await scenario.itemStep(leader, id, finished, 'move', { status: 'done', ...EVIDENCE });
    expect((await scenario.sprintStep(leader, id, first, 'close')).status).toBe(204);
    expect((await scenario.itemOf(leader, id, open)).sprint_id).toBeNull();
    expect((await scenario.itemOf(leader, id, finished)).sprint_id).toBe(first);
    expect((await scenario.project(leader, id)).progress).toEqual({
      planned: 2,
      done: 1,
      percent: 50,
    });
  });
});

describe('tablero', () => {
  it('avanza de a una columna y no termina sin la revisión de código y las pruebas', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const item = await scenario.item(leader, id);
    const skip = await scenario.itemStep(leader, id, item, 'move', { status: 'in_review' });
    expect(errorCode(skip)).toBe('PROJECT_ITEM_MOVE_INVALID');
    for (const status of ['in_progress', 'in_review', 'in_testing']) {
      const moved = await scenario.itemStep(leader, id, item, 'move', { status });
      expect(moved.status, moved.text).toBe(204);
    }
    const bare = await scenario.itemStep(leader, id, item, 'move', { status: 'done' });
    expect(errorCode(bare)).toBe('PROJECT_ITEM_EVIDENCE_REQUIRED');
    const done = await scenario.itemStep(leader, id, item, 'move', { status: 'done', ...EVIDENCE });
    expect(done.status, done.text).toBe(204);
    const board = await scenario.board(leader, id);
    expect(board.sprint).toBeNull();
    expect(board.items.find((row) => row.id === item)).toMatchObject({
      status: 'done',
      ...EVIDENCE,
    });
    const back = await scenario.itemStep(leader, id, item, 'move', { status: 'in_progress' });
    expect(back.status, back.text).toBe(204);
    expect((await scenario.itemOf(leader, id, item)).done_at).toBeNull();
  });
});

describe('tablero', () => {
  it('el tablero muestra la iteración en curso y no se mueve con el proyecto pausado', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const sprint = await scenario.sprint(leader, id);
    const inside = await scenario.item(leader, id);
    await scenario.item(leader, id, { title: 'Fuera de la iteración' });
    await scenario.itemStep(leader, id, inside, 'plan', { sprint_id: sprint });
    await scenario.sprintStep(leader, id, sprint, 'start');
    const board = await scenario.board(leader, id);
    expect(board.sprint).toMatchObject({ id: sprint, status: 'active', items: 1 });
    expect(board.items.map((row) => row.id)).toEqual([inside]);
    await scenario.projectStep(leader, id, 'pause', { reason: 'El cliente pidió esperar.' });
    const moved = await scenario.itemStep(leader, id, inside, 'move', { status: 'in_progress' });
    expect(errorCode(moved)).toBe('PROJECT_STATUS_INVALID');
  });
});

describe('tablero', () => {
  it('otra persona movió el ítem: la versión vieja no pisa el cambio', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const item = await scenario.item(leader, id);
    const seen = await scenario.itemOf(leader, id, item);
    await scenario.itemStep(leader, id, item, 'move', { status: 'in_progress' });
    const stale = await scenario.action(
      `/v1/projects/${id}/items/${item}/actions/move`,
      leader,
      seen.version,
      { status: 'pending' },
    );
    expect(stale.status).toBe(409);
  });
});
