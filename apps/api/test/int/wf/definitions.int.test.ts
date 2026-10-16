import { definitionSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { sampleFlow, WfScenario } from './support/wf-scenario.js';

// Definiciones versionadas (ficha 17.5): cambiar un flujo crea una versión nueva y los trámites en
// curso terminan con la versión con la que iniciaron.

const scenario = new WfScenario('definiciones de flujo');

async function definition(id: string) {
  const admin = await scenario.admin();
  return definitionSchema.parse((await scenario.get(`/v1/workflows/${id}`, admin.session)).body);
}

describe('borradores y publicación', () => {
  it('guarda un borrador con problemas, pero no lo publica', async () => {
    const admin = await scenario.admin();
    const flow = sampleFlow();
    const broken = { ...flow, transitions: flow.transitions.filter((t) => t.action !== 'cancel') };
    broken.states = broken.states.filter((state) => state.key !== 'cancelled');
    const noExit = {
      ...broken,
      transitions: broken.transitions.filter((t) => t.from_state !== 'draft'),
    };
    const id = await scenario.create('/v1/workflows', admin, noExit);
    const draft = await definition(id);
    expect(draft).toMatchObject({ status: 'draft', version: 1 });
    expect(draft.problems).toContain('No se llega al estado «Revisión».');
    const publish = await scenario
      .post(`/v1/workflows/${id}/actions/publish`, admin.session)
      .set('If-Match', String(draft.row_version));
    expect(errorCode(publish)).toBe('WF_DEFINITION_INVALID');
  });
});

describe('edición de borradores', () => {
  it('edita el borrador con If-Match y conserva el orden de estados y transiciones', async () => {
    const admin = await scenario.admin();
    const flow = sampleFlow();
    const id = await scenario.create('/v1/workflows', admin, flow);
    const before = await definition(id);
    const edited = {
      name: 'Nombre nuevo',
      description: 'Con descripción',
      states: flow.states,
      transitions: flow.transitions.filter((t) => t.action !== 'cancel'),
    };
    const stale = await scenario.patch(
      `/v1/workflows/${id}`,
      admin.session,
      edited,
      before.row_version + 5,
    );
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const saved = await scenario.patch(
      `/v1/workflows/${id}`,
      admin.session,
      edited,
      before.row_version,
    );
    expect(saved.status, saved.text).toBe(204);
    const after = await definition(id);
    expect(after.name).toBe('Nombre nuevo');
    expect(after.transitions.map((t) => t.action)).toEqual(edited.transitions.map((t) => t.action));
    expect(after.states.map((s) => s.key)).toEqual(flow.states.map((s) => s.key));
  });
});

describe('validación de las definiciones', () => {
  it('rechaza un rol que no existe y una clave repetida', async () => {
    const admin = await scenario.admin();
    const flow = sampleFlow();
    const [draft, ...rest] = flow.states;
    if (draft === undefined) throw new Error('Flujo de ejemplo sin estados');
    const ghost = {
      ...flow,
      states: [{ ...draft, assignee: { type: 'role', role: 'FANTASMA' } }, ...rest],
    };
    const response = await scenario.post('/v1/workflows', admin.session, ghost);
    expect(errorCode(response)).toBe('WF_DEFINITION_INVALID');
    await scenario.create('/v1/workflows', admin, flow);
    expect(errorCode(await scenario.post('/v1/workflows', admin.session, flow))).toBe(
      'WF_DEFINITION_KEY_TAKEN',
    );
  });
});

describe('versiones (ficha 17.5)', () => {
  it('una versión publicada no se edita; se crea una nueva', async () => {
    const admin = await scenario.admin();
    const { id } = await scenario.publish(admin);
    const published = await definition(id);
    const edit = {
      name: 'Cambio',
      description: null,
      states: published.states,
      transitions: published.transitions,
    };
    const response = await scenario.patch(
      `/v1/workflows/${id}`,
      admin.session,
      edit,
      published.row_version,
    );
    expect(errorCode(response)).toBe('WF_DEFINITION_NOT_DRAFT');
    const next = await scenario.create(`/v1/workflows/${id}/actions/new-version`, admin, {});
    expect(await definition(next)).toMatchObject({
      status: 'draft',
      version: 2,
      key: published.key,
    });
    const again = await scenario.post(`/v1/workflows/${id}/actions/new-version`, admin.session);
    expect(errorCode(again)).toBe('WF_DRAFT_EXISTS');
  });
});

describe('versiones publicadas en la base de datos', () => {
  it('la base de datos tampoco deja cambiar una versión publicada', async () => {
    const admin = await scenario.admin();
    const { id } = await scenario.publish(admin);
    const change = scenario.inTenant((tx) =>
      tx.workflowDefinition.update({ where: { id }, data: { name: 'Alterado' } }),
    );
    await expect(change).rejects.toThrow(/publicada de un flujo no se puede cambiar/);
    const state = scenario.inTenant((tx) =>
      tx.workflowState.updateMany({ where: { definitionId: id }, data: { label: 'Otro' } }),
    );
    await expect(state).rejects.toThrow(/Solo un borrador de flujo se puede editar/);
  });
});

describe('versiones y trámites en curso', () => {
  it('los trámites en curso terminan con la versión con la que iniciaron', async () => {
    const admin = await scenario.admin();
    const flow = await scenario.publish(admin);
    const requester = await scenario.people('solicitante', ['COLABORADOR']);
    const before = await scenario.startAs(requester, flow.key);
    const nextId = await scenario.create(`/v1/workflows/${flow.id}/actions/new-version`, admin, {});
    const draft = await definition(nextId);
    const renamed = draft.transitions.map((t) =>
      t.action === 'submit' ? { ...t, label: 'Enviar v2' } : t,
    );
    const edit = {
      name: draft.name,
      description: null,
      states: draft.states,
      transitions: renamed,
    };
    await scenario.patch(`/v1/workflows/${nextId}`, admin.session, edit, draft.row_version);
    const ready = await definition(nextId);
    await scenario
      .post(`/v1/workflows/${nextId}/actions/publish`, admin.session)
      .set('If-Match', String(ready.row_version));
    expect((await definition(flow.id)).status).toBe('retired');

    const after = await scenario.startAs(requester, flow.key);
    expect((await scenario.instance(requester, before)).workflow.version).toBe(1);
    expect((await scenario.instance(requester, after)).workflow.version).toBe(2);
    const old = await scenario.task(requester, (await scenario.onlyOpenTask(before)).id);
    expect(old.actions.find((a) => a.action === 'submit')?.label).toBe('Enviar');
    await scenario.act(requester, old.id, 'complete', { action: 'submit' });
    expect((await scenario.instance(requester, before)).state.key).toBe('review');
  });
});

describe('trámites de prueba', () => {
  it('un trámite de prueba usa la versión publicada; un borrador no inicia trámites', async () => {
    const admin = await scenario.admin();
    const { id } = await scenario.publish(admin);
    const started = await scenario.create(`/v1/workflows/${id}/actions/start-test`, admin, {
      title: 'Prueba del flujo',
      facts: { amount: 10 },
    });
    expect((await scenario.instance(admin, started)).title).toBe('Prueba del flujo');
    const draft = await scenario.create('/v1/workflows', admin, sampleFlow());
    const response = await scenario.post(
      `/v1/workflows/${draft}/actions/start-test`,
      admin.session,
      {
        title: 'No debe iniciar',
      },
    );
    expect(errorCode(response)).toBe('WF_NO_PUBLISHED_VERSION');
  });
});
