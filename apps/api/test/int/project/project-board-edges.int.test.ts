import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { ProjectScenario } from './support/project-scenario.js';

// Casos límite del tablero (B26): las épicas no se mueven, un ítem no cuelga de sí mismo y nada se
// planea en una iteración cerrada. Datos ficticios.

const scenario = new ProjectScenario('proyectos tablero limites');

describe('tablero', () => {
  it('no mueve épicas, no cuelga un ítem de sí mismo ni planea en una iteración cerrada', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const epic = await scenario.item(leader, id, { type: 'epic', acceptance_criteria: null });
    const move = await scenario.itemStep(leader, id, epic, 'move', { status: 'in_progress' });
    expect(errorCode(move)).toBe('PROJECT_ITEM_MOVE_INVALID');
    const story = await scenario.item(leader, id);
    const { version } = await scenario.itemOf(leader, id, story);
    const self = { ...scenario.itemBody({ parent_id: story }), type: undefined };
    const saved = await scenario.put(`/v1/projects/${id}/items/${story}`, leader, self, version);
    expect(errorCode(saved)).toBe('PROJECT_ITEM_MOVE_INVALID');
    const sprint = await scenario.sprint(leader, id);
    expect((await scenario.sprintStep(leader, id, sprint, 'start')).status).toBe(204);
    expect((await scenario.sprintStep(leader, id, sprint, 'close')).status).toBe(204);
    const plan = await scenario.itemStep(leader, id, story, 'plan', { sprint_id: sprint });
    expect(errorCode(plan)).toBe('PROJECT_STATUS_INVALID');
  });
});
