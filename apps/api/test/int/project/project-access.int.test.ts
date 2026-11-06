import { projectListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { ProjectScenario } from './support/project-scenario.js';

// Permiso denegado, «solo sus proyectos», retiro inmediato del acceso, aislamiento entre empresas y
// auditoría de Proyectos (B26, capítulo 21 y numerales 15.3 y 15.5).

const scenario = new ProjectScenario('proyectos acceso');

async function listed(person: Awaited<ReturnType<typeof scenario.leader>>): Promise<string[]> {
  const response = await scenario.get('/v1/projects?limit=200', person.session);
  expect(response.status, response.text).toBe(200);
  return projectListResponseSchema.parse(response.body).data.map((row) => row.id);
}

describe('permiso denegado', () => {
  it('el Contador y el portal no ven proyectos; Comercial lee pero no crea ni edita', async () => {
    const leader = await scenario.leader();
    const id = await scenario.plannedProject(leader);
    for (const person of [
      await scenario.person('contador', ['CONTADOR']),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ]) {
      expect(errorCode(await scenario.get('/v1/projects', person.session))).toBe(
        'PERMISSION_DENIED',
      );
    }
    const sales = await scenario.sales();
    expect((await scenario.get(`/v1/projects/${id}`, sales.session)).status).toBe(200);
    const writes = [
      scenario.post('/v1/projects', sales.session, scenario.projectBody(sales)),
      scenario.projectStep(sales, id, 'start'),
      scenario.post(`/v1/projects/${id}/members`, sales.session, {}),
      scenario.post(`/v1/projects/${id}/items`, sales.session, scenario.itemBody()),
    ];
    for (const response of await Promise.all(writes)) {
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});

describe('permiso denegado', () => {
  it('el Equipo de proyecto no crea proyectos ni arma el equipo', async () => {
    const developer = await scenario.developer();
    const created = await scenario.post(
      '/v1/projects',
      developer.session,
      scenario.projectBody(developer),
    );
    expect(errorCode(created)).toBe('PERMISSION_DENIED');
  });
});

describe('un miembro solo ve sus proyectos', () => {
  it('ve y trabaja en el proyecto donde es miembro; los demás no existen para él', async () => {
    const leader = await scenario.leader();
    const developer = await scenario.developer();
    const mine = await scenario.runningProject(leader);
    const others = await scenario.runningProject(leader);
    await scenario.addMember(leader, mine, developer);
    expect(await listed(developer)).toContain(mine);
    expect(await listed(developer)).not.toContain(others);
    expect((await scenario.project(developer, mine)).can).toEqual({
      update: false,
      manage_members: false,
      manage_items: true,
      log_time: true,
      approve_time: false,
      deliver: false,
      manage_releases: false,
      manage_incidents: false,
      close: false,
      see_money: false,
    });
    const item = await scenario.item(developer, mine);
    expect(
      (await scenario.itemStep(developer, mine, item, 'move', { status: 'in_progress' })).status,
    ).toBe(204);
    for (const path of [`/v1/projects/${others}`, `/v1/projects/${others}/board`]) {
      expect(errorCode(await scenario.get(path, developer.session))).toBe('PROJECT_NOT_FOUND');
    }
    const intrusion = await scenario.post(
      `/v1/projects/${others}/items`,
      developer.session,
      scenario.itemBody(),
    );
    expect(errorCode(intrusion)).toBe('PROJECT_NOT_FOUND');
  });
});

describe('un miembro solo ve sus proyectos', () => {
  it('al retirarlo pierde el acceso de inmediato y sus ítems abiertos quedan sin asignar', async () => {
    const leader = await scenario.leader();
    const developer = await scenario.developer();
    const id = await scenario.runningProject(leader);
    const memberId = await scenario.addMember(leader, id, developer);
    const item = await scenario.item(leader, id, { assignee_id: developer.id });
    expect((await scenario.board(developer, id)).items).toHaveLength(1);
    const member = (await scenario.project(leader, id)).members.find((row) => row.id === memberId);
    const removed = await scenario.delete(
      `/v1/projects/${id}/members/${memberId}`,
      leader.session,
      member?.version,
    );
    expect(removed.status, removed.text).toBe(204);
    expect(errorCode(await scenario.get(`/v1/projects/${id}/board`, developer.session))).toBe(
      'PROJECT_NOT_FOUND',
    );
    expect(await listed(developer)).not.toContain(id);
    expect((await scenario.itemOf(leader, id, item)).assignee).toBeNull();
  });
});

describe('un miembro solo ve sus proyectos', () => {
  it('el líder del proyecto no se retira y un ítem solo se asigna a alguien del equipo', async () => {
    const leader = await scenario.leader();
    const outsider = await scenario.developer();
    const id = await scenario.plannedProject(leader);
    const [own] = (await scenario.project(leader, id)).members;
    const response = await scenario.delete(
      `/v1/projects/${id}/members/${own?.id ?? ''}`,
      leader.session,
      own?.version,
    );
    expect(errorCode(response)).toBe('PROJECT_MEMBER_INVALID');
    const assigned = await scenario.post(
      `/v1/projects/${id}/items`,
      leader.session,
      scenario.itemBody({ assignee_id: outsider.id }),
    );
    expect(errorCode(assigned)).toBe('PROJECT_MEMBER_INVALID');
  });
});

describe('aislamiento entre empresas', () => {
  it('otra empresa no ve, no edita ni toca el tablero de los proyectos de esta', async () => {
    const leader = await scenario.leader();
    const id = await scenario.runningProject(leader);
    const item = await scenario.item(leader, id);
    const outsider = await scenario.leader(scenario.otherTenant.id);
    expect(errorCode(await scenario.get(`/v1/projects/${id}`, outsider.session))).toBe(
      'PROJECT_NOT_FOUND',
    );
    expect(await listed(outsider)).not.toContain(id);
    const calls = [
      scenario.action(`/v1/projects/${id}/actions/pause`, outsider, 2, { reason: 'Intruso' }),
      scenario.action(`/v1/projects/${id}/items/${item}/actions/move`, outsider, 1, {
        status: 'in_progress',
      }),
      scenario.post(`/v1/projects/${id}/milestones`, outsider.session, {
        name: 'Intruso',
        due_on: scenario.day(5),
        billing_pct: 10,
      }),
    ];
    for (const response of await Promise.all(calls)) {
      expect(errorCode(response)).toBe('PROJECT_NOT_FOUND');
    }
  });
});

describe('aislamiento entre empresas', () => {
  it('un proyecto no nace del contrato ni del cliente de otra empresa', async () => {
    const foreignContract = await scenario.activeContract(await scenario.sales());
    const foreignParty = await scenario.client(await scenario.sales());
    const outsider = await scenario.leader(scenario.otherTenant.id);
    const cases: [object, string][] = [
      [{ contract_id: foreignContract }, 'PROJECT_CONTRACT_INVALID'],
      [{ party_id: foreignParty }, 'PROJECT_PARTY_INVALID'],
    ];
    for (const [overrides, code] of cases) {
      const response = await scenario.post(
        '/v1/projects',
        outsider.session,
        scenario.projectBody(outsider, overrides),
      );
      expect(errorCode(response)).toBe(code);
    }
  });
});

describe('auditoría', () => {
  it('cada paso deja su evento de auditoría y su evento de dominio en la misma transacción', async () => {
    const leader = await scenario.leader();
    const developer = await scenario.developer();
    const id = await scenario.runningProject(leader);
    expect(await scenario.auditActions(id)).toEqual(['project.create', 'project.start']);
    expect(await scenario.outboxEvents(id)).toEqual(['project.created', 'project.started']);
    const memberId = await scenario.addMember(leader, id, developer);
    expect(await scenario.auditActions(memberId)).toEqual(['project.member.add']);
    const item = await scenario.item(developer, id);
    await scenario.itemStep(developer, id, item, 'move', { status: 'in_progress' });
    expect(await scenario.auditActions(item)).toEqual(['project.item.create', 'project.item.move']);
    const audit = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.auditEvent.findFirstOrThrow({ where: { entityId: item, action: 'project.item.move' } }),
    );
    expect(audit).toMatchObject({
      actorId: developer.id,
      changes: { status: ['pending', 'in_progress'] },
    });
  });
});

describe('auditoría', () => {
  it('el líder y quien entra al equipo reciben su aviso; nadie se avisa a sí mismo', async () => {
    const leader = await scenario.leader();
    const developer = await scenario.developer();
    const creator = await scenario.leader();
    const id = await scenario.create(
      '/v1/projects',
      creator,
      scenario.projectBody(leader, { party_id: await scenario.client(await scenario.sales()) }),
    );
    await scenario.addMember(creator, id, developer);
    await scenario.dispatchNotices();
    const notices = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.notification.findMany({
        where: { kind: 'prj_project_update', link: `/app/proyectos/${id}` },
        select: { userId: true },
      }),
    );
    expect(notices.map((row) => row.userId).sort()).toEqual([developer.id, leader.id].sort());
  });
});
