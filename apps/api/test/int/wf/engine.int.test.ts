import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { WfScenario } from './support/wf-scenario.js';

// El motor de flujos de punta a punta (B15, ficha 17.5): tareas del nuevo estado, aprobación en
// serie y en paralelo, transiciones imposibles e historial con actor, fecha, decisión y comentario.

const scenario = new WfScenario('motor de flujos');

async function cast() {
  const admin = await scenario.admin();
  const flow = await scenario.publish(admin);
  const requester = await scenario.people('solicitante', ['COLABORADOR']);
  const boss = await scenario.people('jefe', ['COLABORADOR']);
  const quality = await scenario.people('calidad', ['CALIDAD']);
  await scenario.reportsTo(requester, boss);
  return { admin, flow, requester, boss, quality };
}

describe('aprobación en serie: jefe inmediato y luego Calidad', () => {
  it('lleva el trámite del borrador a aprobado con las tareas de cada paso', async () => {
    const { flow, requester, boss, quality } = await cast();
    const id = await scenario.startAs(requester, flow.key);
    const draft = await scenario.onlyOpenTask(id);
    expect(draft).toMatchObject({ kind: 'action', assigneeId: requester.id, stateKey: 'draft' });
    expect(draft.dueAt).not.toBeNull();
    await scenario.act(requester, draft.id, 'complete', { action: 'submit' });

    const first = await scenario.onlyOpenTask(id);
    expect(first).toMatchObject({ kind: 'approval', assigneeId: boss.id, sequence: 0 });
    await scenario.act(boss, first.id, 'approve', { comment: 'Visto bueno del jefe' });

    const second = await scenario.onlyOpenTask(id);
    expect(second).toMatchObject({ assigneeId: null, assigneeRole: 'CALIDAD', sequence: 1 });
    expect((await scenario.mine(quality)).map((task) => task.id)).toContain(second.id);
    await scenario.act(quality, second.id, 'approve');

    const instance = await scenario.instance(requester, id);
    expect(instance.state).toEqual({ key: 'done', label: 'Aprobada', kind: 'final' });
    expect(instance.completed_at).not.toBeNull();
    expect(await scenario.openTasks(id)).toEqual([]);
  });
});

describe('historial del flujo (ficha 17.5)', () => {
  it('el historial muestra actor, fecha, decisión y comentario de cada paso', async () => {
    const { flow, requester, boss } = await cast();
    const id = await scenario.startAs(requester, flow.key);
    await scenario.act(requester, (await scenario.onlyOpenTask(id)).id, 'complete', {
      action: 'submit',
      comment: 'Lista para revisar',
    });
    const review = await scenario.onlyOpenTask(id);
    await scenario.act(boss, review.id, 'reject', { comment: 'Falta la cotización' });
    const { history, state } = await scenario.instance(requester, id);
    expect(state.key).toBe('draft');
    const rows = history.map((h) => [h.action_label, h.actor?.id, h.comment, h.to_state.key]);
    expect(rows).toEqual([
      ['Inició el trámite', requester.id, null, 'draft'],
      ['Enviar', requester.id, 'Lista para revisar', 'review'],
      ['Rechazó', boss.id, 'Falta la cotización', 'review'],
      ['Devolver', boss.id, 'Falta la cotización', 'draft'],
    ]);
    expect(history.every((h) => !Number.isNaN(Date.parse(h.occurred_at)))).toBe(true);
  });
});

