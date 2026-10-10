import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import { seedCore } from '../../../../src/modules/core/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';

// Llamadas del recorrido de escrituras (B11) para las rutas del núcleo (B12). Lo que cada llamada
// necesita se prepara directamente en la base; solo la llamada final pasa por la API.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const SITE = { name: 'Sede del recorrido', city: 'Pasto', address: 'Calle 18 # 25-40' };

function short(): string {
  return uuidv7().replaceAll('-', '').slice(-8).toUpperCase();
}

async function adminSession(s: AccessScenario): Promise<SignedIn> {
  return (await s.person('admin-nucleo', ['ADMIN_PLATAFORMA'])).session;
}

function del(s: AccessScenario, path: string, session: SignedIn, version?: number): request.Test {
  const call = request(s.app.getHttpServer())
    .delete(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', session.cookie)
    .set('X-CSRF-Token', session.session.csrf_token);
  return version === undefined ? call : call.set('If-Match', `"${String(version)}"`);
}

function newSite(s: AccessScenario, isMain = false) {
  return s.inTenant((tx) => tx.site.create({ data: { tenantId: s.tenant.id, ...SITE, isMain } }));
}

function newUnit(s: AccessScenario) {
  const code = `R${short()}`;
  return s.inTenant((tx) =>
    tx.orgUnit.create({ data: { tenantId: s.tenant.id, code, name: 'Recorrido', kind: 'area' } }),
  );
}

async function newPosition(s: AccessScenario) {
  const unit = await newUnit(s);
  return s.inTenant((tx) =>
    tx.position.create({ data: { tenantId: s.tenant.id, orgUnitId: unit.id, name: 'Recorrido' } }),
  );
}

function newCostCenter(s: AccessScenario) {
  const code = `CC${short()}`;
  return s.inTenant((tx) =>
    tx.costCenter.create({ data: { tenantId: s.tenant.id, code, name: 'Recorrido' } }),
  );
}

async function seeded(s: AccessScenario): Promise<void> {
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
}

async function tenantVersion(s: AccessScenario): Promise<number> {
  const tenant = await s.inTenant((tx) =>
    tx.tenant.findUniqueOrThrow({ where: { id: s.tenant.id } }),
  );
  return tenant.version;
}

const ORGANIZATION_CALLS: Record<string, RouteCall> = {
  'PATCH /v1/tenant': async (s) => {
    const body = {
      legal_name: s.tenant.legalName,
      trade_name: 'Recorrido',
      tax_id: `9${short().replaceAll(/\D/g, '0')}-1`,
    };
    return { test: s.patch('/v1/tenant', await adminSession(s), body, await tenantVersion(s)) };
  },
  'POST /v1/sites': async (s) => ({ test: s.post('/v1/sites', await adminSession(s), SITE) }),
  'PATCH /v1/sites/{id}': async (s) => {
    const site = await newSite(s);
    const body = { ...SITE, name: 'Sede editada', is_main: false, is_active: true };
    return { test: s.patch(`/v1/sites/${site.id}`, await adminSession(s), body, 1) };
  },
  'DELETE /v1/sites/{id}': async (s) => {
    const site = await newSite(s);
    return { test: del(s, `/v1/sites/${site.id}`, await adminSession(s), 1) };
  },
  'POST /v1/org-units': async (s) => {
    const body = { code: `N${short()}`, name: 'Nueva área', kind: 'area' };
    return { test: s.post('/v1/org-units', await adminSession(s), body) };
  },
  'PATCH /v1/org-units/{id}': async (s) => {
    const unit = await newUnit(s);
    const body = {
      code: unit.code,
      name: 'Editada',
      kind: 'area',
      parent_id: null,
      owner_position_id: null,
      is_active: true,
    };
    return { test: s.patch(`/v1/org-units/${unit.id}`, await adminSession(s), body, 1) };
  },
  'DELETE /v1/org-units/{id}': async (s) => {
    const unit = await newUnit(s);
    return { test: del(s, `/v1/org-units/${unit.id}`, await adminSession(s), 1) };
  },
  'POST /v1/positions': async (s) => {
    const unit = await newUnit(s);
    return {
      test: s.post('/v1/positions', await adminSession(s), { org_unit_id: unit.id, name: 'Nuevo' }),
    };
  },
  'PATCH /v1/positions/{id}': async (s) => {
    const position = await newPosition(s);
    const body = {
      org_unit_id: position.orgUnitId,
      name: 'Editado',
      reports_to_id: null,
      is_active: true,
    };
    return { test: s.patch(`/v1/positions/${position.id}`, await adminSession(s), body, 1) };
  },
  'DELETE /v1/positions/{id}': async (s) => {
    const position = await newPosition(s);
    return { test: del(s, `/v1/positions/${position.id}`, await adminSession(s), 1) };
  },
};

const LIST_CALLS: Record<string, RouteCall> = {
  'POST /v1/cost-centers': async (s) => {
    const body = { code: `C${short()}`, name: 'Nuevo centro' };
    return { test: s.post('/v1/cost-centers', await adminSession(s), body) };
  },
  'PATCH /v1/cost-centers/{id}': async (s) => {
    const center = await newCostCenter(s);
    const body = { code: center.code, name: 'Editado', org_unit_id: null, is_active: true };
    return { test: s.patch(`/v1/cost-centers/${center.id}`, await adminSession(s), body, 1) };
  },
  'DELETE /v1/cost-centers/{id}': async (s) => {
    const center = await newCostCenter(s);
    return { test: del(s, `/v1/cost-centers/${center.id}`, await adminSession(s), 1) };
  },
  'POST /v1/catalogs/{key}/items': async (s) => {
    await seeded(s);
    const body = { code: `I${short()}`, label: 'Nueva opción' };
    return { test: s.post('/v1/catalogs/identification_types/items', await adminSession(s), body) };
  },
  'PATCH /v1/catalogs/{key}/items/{id}': async (s) => {
    await seeded(s);
    const item = await s.inTenant((tx) =>
      tx.catalogItem.findFirstOrThrow({ where: { code: 'PA' } }),
    );
    const body = { label: 'Pasaporte', sort_order: 40, is_active: true };
    const path = `/v1/catalogs/identification_types/items/${item.id}`;
    return { test: s.patch(path, await adminSession(s), body, item.version) };
  },
};

const SETTINGS_CALLS: Record<string, RouteCall> = {
  'POST /v1/parameters/{key}/versions': async (s) => {
    await seeded(s);
    const value = {
      days: [1, 2, 3, 4, 5],
      morning: { start: '08:00', end: '12:00' },
      afternoon: { start: '14:00', end: '18:00' },
    };
    const body = { value, valid_from: '2099-01-01' };
    return { test: s.post('/v1/parameters/work.schedule/versions', await adminSession(s), body) };
  },
  'POST /v1/sequences': async (s) => {
    const body = { key: `walk.s${short().toLowerCase()}`, name: 'Recorrido', prefix: 'REC' };
    return { test: s.post('/v1/sequences', await adminSession(s), body) };
  },
  'PATCH /v1/sequences/{id}': async (s) => {
    const sequence = await s.inTenant((tx) =>
      tx.sequence.create({
        data: {
          tenantId: s.tenant.id,
          key: `walk.e${short().toLowerCase()}`,
          name: 'Recorrido',
          prefix: 'REC',
          year: 2026,
        },
      }),
    );
    const body = { name: 'Editado', prefix: 'EDI', padding: 5 };
    return { test: s.patch(`/v1/sequences/${sequence.id}`, await adminSession(s), body, 1) };
  },
  'POST /v1/holidays': async (s) => {
    const body = { date: '2031-03-03', name: 'Día especial' };
    return { test: s.post('/v1/holidays', await adminSession(s), body) };
  },
  'DELETE /v1/holidays/{id}': async (s) => {
    const holiday = await s.inTenant((tx) =>
      tx.holiday.create({
        data: {
          tenantId: s.tenant.id,
          holidayDate: new Date('2032-07-07T00:00:00Z'),
          name: 'Retirable',
        },
      }),
    );
    return { test: del(s, `/v1/holidays/${holiday.id}`, await adminSession(s)) };
  },
};

export const CORE_CALLS: Readonly<Record<string, RouteCall>> = {
  ...ORGANIZATION_CALLS,
  ...LIST_CALLS,
  ...SETTINGS_CALLS,
};
