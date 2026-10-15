import { definitionListResponseSchema, taskListResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { sampleFlow, WfScenario } from './support/wf-scenario.js';

// Permiso denegado, aislamiento entre empresas y auditoría del motor de flujos (B15, capítulo 21
// y numeral 15.5).

const scenario = new WfScenario('flujos acceso');

async function running() {
  const admin = await scenario.admin();
  const flow = await scenario.publish(admin);
  const requester = await scenario.people('solicitante', ['COLABORADOR']);
  const id = await scenario.startAs(requester, flow.key);
  return { admin, flow, requester, id, task: await scenario.onlyOpenTask(id) };
}

describe('permiso denegado', () => {
  it('sin rol o desde el portal no se ven tareas, trámites ni flujos', async () => {
    const { flow, id, task } = await running();
    const people = [
      await scenario.person('sin-rol', []),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      for (const path of [
        '/v1/tasks/mine',
        `/v1/tasks/${task.id}`,
        `/v1/workflow-instances/${id}`,
      ]) {
        expect(errorCode(await scenario.get(path, person.session)), path).toBe('PERMISSION_DENIED');
      }
      expect(errorCode(await scenario.get(`/v1/workflows/${flow.id}`, person.session))).toBe(
        'PERMISSION_DENIED',
      );
    }
  });
});

describe('permiso denegado por rol', () => {
  it('el colaborador no administra flujos ni ve el tablero; el auditor no atiende tareas', async () => {
    const { task } = await running();
    const collaborator = await scenario.people('colaborador', ['COLABORADOR']);
    for (const [method, path] of [
      ['get', '/v1/workflows'],
      ['post', '/v1/workflows'],
      ['get', '/v1/tasks'],
      ['post', `/v1/tasks/${task.id}/actions/reassign`],
    ] as const) {
      const call =
        method === 'get'
          ? scenario.get(path, collaborator.session)
          : scenario.post(path, collaborator.session, {});
      expect(errorCode(await call), path).toBe('PERMISSION_DENIED');
    }
    const auditor = await scenario.people('auditor', ['AUDITOR']);
    expect(errorCode(await scenario.get('/v1/tasks/mine', auditor.session))).toBe(
      'PERMISSION_DENIED',
    );
    expect((await scenario.get('/v1/tasks', auditor.session)).status).toBe(200);
  });
});

describe('permiso denegado: solo lo propio', () => {
  it('quien no participa no ve el trámite ni la tarea de otro, ni la atiende', async () => {
    const { id, task } = await running();
    const stranger = await scenario.people('ajeno', ['COLABORADOR']);
    expect(errorCode(await scenario.get(`/v1/workflow-instances/${id}`, stranger.session))).toBe(
      'WF_INSTANCE_NOT_FOUND',
    );
    expect(errorCode(await scenario.get(`/v1/tasks/${task.id}`, stranger.session))).toBe(
      'WF_TASK_NOT_FOUND',
    );
    const complete = await scenario.post(
      `/v1/tasks/${task.id}/actions/complete`,
      stranger.session,
      {
        action: 'submit',
      },
    );
    expect(errorCode(complete)).toBe('WF_TASK_NOT_FOUND');
    const act = await scenario.post(
      `/v1/workflow-instances/${id}/actions/submit`,
      stranger.session,
    );
    expect(errorCode(act)).toBe('WF_INSTANCE_NOT_FOUND');
    expect((await scenario.mine(stranger)).map((t) => t.id)).not.toContain(task.id);
  });
});

describe('aislamiento entre empresas', () => {
  it('la empresa B no ve los flujos, trámites ni tareas de la empresa A', async () => {
    const { flow, id, task } = await running();
    const other = await scenario.admin(scenario.otherTenant.id);
    expect(errorCode(await scenario.get(`/v1/workflows/${flow.id}`, other.session))).toBe(
      'WF_DEFINITION_NOT_FOUND',
    );
    expect(errorCode(await scenario.get(`/v1/workflow-instances/${id}`, other.session))).toBe(
      'WF_INSTANCE_NOT_FOUND',
    );
    expect(errorCode(await scenario.get(`/v1/tasks/${task.id}`, other.session))).toBe(
      'WF_TASK_NOT_FOUND',
    );
    const action = await scenario.post(`/v1/tasks/${task.id}/actions/reassign`, other.session, {
      to_user_id: other.id,
    });
    expect(errorCode(action)).toBe('WF_TASK_NOT_FOUND');
    const flows = definitionListResponseSchema.parse(
      (await scenario.get('/v1/workflows', other.session)).body,
    );
    expect(flows.data.map((d) => d.id)).not.toContain(flow.id);
    const board = taskListResponseSchema.parse(
      (await scenario.get('/v1/tasks?limit=100', other.session)).body,
    );
    expect(board.data.map((t) => t.id)).not.toContain(task.id);
  });

  it('la misma clave de flujo puede existir en dos empresas', async () => {
    const flow = sampleFlow();
    await scenario.create('/v1/workflows', await scenario.admin(), flow);
    const other = await scenario.admin(scenario.otherTenant.id);
    expect((await scenario.post('/v1/workflows', other.session, flow)).status).toBe(201);
  });

  it('un identificador inexistente responde igual que uno ajeno', async () => {
    const admin = await scenario.admin();
    expect(errorCode(await scenario.get(`/v1/tasks/${uuidv7()}`, admin.session))).toBe(
      'WF_TASK_NOT_FOUND',
    );
  });
});

describe('auditoría e historial inalterable', () => {
  it('cada paso del trámite y de sus tareas queda en la auditoría', async () => {
    const { requester, id, task } = await running();
    await scenario.act(requester, task.id, 'complete', { action: 'submit' });
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'wf.instance.start:success',
      'wf.instance.transition:success',
    ]);
    expect(await auditActions(scenario.db, scenario.tenant.id, task.id)).toEqual([
      'wf.task.complete:success',
    ]);
  });

  it('nadie modifica ni borra el historial ni las decisiones', async () => {
    const { id } = await running();
    const edit = scenario.inTenant((tx) =>
      tx.workflowHistory.updateMany({ where: { instanceId: id }, data: { comment: 'alterado' } }),
    );
    await expect(edit).rejects.toThrow(/permission denied/);
    const erase = scenario.inTenant((tx) =>
      tx.workflowHistory.deleteMany({ where: { instanceId: id } }),
    );
    await expect(erase).rejects.toThrow(/permission denied/);
    const decisions = scenario.inTenant((tx) => tx.workflowApproval.deleteMany({}));
    await expect(decisions).rejects.toThrow(/permission denied/);
  });
});
