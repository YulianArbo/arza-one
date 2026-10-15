import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { WfScenario } from './support/wf-scenario.js';

// Bandeja «Mis tareas», tareas de un rol, delegación y reasignación (B15, ficha 17.5).

const scenario = new WfScenario('tareas');

async function inReview() {
  const admin = await scenario.admin();
  const flow = await scenario.publish(admin);
  const requester = await scenario.people('solicitante', ['COLABORADOR']);
  const boss = await scenario.people('jefe', ['CALIDAD']);
  await scenario.reportsTo(requester, boss);
  const id = await scenario.startAs(requester, flow.key);
  await scenario.act(requester, (await scenario.onlyOpenTask(id)).id, 'complete', {
    action: 'submit',
  });
  return { admin, requester, boss, id, review: await scenario.onlyOpenTask(id) };
}

describe('bandeja «Mis tareas»', () => {
  it('muestra a cada quien sus tareas y por qué le llegaron', async () => {
    const { requester, boss, review } = await inReview();
    const mine = await scenario.mine(boss);
    expect(mine.find((task) => task.id === review.id)).toMatchObject({
      reason: 'assigned',
      kind: 'approval',
      status: 'pending',
      priority: 'normal',
      instance: { state: { key: 'review', label: 'Revisión' } },
    });
    expect((await scenario.mine(requester)).map((task) => task.id)).not.toContain(review.id);
    const closed = await scenario.mine(requester, 'closed');
    expect(closed.some((task) => task.status === 'completed')).toBe(true);
  });

  it('la tarea de un rol la ve todo el rol y la toma una persona', async () => {
    const { boss, id, review } = await inReview();
    await scenario.act(boss, review.id, 'approve');
    const quality = await scenario.people('calidad', ['CALIDAD']);
    const roleTask = await scenario.onlyOpenTask(id);
    const seen = (await scenario.mine(quality)).find((task) => task.id === roleTask.id);
    expect(seen).toMatchObject({ reason: 'role', assignee: null, assignee_role: 'CALIDAD' });
    await scenario.act(quality, roleTask.id, 'start');
    const taken = await scenario.onlyOpenTask(id);
    expect(taken).toMatchObject({ status: 'in_progress', assigneeId: quality.id });
    expect((await scenario.mine(boss)).map((task) => task.id)).not.toContain(roleTask.id);
    const again = await scenario.post(`/v1/tasks/${roleTask.id}/actions/start`, quality.session);
    expect(errorCode(again)).toBe('WF_TASK_ACTION_NOT_ALLOWED');
  });
});

describe('delegación', () => {
  it('el responsable entrega su tarea a otro colaborador; el plazo no cambia', async () => {
    const { boss, id, review } = await inReview();
    const colleague = await scenario.people('colega', ['COLABORADOR']);
    await scenario.act(boss, review.id, 'delegate', {
      to_user_id: colleague.id,
      comment: 'Vacaciones',
    });
    const handed = await scenario.onlyOpenTask(id);
    expect(handed).toMatchObject({
      assigneeId: colleague.id,
      delegatedFromId: boss.id,
      dueAt: review.dueAt,
    });
    const seen = (await scenario.mine(colleague)).find((task) => task.id === review.id);
    expect(seen?.delegated_from?.id).toBe(boss.id);
    const back = await scenario.post(`/v1/tasks/${review.id}/actions/delegate`, boss.session, {
      to_user_id: colleague.id,
    });
    expect(errorCode(back)).toBe('WF_TASK_ACTION_NOT_ALLOWED');
    const self = await scenario.post(`/v1/tasks/${review.id}/actions/delegate`, colleague.session, {
      to_user_id: colleague.id,
    });
    expect(errorCode(self)).toBe('WF_PERSON_INVALID');
  });
});

describe('delegación por correo', () => {
  it('quien no ve la lista de usuarios delega escribiendo el correo', async () => {
    const { boss, id, review } = await inReview();
    const colleague = await scenario.people('colega-correo', ['COLABORADOR']);
    await scenario.act(boss, review.id, 'delegate', { to_email: colleague.email.toUpperCase() });
    expect((await scenario.onlyOpenTask(id)).assigneeId).toBe(colleague.id);
    const unknown = await scenario.post(
      `/v1/tasks/${review.id}/actions/delegate`,
      colleague.session,
      {
        to_email: 'nadie@ejemplo.test',
      },
    );
    expect(errorCode(unknown)).toBe('WF_PERSON_INVALID');
  });
});

describe('delegación de aprobaciones (B10)', () => {
  it('con una delegación de aprobaciones vigente (B10), el delegado aprueba a nombre del jefe', async () => {
    const { boss, id, review } = await inReview();
    const deputy = await scenario.people('suplente', ['CALIDAD']);
    const now = scenario.clock.now();
    await scenario.inTenant((tx) =>
      tx.delegation.create({
        data: {
          tenantId: scenario.tenant.id,
          fromUserId: boss.id,
          toUserId: deputy.id,
          startsAt: new Date(now.getTime() - 60_000),
          endsAt: new Date(now.getTime() + 86_400_000),
          scope: ['doc.version.approve'],
          reason: 'Vacaciones',
        },
      }),
    );
    expect((await scenario.mine(deputy)).find((task) => task.id === review.id)?.reason).toBe(
      'delegation',
    );
    await scenario.act(deputy, review.id, 'approve', { comment: 'Aprobado en su ausencia' });
    const { history } = await scenario.instance(boss, id);
    const decision = history.find((entry) => entry.action_label === 'Aprobó');
    expect(decision).toMatchObject({ actor: { id: deputy.id }, on_behalf_of: { id: boss.id } });
  });
});

describe('reasignación y tareas cerradas', () => {
  it('quien reasigna entrega cualquier tarea abierta con un plazo nuevo', async () => {
    const { admin, id, review } = await inReview();
    const other = await scenario.people('otro', ['COLABORADOR']);
    // Tres días después: el plazo nuevo siempre queda más tarde, caiga en fin de semana o no.
    scenario.clock.advance(3 * 24 * 60 * 60 * 1000);
    const later = await scenario.refresh(admin);
    await scenario.act(later, review.id, 'reassign', { to_user_id: other.id });
    const moved = await scenario.onlyOpenTask(id);
    expect(moved).toMatchObject({ assigneeId: other.id, status: 'pending', escalatedToId: null });
    expect(moved.dueAt?.getTime()).toBeGreaterThan(review.dueAt?.getTime() ?? 0);
  });

  it('una tarea cerrada no admite más acciones', async () => {
    const { boss, review } = await inReview();
    await scenario.act(boss, review.id, 'approve');
    const twice = await scenario.post(`/v1/tasks/${review.id}/actions/approve`, boss.session);
    expect(errorCode(twice)).toBe('WF_TASK_CLOSED');
  });

  it('rechazar exige el motivo y una aprobación no se completa como acción', async () => {
    const { boss, review } = await inReview();
    const noReason = await scenario.post(`/v1/tasks/${review.id}/actions/reject`, boss.session, {});
    expect(noReason.status).toBe(422);
    const asAction = await scenario.post(`/v1/tasks/${review.id}/actions/complete`, boss.session, {
      action: 'approve',
    });
    expect(errorCode(asAction)).toBe('WF_TASK_ACTION_NOT_ALLOWED');
  });
});
