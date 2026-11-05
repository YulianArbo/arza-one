import { projectListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { ProjectScenario } from './support/project-scenario.js';

// Casos límite de Proyectos (B26): filtros y páginas, registros que no existen y pasos que ya no
// aplican a iteraciones, hitos e ítems terminados. Datos ficticios.

const scenario = new ProjectScenario('proyectos casos limite');

const MISSING = '0190a000-0000-7000-8000-000000000004';

describe('listados', () => {
  it('los proyectos se filtran por estado y pasan de página; los ítems, por tipo e iteración', async () => {
    const leader = await scenario.leader();
    const id = await scenario.plannedProject(leader);
    await scenario.plannedProject(leader);
    const first = projectListResponseSchema.parse(
      (await scenario.get('/v1/projects?status=planning&limit=1', leader.session)).body,
    );
    expect(first.next_cursor).not.toBeNull();
    const next = await scenario.get(
      `/v1/projects?status=planning&limit=1&cursor=${first.next_cursor ?? ''}`,
      leader.session,
    );
    expect(projectListResponseSchema.parse(next.body).data).toHaveLength(1);
    const story = await scenario.item(leader, id, { estimate_hours: 6 });
    const sprint = await scenario.sprint(leader, id);
    expect(await scenario.items(leader, id, '?type=story&backlog=true')).toEqual([
      expect.objectContaining({ id: story, estimate_hours: 6 }),
    ]);
    expect(await scenario.items(leader, id, `?sprint_id=${sprint}`)).toEqual([]);
  });
});

describe('registros que no existen', () => {
  it('ítem, iteración, hito y miembro responden que no se encontraron', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const base = `/v1/projects/${id}`;
    const missing = [
      scenario.action(`${base}/items/${MISSING}/actions/move`, leader, 1, {
        status: 'in_progress',
      }),
      scenario.action(`${base}/sprints/${MISSING}/actions/start`, leader, 1),
      scenario.action(`${base}/milestones/${MISSING}/actions/complete`, leader, 1),
      scenario.put(
        `${base}/members/${MISSING}`,
        leader,
        { role: 'testing', allocation_pct: 10 },
        1,
      ),
    ];
    for (const response of await Promise.all(missing)) {
      expect(errorCode(response)).toBe('PROJECT_NOT_FOUND');
    }
    const leaderRole = {
      user_id: (await scenario.developer()).id,
      role: 'leader',
      allocation_pct: 5,
    };
    expect(errorCode(await scenario.post(`${base}/members`, leader.session, leaderRole))).toBe(
      'PROJECT_MEMBER_INVALID',
    );
  });
});

describe('pasos que ya no aplican', () => {
  it('iteraciones y hitos no repiten su paso ni cambian después de cerrarse', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const sprint = await scenario.sprint(leader, id);
    expect(errorCode(await scenario.sprintStep(leader, id, sprint, 'close'))).toBe(
      'PROJECT_STATUS_INVALID',
    );
    expect((await scenario.sprintStep(leader, id, sprint, 'start')).status).toBe(204);
    expect(errorCode(await scenario.sprintStep(leader, id, sprint, 'start'))).toBe(
      'PROJECT_STATUS_INVALID',
    );
    expect((await scenario.sprintStep(leader, id, sprint, 'close')).status).toBe(204);
    const closed = {
      name: 'Iteración 1',
      starts_on: scenario.day(1),
      ends_on: scenario.day(14),
      goal: null,
    };
    expect(
      errorCode(await scenario.put(`/v1/projects/${id}/sprints/${sprint}`, leader, closed, 3)),
    ).toBe('PROJECT_STATUS_INVALID');
    const milestone = { name: 'Anticipo', due_on: scenario.day(20), billing_pct: 30 };
    const milestoneId = await scenario.create(`/v1/projects/${id}/milestones`, leader, milestone);
    const complete = `/v1/projects/${id}/milestones/${milestoneId}/actions/complete`;
    expect((await scenario.action(complete, leader, 1)).status).toBe(204);
    expect(errorCode(await scenario.action(complete, leader, 2))).toBe('PROJECT_STATUS_INVALID');
    const path = `/v1/projects/${id}/milestones/${milestoneId}`;
    expect(errorCode(await scenario.put(path, leader, milestone, 2))).toBe(
      'PROJECT_STATUS_INVALID',
    );
  });
});
