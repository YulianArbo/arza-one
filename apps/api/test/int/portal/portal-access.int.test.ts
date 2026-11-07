import { describe, expect, it } from 'vitest';

import { PortalScenario } from './support/portal-scenario.js';

// Permiso denegado del portal del cliente (B30, ficha 17.10). Una persona interna no entra al
// portal ni uno del portal a la aplicación interna; una cuenta sin empresa cliente no ve nada; nadie
// usa el portal sin aceptar los términos vigentes; el usuario del cliente no administra usuarios ni
// ve contratos, y solo ve los proyectos que se le asignan. Datos ficticios.

const scenario = new PortalScenario('portal: acceso');

describe('permiso denegado: interno y portal', () => {
  it('una persona interna no entra al portal ni el cliente a la aplicación interna', async () => {
    const world = await scenario.clientWorld();
    for (const path of ['/v1/portal/home', '/v1/portal/projects', '/v1/portal/users']) {
      expect((await scenario.get(path, world.leader.session)).status, path).toBe(403);
    }
    for (const path of ['/v1/projects', '/v1/tickets', '/v1/contracts', '/v1/parties']) {
      expect((await scenario.get(path, world.admin.session)).status, path).toBe(403);
    }
  });
});

describe('permiso denegado: cuenta sin empresa', () => {
  it('una cuenta del portal sin empresa cliente no ve nada', async () => {
    const world = await scenario.clientWorld();
    const loose = await scenario.portalPerson('CLIENTE_ADMIN', world.client.partyId);
    await scenario.inTenant((tx) =>
      tx.user.update({ where: { id: loose.id }, data: { partyId: null } }),
    );
    const response = await scenario.get('/v1/portal/home', loose.session);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'PORTAL_NO_COMPANY' } });
  });
});

describe('términos del primer ingreso', () => {
  it('sin aceptar los términos vigentes no se usa el portal; aceptarlos queda registrado', async () => {
    const world = await scenario.clientWorld();
    const fresh = await scenario.portalPerson('CLIENTE_USUARIO', world.client.partyId);
    const blocked = await scenario.get('/v1/portal/projects', fresh.session);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ error: { code: 'PORTAL_TERMS_PENDING' } });
    expect((await scenario.terms(fresh)).status).toBe('pending');
    const outdated = await scenario.portalPost(fresh, '/v1/portal/terms/acceptance', {
      notice_ids: [crypto.randomUUID()],
    });
    expect(outdated.status).toBe(409);
    await scenario.accept(fresh);
    expect((await scenario.terms(fresh)).status).toBe('accepted');
    expect((await scenario.get('/v1/portal/projects', fresh.session)).status).toBe(200);
    expect(await scenario.auditedActions(fresh)).toContain('iam.portal_terms.accept');
  });
});

describe('términos sin publicar', () => {
  it('sin términos publicados el portal no está disponible', async () => {
    const sales = await scenario.sales(scenario.otherTenant.id);
    const partyId = await scenario.client(sales);
    const person = await scenario.portalPerson('CLIENTE_ADMIN', partyId, {
      tenantId: scenario.otherTenant.id,
    });
    expect((await scenario.terms(person)).status).toBe('unavailable');
    const response = await scenario.get('/v1/portal/home', person.session);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'PORTAL_TERMS_UNAVAILABLE' } });
  });
});

describe('permiso denegado: usuario del cliente', () => {
  it('el usuario no administra usuarios ni ve contratos, y ve solo lo asignado', async () => {
    const world = await scenario.clientWorld();
    for (const path of ['/v1/portal/users', '/v1/portal/contracts', '/v1/portal/signatures']) {
      expect((await scenario.get(path, world.user.session)).status, path).toBe(403);
    }
    const invite = {
      email: 'otra@cliente.test',
      display_name: 'Otra persona',
      role: 'CLIENTE_ADMIN',
    };
    expect((await scenario.portalPost(world.user, '/v1/portal/users', invite)).status).toBe(403);
    const before = await scenario.read<{ data: unknown[] }>(world.user, '/v1/portal/projects');
    expect(before.data).toHaveLength(0);
    const path = `/v1/portal/projects/${world.projectId}`;
    expect((await scenario.get(path, world.user.session)).status).toBe(404);
    const assign = await scenario.putBody(
      `/v1/portal/users/${world.user.id}/projects`,
      world.admin,
      {
        project_ids: [world.projectId],
      },
    );
    expect(assign.status, assign.text).toBe(204);
    expect((await scenario.get(path, world.user.session)).status).toBe(200);
  });
});

describe('proyecto oculto', () => {
  it('lo que el líder oculta o lo que no ha iniciado no se ve en el portal', async () => {
    const world = await scenario.clientWorld();
    const path = `/v1/portal/projects/${world.projectId}`;
    expect((await scenario.get(path, world.admin.session)).status).toBe(200);
    const { version } = await scenario.project(world.leader, world.projectId);
    const hide = await scenario.put(
      `/v1/projects/${world.projectId}/portal`,
      world.leader,
      { visible: false },
      version,
    );
    expect(hide.status, hide.text).toBe(204);
    expect((await scenario.get(path, world.admin.session)).status).toBe(404);
    const planned = await scenario.plannedProject(world.leader, { party_id: world.client.partyId });
    const listed = await scenario.read<{ data: { id: string }[] }>(
      world.admin,
      '/v1/portal/projects',
    );
    expect(listed.data.map((row) => row.id)).not.toContain(planned);
    expect(await scenario.auditActionsOf(world.projectId)).toContain('project.portal.visibility');
  });
});
