import { taskListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { businessHoursDeadline } from '../../../src/modules/core/index.js';
import { escalateOverdueTasks } from '../../../src/modules/wf/index.js';
import { apiDatabase } from '../support/integration-database.js';
import { WfScenario } from './support/wf-scenario.js';

// Vencimientos y escalamiento (ficha 17.5): «una tarea vencida escala al jefe inmediato y queda
// visible en el tablero». Los plazos se cuentan en horas hábiles con los festivos de la empresa.

const scenario = new WfScenario('escalamiento');
const MONTH = 30 * 24 * 60 * 60 * 1000;

/** Ejecuta el trabajo del worker como si fuera dentro de un mes. */
function runOverdueCheck(): Promise<number> {
  const later = new Date(scenario.clock.now().getTime() + MONTH);
  return escalateOverdueTasks({ database: apiDatabase(), clock: { now: () => later } });
}

async function overdueDraft(withBoss: boolean) {
  const admin = await scenario.admin();
  const flow = await scenario.publish(admin);
  const requester = await scenario.people('solicitante', ['COLABORADOR']);
  const boss = await scenario.people('jefe', ['COLABORADOR']);
  if (withBoss) await scenario.reportsTo(requester, boss);
  const id = await scenario.startAs(requester, flow.key);
  const task = await scenario.onlyOpenTask(id);
  expect(await runOverdueCheck()).toBeGreaterThan(0);
  return { admin, requester, boss, id, task };
}

describe('una tarea vencida escala al jefe inmediato (criterio de la ficha 17.5)', () => {
  it('queda vencida, llega a la bandeja del jefe y se ve en el tablero', async () => {
    const { admin, boss, id, task } = await overdueDraft(true);
    expect(await scenario.onlyOpenTask(id)).toMatchObject({
      status: 'overdue',
      escalatedToId: boss.id,
    });
    const inbox = (await scenario.mine(boss)).find((t) => t.id === task.id);
    expect(inbox).toMatchObject({ reason: 'escalation', status: 'overdue' });
    const board = await scenario.get('/v1/tasks?escalated=true&status=overdue', admin.session);
    const listed = taskListResponseSchema.parse(board.body).data.find((t) => t.id === task.id);
    expect(listed?.escalated_to?.id).toBe(boss.id);
  });

  it('el escalamiento queda en la auditoría a nombre del sistema y no se repite', async () => {
    const { task } = await overdueDraft(true);
    await runOverdueCheck();
    const events = await scenario.inTenant((tx) =>
      tx.auditEvent.findMany({ where: { entityId: task.id, action: 'wf.task.escalate' } }),
    );
    expect(events.map((event) => [event.actorKind, event.actorId])).toEqual([['system', null]]);
  });

  it('sin jefe a quien escalar, la atiende quien reasigna tareas', async () => {
    const { admin, task } = await overdueDraft(false);
    const inbox = (await scenario.mine(admin)).find((t) => t.id === task.id);
    expect(inbox).toMatchObject({ reason: 'unassigned', status: 'overdue', escalated_to: null });
  });

  it('una tarea vencida todavía se puede completar', async () => {
    const { requester, boss, id, task } = await overdueDraft(true);
    await scenario.act(requester, task.id, 'complete', { action: 'submit' });
    expect((await scenario.onlyOpenTask(id)).assigneeId).toBe(boss.id);
    const closed = await scenario.mine(requester, 'closed');
    expect(closed.find((t) => t.id === task.id)?.status).toBe('completed');
  });
});

describe('plazos en horas hábiles con el calendario de la empresa', () => {
  const bogota = (local: string) => new Date(`${local}-05:00`);
  const deadline = (from: string, hours: number) =>
    scenario.inTenant((tx) => businessHoursDeadline(tx, bogota(from), hours));

  it('del viernes en la tarde pasa al lunes', async () => {
    expect(await deadline('2026-10-16T16:00:00', 4)).toEqual(bogota('2026-10-19T11:00:00'));
  });

  it('salta los festivos de la empresa', async () => {
    expect(await deadline('2026-10-09T16:00:00', 4)).toEqual(bogota('2026-10-13T11:00:00'));
  });
});
