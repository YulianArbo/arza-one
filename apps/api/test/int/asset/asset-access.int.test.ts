import { assetMaintenanceListResponseSchema } from '@arza/contracts';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import { createdId, keyed, putVersioned, versioned } from '../fin/support/ledger-steps.js';
import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { ASSETS, MAINTENANCE, AssetScenario, type AssetTeam } from './support/asset-scenario.js';

// B34: inventario y mantenimientos con sus reglas, permisos denegados, «solo lo propio» y
// aislamiento entre empresas. Datos ficticios.

const s = new AssetScenario('activos permisos');

let prepared: AssetTeam | undefined;

async function team(): Promise<AssetTeam> {
  prepared ??= await s.assetTeam('permisos');
  return prepared;
}

function expectError(response: Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(errorCode(response)).toBe(code);
}

describe('inventario de activos', () => {
  it('registra, edita con control de versión y rechaza datos imposibles', async () => {
    const t = await team();
    const future = s.assetBody({ purchase_date: s.day(2) });
    expectError(await keyed(s, t.manager, ASSETS, future), 422, 'AST_RECORD_INVALID');
    const zeroLife = s.assetBody({ useful_life_months: 0 });
    expectError(await keyed(s, t.manager, ASSETS, zeroLife), 422, 'VALIDATION_FAILED');

    const id = await s.newAsset(t.manager, { category: 'software_license', serial: null });
    const renamed = s.assetBody({ name: 'Licencia de diseño', category: 'software_license' });
    const path = `${ASSETS}/${id}`;
    expect((await putVersioned(s, path, t.manager, renamed, 1)).status).toBe(204);
    expectError(await putVersioned(s, path, t.manager, renamed, 1), 409, 'VERSION_CONFLICT');
    const { asset } = await s.assetDetail(t.manager, id);
    expect(asset).toMatchObject({ name: 'Licencia de diseño', version: 2 });
    expect(await auditActions(s.db, s.tenant.id, id)).toEqual([
      'asset.create:success',
      'asset.update:success',
    ]);
  });
});

describe('bajas de activos', () => {
  it('una baja exige motivo y un activo dado de baja no se edita', async () => {
    const t = await team();
    const id = await s.newAsset(t.manager);
    const path = `${ASSETS}/${id}/retirement`;
    const noReason = { retired_on: s.day(0), note: 'Sin motivo' };
    expectError(
      await versioned(s.post(path, t.manager.session, noReason), 1),
      422,
      'VALIDATION_FAILED',
    );
    const early = { retired_on: s.day(-500), reason: 'damage', note: 'Antes de la compra' };
    expectError(
      await versioned(s.post(path, t.manager.session, early), 1),
      422,
      'AST_RECORD_INVALID',
    );
    expect((await s.retire(t.manager, id)).status).toBe(204);
    expectError(
      await putVersioned(s, `${ASSETS}/${id}`, t.manager, s.assetBody(), 2),
      409,
      'AST_STATUS_INVALID',
    );
  });
});

describe('mantenimientos', () => {
  it('se programan, se registran como hechos con su costo y solo se quitan los pendientes', async () => {
    const t = await team();
    const assetId = await s.newAsset(t.manager);
    const path = `${ASSETS}/${assetId}/maintenance`;
    const body = { kind: 'preventive', scheduled_on: s.day(10), note: 'Limpieza interna' };
    const id = await createdId(keyed(s, t.manager, path, body));
    const other = await createdId(keyed(s, t.manager, path, { ...body, kind: 'corrective' }));

    const done = `${MAINTENANCE}/${id}/completion`;
    const late = { done_on: s.day(1), cost: '80000', note: null };
    expectError(
      await versioned(s.post(done, t.manager.session, late), 1),
      422,
      'AST_RECORD_INVALID',
    );
    const today = { done_on: s.day(0), cost: '80000.00', note: null };
    expect((await versioned(s.post(done, t.manager.session, today), 1)).status).toBe(204);
    expectError(await s.del(`${MAINTENANCE}/${id}`, t.manager), 409, 'AST_STATUS_INVALID');
    expect((await s.del(`${MAINTENANCE}/${other}`, t.manager)).status).toBe(204);

    const list = assetMaintenanceListResponseSchema.parse(
      (await s.get(MAINTENANCE, t.auditor.session)).body,
    ).data;
    expect(list.find((row) => row.id === id)).toMatchObject({
      done_on: s.day(0),
      cost: '80000.00',
    });
    expect(list.some((row) => row.id === other)).toBe(false);
    expect(await auditActions(s.db, s.tenant.id, id)).toEqual([
      'asset.maintenance.schedule:success',
      'asset.maintenance.complete:success',
    ]);
  });
});

