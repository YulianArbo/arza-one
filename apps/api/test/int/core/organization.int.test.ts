import {
  orgUnitListResponseSchema,
  positionListResponseSchema,
  siteListResponseSchema,
  tenantProfileSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { CoreScenario, uniqueTaxId } from './support/core-scenario.js';

// Empresa, sedes, procesos y cargos (B12, ficha 17.1): organigrama sembrado, jerarquía sin ciclos,
// una sola sede principal y nada con registros asociados se elimina. Todo queda auditado.

const scenario = new CoreScenario('organización');

describe('datos de la empresa', () => {
  it('cambia la razón social con la versión vista y lo audita con el valor anterior', async () => {
    const admin = await scenario.admin();
    const before = tenantProfileSchema.parse(
      (await scenario.get('/v1/tenant', admin.session)).body,
    );
    const body = {
      legal_name: 'Empresa Renombrada S.A.S.',
      trade_name: null,
      tax_id: uniqueTaxId(),
    };
    const stale = await scenario.patch('/v1/tenant', admin.session, body, before.version + 5);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const response = await scenario.patch('/v1/tenant', admin.session, body, before.version);
    expect(response.body).toMatchObject({
      legal_name: body.legal_name,
      version: before.version + 1,
    });
    const event = await scenario.inTenant((tx) =>
      tx.auditEvent.findFirstOrThrow({ where: { action: 'core.tenant.update' } }),
    );
    expect(event.changes).toMatchObject({
      legalName: { from: before.legal_name, to: body.legal_name },
    });
  });
});

describe('datos de la empresa: validaciones', () => {
  it('sin la cabecera If-Match responde 400; un NIT de otra empresa responde 409', async () => {
    const admin = await scenario.admin();
    const taxId = uniqueTaxId();
    const body = { legal_name: 'Otra S.A.S.', trade_name: null, tax_id: taxId };
    expect(errorCode(await scenario.patch('/v1/tenant', admin.session, body))).toBe(
      'VERSION_REQUIRED',
    );
    const current = tenantProfileSchema.parse(
      (await scenario.get('/v1/tenant', admin.session)).body,
    );
    expect((await scenario.patch('/v1/tenant', admin.session, body, current.version)).status).toBe(
      200,
    );
    const other = await scenario.admin(scenario.otherTenant.id);
    const mine = tenantProfileSchema.parse((await scenario.get('/v1/tenant', other.session)).body);
    const taken = await scenario.patch('/v1/tenant', other.session, body, mine.version);
    expect(errorCode(taken)).toBe('CORE_TAX_ID_TAKEN');
  });
});

describe('sedes', () => {
  it('la primera sede es la principal y al marcar otra la anterior deja de serlo', async () => {
    const admin = await scenario.admin(scenario.otherTenant.id);
    const site = { city: 'Bogotá', address: 'Calle 100 # 10-20' };
    const first = await scenario.create('/v1/sites', admin, { ...site, name: 'Sede norte' });
    const second = await scenario.create('/v1/sites', admin, { ...site, name: 'Sede sur' });
    const update = { ...site, name: 'Sede sur', is_main: true, is_active: true };
    expect((await scenario.patch(`/v1/sites/${second}`, admin.session, update, 1)).status).toBe(
      200,
    );
    const sites = siteListResponseSchema.parse(
      (await scenario.get('/v1/sites', admin.session)).body,
    );
    expect(sites.data.map((s) => [s.id, s.is_main])).toEqual([
      [second, true],
      [first, false],
    ]);
  });
});

describe('sedes: la principal', () => {
  it('la sede principal no se inactiva ni se elimina; otra sí y queda auditada', async () => {
    const admin = await scenario.admin();
    const site = { city: 'Medellín', address: 'Carrera 43A # 1-50' };
    const main = await scenario.create('/v1/sites', admin, {
      ...site,
      name: 'Principal',
      is_main: true,
    });
    const other = await scenario.create('/v1/sites', admin, { ...site, name: 'Bodega' });
    const inactive = { ...site, name: 'Principal', is_main: true, is_active: false };
    expect(errorCode(await scenario.patch(`/v1/sites/${main}`, admin.session, inactive, 1))).toBe(
      'CORE_MAIN_SITE_REQUIRED',
    );
    expect(errorCode(await scenario.delete(`/v1/sites/${main}`, admin.session, 1))).toBe(
      'CORE_MAIN_SITE_REQUIRED',
    );
    expect((await scenario.delete(`/v1/sites/${other}`, admin.session, 1)).status).toBe(204);
    expect(await auditActions(scenario.db, scenario.tenant.id, other)).toEqual([
      'core.site.create:success',
      'core.site.delete:success',
    ]);
  });
});

describe('organigrama sembrado (DC-SGC-001, provisional)', () => {
  it('tiene los 10 procesos y 14 cargos con una sola cabeza: el Director General', async () => {
    const admin = await scenario.admin();
    const units = orgUnitListResponseSchema.parse(
      (await scenario.get('/v1/org-units', admin.session)).body,
    );
    const positions = positionListResponseSchema.parse(
      (await scenario.get('/v1/positions', admin.session)).body,
    );
    expect(units.data.filter((u) => u.kind === 'process')).toHaveLength(10);
    expect(positions.data).toHaveLength(14);
    const heads = positions.data.filter((p) => p.reports_to_id === null);
    expect(heads.map((p) => p.name)).toEqual(['Director General']);
    const dg = units.data.find((u) => u.code === 'DG');
    expect(dg?.owner_position_id).toBe(heads[0]?.id);
  });
});
