import { catalogDetailResponseSchema, siteListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { nextBusinessCode, seedCore } from '../../../src/modules/core/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { apiDatabase } from '../support/integration-database.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { CoreScenario, unique } from './support/core-scenario.js';

// Permiso denegado, aislamiento entre empresas y semilla repetible del núcleo (B12, capítulo 21).

const scenario = new CoreScenario('núcleo acceso');

const SITE = { name: 'Sede de prueba', city: 'Cali', address: 'Avenida 6 # 20-30' };

describe('permiso denegado', () => {
  it('un colaborador consulta la organización pero no la cambia', async () => {
    const colaborador = await scenario.person('colaborador', ['COLABORADOR']);
    expect((await scenario.get('/v1/sites', colaborador.session)).status).toBe(200);
    expect((await scenario.get('/v1/holidays?year=2026', colaborador.session)).status).toBe(200);
    const writes = [
      scenario.post('/v1/sites', colaborador.session, SITE),
      scenario.post('/v1/org-units', colaborador.session, {
        code: 'X1',
        name: 'Nuevo',
        kind: 'area',
      }),
      scenario.post('/v1/holidays', colaborador.session, { date: '2026-09-01', name: 'Festivo' }),
      scenario.post('/v1/catalogs/identification_types/items', colaborador.session, {
        code: 'Z',
        label: 'Otro',
      }),
      scenario.get('/v1/sequences', colaborador.session),
    ];
    for (const response of await Promise.all(writes)) {
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });

  it('un usuario del portal no ve los datos maestros', async () => {
    const portal = await scenario.person('portal', ['CLIENTE_USUARIO'], { kind: 'portal' });
    for (const path of ['/v1/tenant', '/v1/positions', '/v1/parameters']) {
      expect(errorCode(await scenario.get(path, portal.session))).toBe('PERMISSION_DENIED');
    }
  });
});

describe('aislamiento entre empresas', () => {
  it('la empresa B no ve ni toca las sedes y cargos de la empresa A', async () => {
    const adminA = await scenario.admin();
    const adminB = await scenario.admin(scenario.otherTenant.id);
    const site = await scenario.create('/v1/sites', adminA, SITE);
    const position = await scenario.create('/v1/positions', adminA, {
      org_unit_id: await scenario.unitId('TEC'),
      name: 'Arquitecto',
    });
    const sitesB = siteListResponseSchema.parse(
      (await scenario.get('/v1/sites', adminB.session)).body,
    );
    expect(sitesB.data.map((s) => s.id)).not.toContain(site);
    const edit = { ...SITE, is_main: false, is_active: true };
    expect(errorCode(await scenario.patch(`/v1/sites/${site}`, adminB.session, edit, 1))).toBe(
      'CORE_RECORD_NOT_FOUND',
    );
    expect(errorCode(await scenario.delete(`/v1/positions/${position}`, adminB.session, 1))).toBe(
      'CORE_RECORD_NOT_FOUND',
    );
    const crossUnit = { org_unit_id: await scenario.unitId('TEC'), name: 'Intruso' };
    expect(errorCode(await scenario.post('/v1/positions', adminB.session, crossUnit))).toBe(
      'CORE_RECORD_NOT_FOUND',
    );
  });
});

describe('aislamiento entre empresas: catálogos y consecutivos', () => {
  it('las opciones de catálogo y los consecutivos son de cada empresa', async () => {
    const adminA = await scenario.admin();
    const adminB = await scenario.admin(scenario.otherTenant.id);
    const code = unique('Q');
    await scenario.create('/v1/catalogs/identification_types/items', adminA, {
      code,
      label: 'Solo A',
    });
    const catalogB = catalogDetailResponseSchema.parse(
      (await scenario.get('/v1/catalogs/identification_types', adminB.session)).body,
    );
    expect(catalogB.items.map((item) => item.code)).not.toContain(code);
    const key = `iso.${unique('seq')}`;
    await scenario.create('/v1/sequences', adminA, { key, name: 'Solo A', prefix: 'SOA' });
    const inB = scenario.db.withTenant({ tenantId: scenario.otherTenant.id, userId: null }, (tx) =>
      nextBusinessCode(tx, key, new Date()),
    );
    await expect(inB).rejects.toThrow(/no está configurado/);
  });
});

describe('semilla del núcleo', () => {
  it('repetirla no crea nada ni devuelve un festivo que la empresa quitó', async () => {
    const admin = await scenario.admin();
    const holidays = await scenario.inTenant((tx) =>
      tx.holiday.findMany({ where: { name: 'Navidad' } }),
    );
    const christmas = holidays[0];
    if (christmas === undefined) throw new Error('Falta la Navidad sembrada.');
    expect((await scenario.delete(`/v1/holidays/${christmas.id}`, admin.session)).status).toBe(204);
    const count = () =>
      scenario.inTenant((tx) => tx.auditEvent.count({ where: { entityType: 'core_seed' } }));
    const before = await count();
    await seedCore(apiDatabase(), [scenario.tenant.id], systemClock);
    expect(await count()).toBe(before);
    const again = await scenario.inTenant((tx) =>
      tx.holiday.findUniqueOrThrow({ where: { id: christmas.id } }),
    );
    expect(again.deletedAt).not.toBeNull();
  });
});