describe('aprobación en paralelo: Dirección y Finanzas', () => {
  it('espera a que aprueben todos; un rechazo rechaza y cancela lo pendiente', async () => {
    const { flow, requester } = await cast();
    const director = await scenario.people('director', ['DIRECCION']);
    const finance = await scenario.people('finanzas', ['ADMIN_FINANCIERO']);
    const approved = await scenario.startAs(requester, flow.key, { amount: '1000.01' });
    await scenario.act(requester, (await scenario.onlyOpenTask(approved)).id, 'complete', {
      action: 'submit_board',
    });
    const [toDirector, toFinance] = await scenario.openTasks(approved);
    expect([toDirector?.assigneeRole, toFinance?.assigneeRole]).toEqual([
      'DIRECCION',
      'ADMIN_FINANCIERO',
    ]);
    await scenario.act(director, toDirector?.id ?? '', 'approve');
    expect((await scenario.instance(requester, approved)).state.key).toBe('board');
    await scenario.act(finance, toFinance?.id ?? '', 'approve');
    expect((await scenario.instance(requester, approved)).state.key).toBe('done');

    const rejected = await scenario.startAs(requester, flow.key, { amount: 5000 });
    await scenario.act(requester, (await scenario.onlyOpenTask(rejected)).id, 'complete', {
      action: 'submit_board',
    });
    const [first] = await scenario.openTasks(rejected);
    await scenario.act(director, first?.id ?? '', 'reject', { comment: 'No hay presupuesto' });
    expect((await scenario.instance(requester, rejected)).state.key).toBe('rejected');
    expect(await scenario.openTasks(rejected)).toEqual([]);
  });
});

describe('una transición no definida es rechazada por la API (criterio de B15)', () => {
  it('rechaza acciones que el flujo no define para el estado actual', async () => {
    const { flow, requester } = await cast();
    const id = await scenario.startAs(requester, flow.key);
    for (const action of ['approve', 'fly', 'submit_board']) {
      const response = await scenario.post(
        `/v1/workflow-instances/${id}/actions/${action}`,
        requester.session,
      );
      const expected =
        action === 'submit_board' ? 'WF_CONDITION_NOT_MET' : 'WF_TRANSITION_NOT_ALLOWED';
      expect(errorCode(response), action).toBe(expected);
    }
    const draft = await scenario.onlyOpenTask(id);
    const viaTask = await scenario.post(
      `/v1/tasks/${draft.id}/actions/complete`,
      requester.session,
      {
        action: 'approve',
      },
    );
    expect(errorCode(viaTask)).toBe('WF_TRANSITION_NOT_ALLOWED');
    expect((await scenario.instance(requester, id)).state.key).toBe('draft');
  });

  it('aprobar un estado de aprobación solo se hace con las decisiones de sus tareas', async () => {
    const { flow, requester, boss } = await cast();
    const id = await scenario.startAs(requester, flow.key);
    await scenario.act(requester, (await scenario.onlyOpenTask(id)).id, 'complete', {
      action: 'submit',
    });
    const response = await scenario.post(
      `/v1/workflow-instances/${id}/actions/approve`,
      boss.session,
    );
    expect(errorCode(response)).toBe('WF_TRANSITION_NOT_ALLOWED');
    expect((await scenario.instance(boss, id)).state.key).toBe('review');
  });
});

describe('permiso y comentario de la transición', () => {
  it('cancelar exige el permiso de la transición y el comentario', async () => {
    const { admin, flow, requester } = await cast();
    const id = await scenario.startAs(requester, flow.key);
    const own = await scenario.post(
      `/v1/workflow-instances/${id}/actions/cancel`,
      requester.session,
      {
        comment: 'Ya no la necesito',
      },
    );
    expect(errorCode(own)).toBe('PERMISSION_DENIED');
    const silent = await scenario.post(
      `/v1/workflow-instances/${id}/actions/cancel`,
      admin.session,
    );
    expect(errorCode(silent)).toBe('WF_COMMENT_REQUIRED');
    const done = await scenario.post(`/v1/workflow-instances/${id}/actions/cancel`, admin.session, {
      comment: 'Solicitud duplicada',
    });
    expect(done.status, done.text).toBe(204);
    expect((await scenario.instance(requester, id)).state.key).toBe('cancelled');
  });

  it('ofrece al responsable las acciones posibles, con la condición pendiente deshabilitada', async () => {
    const { flow, requester } = await cast();
    const id = await scenario.startAs(requester, flow.key);
    const task = await scenario.task(requester, (await scenario.onlyOpenTask(id)).id);
    expect(task.can_act).toBe(true);
    expect(task.actions.map((a) => [a.action, a.condition_met])).toEqual([
      ['submit', true],
      ['submit_board', false],
    ]);
  });
});