describe('permisos de activos', () => {
  it('el colaborador ve solo los activos a su cargo y no administra', async () => {
    const t = await team();
    const mine = await s.newAsset(t.manager);
    const notMine = await s.newAsset(t.manager);
    await s.activeWithoutSigning(t, mine);
    const visible = (await s.assets(t.holder)).map((asset) => asset.id);
    expect(visible).toContain(mine);
    expect(visible).not.toContain(notMine);
    expectError(await s.get(`${ASSETS}/${notMine}`, t.holder.session), 404, 'AST_RECORD_NOT_FOUND');
    expect((await s.assetDetail(t.holder, mine)).assignments).toEqual([]);
    expectError(await keyed(s, t.holder, ASSETS, s.assetBody()), 403, 'PERMISSION_DENIED');
    expectError(await s.assign(t.holder, notMine, t.holder), 403, 'PERMISSION_DENIED');
    expectError(await s.retire(t.holder, mine), 403, 'PERMISSION_DENIED');
    const book = await s.post(`${ASSETS}/book/export`, t.holder.session, {});
    expectError(book, 403, 'PERMISSION_DENIED');
    expect((await s.assets(t.manager, `?holder_id=${t.holder.id}`)).map((a) => a.id)).toContain(
      mine,
    );
  });

  it('el auditor consulta y descarga el libro, pero no escribe', async () => {
    const t = await team();
    const id = await s.newAsset(t.manager);
    expect((await s.assets(t.auditor)).map((asset) => asset.id)).toContain(id);
    expectError(await keyed(s, t.auditor, ASSETS, s.assetBody()), 403, 'PERMISSION_DENIED');
    expectError(await s.assign(t.auditor, id, t.holder), 403, 'PERMISSION_DENIED');
    expectError(await s.get('/v1/asset-assignees', t.auditor.session), 403, 'PERMISSION_DENIED');
    const schedule = { kind: 'preventive', scheduled_on: s.day(5), note: null };
    expectError(
      await keyed(s, t.auditor, `${ASSETS}/${id}/maintenance`, schedule),
      403,
      'PERMISSION_DENIED',
    );
  });
});

describe('aislamiento entre empresas', () => {
  it('otra empresa no ve ni cambia los activos de esta', async () => {
    const t = await team();
    const serial = `SN-${crypto.randomUUID()}`;
    const id = await s.newAsset(t.manager, { serial });
    const outsider = await s.person('activos-otra', ['ADMIN_FINANCIERO'], {
      tenantId: s.otherTenant.id,
    });
    expect((await s.assets(outsider)).map((asset) => asset.id)).not.toContain(id);
    expectError(await s.get(`${ASSETS}/${id}`, outsider.session), 404, 'AST_RECORD_NOT_FOUND');
    expectError(
      await putVersioned(s, `${ASSETS}/${id}`, outsider, s.assetBody(), 1),
      404,
      'AST_RECORD_NOT_FOUND',
    );
    const stranger = await s.linkedCollaborator('recibe-otra', s.otherTenant.id);
    expectError(await s.assign(outsider, id, stranger), 404, 'AST_RECORD_NOT_FOUND');
    expectError(await s.assign(t.manager, id, stranger), 422, 'AST_RECORD_INVALID');
    const book = await s.post(`${ASSETS}/book/export`, outsider.session, {});
    expect(book.status, book.text).toBe(200);
    expect(book.text).not.toContain(serial);
    const own = await s.post(`${ASSETS}/book/export`, t.auditor.session, {});
    expect(own.text).toContain(serial);
  });
});
