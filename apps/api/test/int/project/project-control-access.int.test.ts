import { describe, expect, it } from 'vitest';

import { DeliveryScenario } from './support/delivery-scenario.js';

// Permiso denegado y aislamiento entre empresas del B27: el Contador no ve proyectos; Comercial los
// lee pero no registra horas, no aprueba, no entrega, no gestiona riesgos, liberaciones ni
// incidentes, y no cierra; el Equipo de proyecto prepara entregables pero no envía el acta
// (decisión 2). Un Líder técnico de otra empresa no ve ni toca nada de este proyecto.

const scenario = new DeliveryScenario('control de proyectos: acceso');

describe('permiso denegado', () => {
  it('cada rol hace solo lo que la matriz le permite', async () => {
    const leader = await scenario.leader();
    const developer = await scenario.developer();
    const sales = await scenario.sales();
    const accountant = await scenario.person('contador', ['CONTADOR']);
    const id = await scenario.runningProject(leader);
    await scenario.addMember(leader, id, developer);
    const base = `/v1/projects/${id}`;

    expect((await scenario.get(`${base}/deliverables`, accountant.session)).status).toBe(403);
    expect((await scenario.get(`${base}/indicators`, sales.session)).status).toBe(200);
    expect((await scenario.logTime(sales, id)).status).toBe(403);
    const writes = [
      `${base}/time-entries/actions/approve`,
      `${base}/risks`,
      `${base}/releases`,
      `${base}/incidents`,
      `${base}/actions/close`,
      `${base}/deliverables`,
    ];
    for (const path of writes) {
      expect((await scenario.post(path, sales.session, {})).status, path).toBe(403);
    }
    const deliverable = await scenario.create(
      `${base}/deliverables`,
      developer,
      scenario.deliverableBody(),
    );
    const deliver = await scenario.deliver(developer, {
      projectId: id,
      id: deliverable,
      signerId: developer.id,
    });
    expect(deliver.status).toBe(403);
    expect((await scenario.post(`${base}/risks`, developer.session, {})).status).toBe(403);
  });
});

describe('aislamiento entre empresas', () => {
  it('un Líder técnico de otra empresa no ve ni toca el control de este proyecto', async () => {
    const leader = await scenario.leader();
    const stranger = await scenario.leader(scenario.otherTenant.id);
    const id = await scenario.runningProject(leader);
    const base = `/v1/projects/${id}`;
    const deliverable = await scenario.create(
      `${base}/deliverables`,
      leader,
      scenario.deliverableBody(),
    );
    for (const path of ['deliverables', 'time-entries', 'risks', 'indicators', 'incidents']) {
      expect((await scenario.get(`${base}/${path}`, stranger.session)).status, path).toBe(404);
    }
    const risk = {
      description: 'Riesgo ajeno.',
      probability: 1,
      impact: 1,
      response: null,
      owner_id: stranger.id,
    };
    expect((await scenario.post(`${base}/risks`, stranger.session, risk)).status).toBe(404);
    const link = await scenario.post(
      `${base}/deliverables/${deliverable}/acta-link`,
      stranger.session,
      {},
    );
    expect(link.status).toBe(404);
    const approve = await scenario.post(`${base}/time-entries/actions/approve`, stranger.session, {
      ids: [deliverable],
    });
    expect(approve.status).toBe(404);
  });
});
