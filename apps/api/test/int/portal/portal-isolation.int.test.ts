import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../iam/support/iam-fixtures.js';
import { routeDeclarations } from '../../support/route-inventory.js';
import { PortalScenario, type ClientWorld } from './support/portal-scenario.js';

// Aislamiento del portal (B30, criterio de la ficha 17.10: «un usuario de un cliente no puede obtener
// datos de otro cliente por ninguna dirección de la API»). El cliente A tiene de todo: proyecto,
// contrato firmado, acta en firma, archivo compartido, tiquete y PQRSF. El administrador del cliente
// B, de la misma empresa ARZA, y uno de otra empresa recorren todas las direcciones del portal con
// los identificadores de A: nada existe para ellos y sus listas no traen nada de A. Si alguien agrega
// una dirección al portal, la prueba exige cubrirla aquí. Datos ficticios.

const scenario = new PortalScenario('portal: aislamiento');

type Method = 'get' | 'post' | 'put';

interface Probe {
  readonly method: Method;
  /** La dirección como la declara el controlador, para comprobar que todas están cubiertas. */
  readonly route: string;
  readonly path: (ids: Ids) => string;
  readonly body?: (ids: Ids) => object;
}

interface Ids {
  readonly world: ClientWorld;
  readonly contractId: string;
  readonly envelopeId: string;
  readonly ticketId: string;
  readonly sharedId: string;
}

/** Direcciones que reciben un identificador: con los de A, para B «no existen». */
const BY_ID: readonly Probe[] = [
  {
    method: 'get',
    route: '/v1/portal/projects/:id',
    path: (ids) => `/v1/portal/projects/${ids.world.projectId}`,
  },
  {
    method: 'post',
    route: '/v1/portal/signatures/:id/link',
    path: (ids) => `/v1/portal/signatures/${ids.envelopeId}/link`,
  },
  {
    method: 'post',
    route: '/v1/portal/contracts/:id/link',
    path: (ids) => `/v1/portal/contracts/${ids.contractId}/link`,
  },
  {
    method: 'post',
    route: '/v1/portal/documents/:kind/:id/link',
    path: (ids) => `/v1/portal/documents/contract/${ids.contractId}/link`,
  },
  {
    method: 'post',
    route: '/v1/portal/documents/:kind/:id/link',
    path: (ids) => `/v1/portal/documents/shared/${ids.sharedId}/link`,
  },
  {
    method: 'get',
    route: '/v1/portal/tickets/:id',
    path: (ids) => `/v1/portal/tickets/${ids.ticketId}`,
  },
  {
    method: 'post',
    route: '/v1/portal/tickets/:id/messages',
    path: (ids) => `/v1/portal/tickets/${ids.ticketId}/messages`,
    body: () => ({ body: 'Mensaje ajeno.' }),
  },
  {
    method: 'post',
    route: '/v1/portal/tickets',
    path: () => '/v1/portal/tickets',
    body: (ids) => ({
      subject: 'Falla ajena',
      description: 'Intento de usar el proyecto de otro cliente.',
      category: 'incident',
      priority: 'low',
      project_id: ids.world.projectId,
    }),
  },
  {
    method: 'put',
    route: '/v1/portal/users/:id',
    path: (ids) => `/v1/portal/users/${ids.world.user.id}`,
    body: () => ({ role: 'CLIENTE_ADMIN', active: false }),
  },
  {
    method: 'put',
    route: '/v1/portal/users/:id/projects',
    path: (ids) => `/v1/portal/users/${ids.world.user.id}/projects`,
    body: (ids) => ({ project_ids: [ids.world.projectId] }),
  },
];

/** Listas y acciones sobre lo propio: no traen nada de A. */
const LISTS = [
  '/v1/portal/home',
  '/v1/portal/projects',
  '/v1/portal/signatures',
  '/v1/portal/contracts',
  '/v1/portal/documents',
  '/v1/portal/tickets',
  '/v1/portal/pqrsf',
  '/v1/portal/users',
  '/v1/portal/me',
] as const;

