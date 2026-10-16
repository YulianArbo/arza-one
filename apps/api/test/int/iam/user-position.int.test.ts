import { userDetailResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import type { TenantTransaction } from '../../../src/platform/database/tenant-context.js';
import { errorCode, tenantScope } from './support/iam-fixtures.js';
import { AccessScenario, type Person } from './support/access-scenario.js';

// Cargo de cada persona interna: de él sale su jefe inmediato en los flujos (B15). Lo asigna quien
// tiene iam.user.update, nunca a sí mismo, y solo con cargos activos de su empresa.

const scenario = new AccessScenario('cargos');

let counter = 0;

async function newPosition(
  tx: TenantTransaction,
  tenantId: string,
  active = true,
): Promise<{ id: string; name: string }> {
  counter += 1;
  const code = `CG-${uuidv7().slice(-8).toUpperCase()}`;
  const unit = await tx.orgUnit.create({
    data: { tenantId, code, name: 'Proceso de prueba', kind: 'area' },
  });
  return tx.position.create({
    data: { tenantId, orgUnitId: unit.id, name: `Cargo ${String(counter)}`, isActive: active },
    select: { id: true, name: true },
  });
}

function position(active = true): Promise<{ id: string; name: string }> {
  return scenario.inTenant((tx) => newPosition(tx, scenario.tenant.id, active));
}

/** Versión actual de la ficha (1 si no se ve desde esta empresa). */
async function versionOf(userId: string): Promise<number> {
  const user = await scenario.inTenant((tx) => tx.user.findFirst({ where: { id: userId } }));
  return user?.version ?? 1;
}

async function setPosition(
  actor: Person,
  userId: string,
  positionId: string | null,
  version?: number,
) {
  const body = { position_id: positionId };
  return scenario.patch(
    `/v1/users/${userId}`,
    actor.session,
    body,
    version ?? (await versionOf(userId)),
  );
}

async function positionShown(actor: Person, userId: string) {
  const response = await scenario.get(`/v1/users/${userId}`, actor.session);
  return userDetailResponseSchema.parse(response.body).position;
}

function positionAudits(userId: string) {
  return scenario.inTenant((tx) =>
    tx.auditEvent.findMany({
      where: { entityId: userId, action: 'iam.user.position' },
      orderBy: { seq: 'asc' },
    }),
  );
}

describe('asignar el cargo', () => {
  it('asigna, cambia y quita el cargo, con auditoría de cada cambio', async () => {
    const admin = await scenario.person('admin-cargo', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('con-cargo', ['COMERCIAL']);
    const first = await position();
    const second = await position();
    expect((await setPosition(admin, target.id, first.id)).status).toBe(204);
    expect(await positionShown(admin, target.id)).toEqual({ ...first, is_active: true });
    expect((await setPosition(admin, target.id, second.id)).status).toBe(204);
    expect((await setPosition(admin, target.id, null)).status).toBe(204);
    expect(await positionShown(admin, target.id)).toBeNull();
    const audits = await positionAudits(target.id);
    expect(audits.map((event) => event.changes)).toEqual([
      { position: { from: null, to: first } },
      { position: { from: first, to: second } },
      { position: { from: second, to: null } },
    ]);
    expect(audits.every((event) => event.actorId === admin.id)).toBe(true);
  });

  it('guardar el mismo cargo no deja otro evento de auditoría', async () => {
    const admin = await scenario.person('admin-igual', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('igual', ['COMERCIAL']);
    const same = await position();
    await setPosition(admin, target.id, same.id);
    const again = await setPosition(admin, target.id, same.id);
    expect(again.status, again.text).toBe(204);
    expect(await positionAudits(target.id)).toHaveLength(1);
  });

  it('la ficha sigue mostrando el cargo aunque después se inactive', async () => {
    const admin = await scenario.person('admin-inactiva', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('cargo-viejo', ['COMERCIAL']);
    const later = await position();
    await setPosition(admin, target.id, later.id);
    await scenario.inTenant((tx) =>
      tx.position.update({ where: { id: later.id }, data: { isActive: false } }),
    );
    expect(await positionShown(admin, target.id)).toEqual({ ...later, is_active: false });
  });
});

describe('reglas del cargo', () => {
  it('rechaza un cargo inactivo o que no existe', async () => {
    const admin = await scenario.person('admin-reglas', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('reglas', ['COMERCIAL']);
    const inactive = await position(false);
    expect(errorCode(await setPosition(admin, target.id, inactive.id))).toBe('POSITION_INACTIVE');
    expect(errorCode(await setPosition(admin, target.id, uuidv7()))).toBe('POSITION_NOT_FOUND');
    expect(await positionAudits(target.id)).toHaveLength(0);
  });

  it('nadie cambia su propio cargo', async () => {
    const admin = await scenario.person('admin-propio', ['ADMIN_PLATAFORMA']);
    const own = await position();
    const response = await setPosition(admin, admin.id, own.id);
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('SELF_ACTION_NOT_ALLOWED');
  });

  it('las cuentas del portal no ocupan cargos', async () => {
    const admin = await scenario.person('admin-portal', ['ADMIN_PLATAFORMA']);
    const client = await scenario.newUser('cliente', { kind: 'portal' });
    const any = await position();
    expect(errorCode(await setPosition(admin, client.id, any.id))).toBe('USER_STATE_INVALID');
  });

  it('exige indicar el cargo o null, y la versión que se vio', async () => {
    const admin = await scenario.person('admin-cuerpo', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('cuerpo', ['COMERCIAL']);
    const version = await versionOf(target.id);
    const missing = await scenario.patch(`/v1/users/${target.id}`, admin.session, {}, version);
    expect(missing.status).toBe(422);
    const any = await position();
    const stale = await setPosition(admin, target.id, any.id, version + 1);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const unversioned = await scenario.patch(`/v1/users/${target.id}`, admin.session, {
      position_id: any.id,
    });
    expect(unversioned.status).toBe(400);
  });
});

describe('permiso y aislamiento', () => {
  it('sin iam.user.update no se asigna, aunque se vea la ficha', async () => {
    const director = await scenario.person('director-cargo', ['DIRECCION']);
    const seller = await scenario.person('vendedor-cargo', ['COMERCIAL']);
    const target = await scenario.person('denegado', ['COMERCIAL']);
    const any = await position();
    for (const actor of [director, seller]) {
      const response = await setPosition(actor, target.id, any.id);
      expect(response.status).toBe(403);
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
    expect(await positionShown(director, target.id)).toBeNull();
  });

  it('no usa usuarios ni cargos de otra empresa', async () => {
    const admin = await scenario.person('admin-aislado', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('aislado', ['COMERCIAL']);
    const outsider = await scenario.newUser('de-otra', { tenantId: scenario.otherTenant.id });
    const inOther = tenantScope(scenario.db, scenario.otherTenant.id);
    const foreign = await inOther((tx) => newPosition(tx, scenario.otherTenant.id));
    const own = await position();
    expect(errorCode(await setPosition(admin, target.id, foreign.id))).toBe('POSITION_NOT_FOUND');
    expect(errorCode(await setPosition(admin, outsider.id, own.id))).toBe('USER_NOT_FOUND');
    const untouched = await inOther((tx) =>
      tx.user.findUniqueOrThrow({ where: { id: outsider.id } }),
    );
    expect(untouched.positionId).toBeNull();
  });
});