/** Lo que no lleva identificador de otro cliente (términos, artículos y la cuenta propia). */
const OWN_ONLY = [
  '/v1/portal/terms',
  '/v1/portal/terms/acceptance',
  '/v1/portal/me/export',
  '/v1/portal/pqrsf',
  '/v1/portal/users',
  '/v1/portal/articles',
  '/v1/portal/articles/:id',
];

function call(person: Person, probe: Probe, ids: Ids): request.Test {
  const agent = request(scenario.app.getHttpServer());
  const base = agent[probe.method](probe.path(ids))
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token)
    .set('If-Match', '"1"');
  return base.send(probe.body?.(ids) ?? {});
}

let ids: Ids;

beforeAll(async () => {
  const world = await scenario.clientWorld();
  await scenario.deliveredDeliverable(world);
  const contracts = await scenario.read<{ data: { id: string }[] }>(
    world.admin,
    '/v1/portal/contracts',
  );
  const signatures = await scenario.read<{ pending: { id: string }[] }>(
    world.admin,
    '/v1/portal/signatures',
  );
  const fileId = await scenario.signedCopy(world.leader);
  const sharedId = await scenario.create(
    `/v1/projects/${world.projectId}/shared-files`,
    world.leader,
    {
      file_id: fileId,
      title: 'Manual de usuario',
    },
  );
  const ticketId = await scenario.create('/v1/portal/tickets', world.user, {
    subject: 'No abre el reporte',
    description: 'El reporte mensual queda en blanco.',
    category: 'support',
    priority: 'medium',
    project_id: null,
  });
  ids = {
    world,
    contractId: contracts.data[0]?.id ?? '',
    envelopeId: signatures.pending[0]?.id ?? '',
    ticketId,
    sharedId,
  };
}, 600_000);

describe('el cliente A ve lo suyo', () => {
  it('su administrador obtiene cada registro', async () => {
    expect(ids.contractId).not.toBe('');
    expect(ids.envelopeId).not.toBe('');
    for (const probe of BY_ID.filter((row) => row.method === 'get')) {
      expect((await call(ids.world.admin, probe, ids)).status, probe.route).toBe(200);
    }
  });
});

describe('aislamiento entre clientes', () => {
  it('el administrador del cliente B no obtiene nada de A por ninguna dirección', async () => {
    const other = await scenario.clientWorld();
    for (const probe of BY_ID) {
      const response = await call(other.admin, probe, ids);
      expect(response.status, `${probe.method} ${probe.path(ids)}: ${response.text}`).toBe(404);
    }
    for (const path of LISTS) {
      const text = JSON.stringify(await scenario.read(other.admin, path));
      for (const id of [
        ids.world.projectId,
        ids.contractId,
        ids.envelopeId,
        ids.ticketId,
        ids.sharedId,
      ]) {
        expect(text, `${path} trae ${id}`).not.toContain(id);
      }
      expect(text).not.toContain(ids.world.user.email);
    }
  });
});

describe('aislamiento entre empresas', () => {
  it('un administrador de cliente de otra empresa no obtiene nada de A', async () => {
    const tenantId = scenario.otherTenant.id;
    const sales = await scenario.sales(tenantId);
    const partyId = await scenario.client(sales);
    const stranger = await scenario.readyPerson('CLIENTE_ADMIN', partyId, { tenantId });
    for (const probe of BY_ID) {
      const response = await call(stranger, probe, ids);
      expect(response.status, `${probe.method} ${probe.path(ids)}`).toBe(404);
    }
  });
});

describe('todas las direcciones del portal están cubiertas', () => {
  it('cada dirección del portal está en esta prueba', () => {
    const covered = new Set([...BY_ID.map((probe) => probe.route), ...LISTS, ...OWN_ONLY]);
    const portal = routeDeclarations(scenario.app)
      .map((route) => route.path)
      .filter((path) => path.startsWith('/v1/portal/'));
    expect(portal.length).toBeGreaterThan(20);
    expect(portal.filter((path) => !covered.has(path))).toEqual([]);
  });
});
