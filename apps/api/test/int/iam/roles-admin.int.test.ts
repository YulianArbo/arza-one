import {
  createdResponseSchema,
  permissionCatalogResponseSchema,
  roleDetailResponseSchema,
  roleListResponseSchema,
  type RoleDetailResponse,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode } from './support/iam-fixtures.js';
import { AccessScenario, type Person } from './support/access-scenario.js';

// Roles del sistema y personalizados (B10). Los del sistema no se editan; nadie edita un rol que
// tiene; cada cambio queda auditado.

const scenario = new AccessScenario('roles');
let counter = 0;

function newRoleBody(permissions: object[]) {
  counter += 1;
  return { name: `Apoyo comercial ${String(counter)}`, audience: 'internal', permissions };
}

async function createRole(admin: Person, permissions: object[]): Promise<RoleDetailResponse> {
  const created = await scenario.post('/v1/roles', admin.session, newRoleBody(permissions));
  expect(created.status).toBe(201);
  const { id } = createdResponseSchema.parse(created.body);
  return roleDetailResponseSchema.parse(
    (await scenario.get(`/v1/roles/${id}`, admin.session)).body,
  );
}

const LEADS = [{ code: 'crm.lead.read', scope: 'all' }];

describe('consultar roles y permisos', () => {
  it('lista los 16 roles del sistema con sus permisos y el catálogo completo', async () => {
    const director = await scenario.person('director', ['DIRECCION']);
    const roles = roleListResponseSchema.parse(
      (await scenario.get('/v1/roles', director.session)).body,
    );
    const system = roles.data.filter((role) => role.is_system);
    expect(system).toHaveLength(16);
    expect(system.find((role) => role.code === 'DIRECCION')?.assigned_users).toBeGreaterThan(0);
    const catalog = permissionCatalogResponseSchema.parse(
      (await scenario.get('/v1/permissions', director.session)).body,
    );
    const permissions = catalog.groups.flatMap((group) => group.permissions);
    expect(permissions).toHaveLength(207);
    expect(permissions.map((permission) => permission.code)).toEqual(
      expect.arrayContaining([
        'finance.ledger.read',
        'finance.cost_certification.manage',
        'finance.period.close',
      ]),
    );
  });

  it('un rol del sistema no se edita', async () => {
    const admin = await scenario.person('admin-sistema', ['ADMIN_PLATAFORMA']);
    const id = await scenario.roleId('COMERCIAL');
    const response = await scenario.patch(`/v1/roles/${id}`, admin.session, { name: 'Otro' }, 1);
    expect(errorCode(response)).toBe('SYSTEM_ROLE_READONLY');
  });
});

describe('roles personalizados', () => {
  it('crea un rol con «solo lo propio» y lo audita', async () => {
    const admin = await scenario.person('crea', ['ADMIN_PLATAFORMA']);
    const role = await createRole(admin, [
      { code: 'crm.lead.read', scope: 'all' },
      { code: 'service.ticket.read', scope: 'own' },
    ]);
    expect(role).toMatchObject({ is_system: false, permission_count: 2, version: 1 });
    expect(role.code).toMatch(/^APOYO_COMERCIAL_\d+$/);
    expect(await auditActions(scenario.db, scenario.tenant.id, role.id)).toEqual([
      'iam.role.create:success',
    ]);
  });

  it('rechaza permisos del portal, «solo lo propio» donde no cabe y nombres repetidos', async () => {
    const admin = await scenario.person('rechaza', ['ADMIN_PLATAFORMA']);
    const portal = newRoleBody([{ code: 'portal.invoice.read', scope: 'all' }]);
    expect(errorCode(await scenario.post('/v1/roles', admin.session, portal))).toBe(
      'PERMISSION_SCOPE_INVALID',
    );
    const own = newRoleBody([{ code: 'crm.quote.approve', scope: 'own' }]);
    expect(errorCode(await scenario.post('/v1/roles', admin.session, own))).toBe(
      'PERMISSION_SCOPE_INVALID',
    );
    const role = await createRole(admin, LEADS);
    const repeated = { ...newRoleBody(LEADS), name: role.name.toUpperCase() };
    expect(errorCode(await scenario.post('/v1/roles', admin.session, repeated))).toBe(
      'ROLE_NAME_TAKEN',
    );
  });
});

describe('editar un rol personalizado', () => {
  it('edita con la versión vista y avisa si otra persona lo cambió antes', async () => {
    const admin = await scenario.person('edita', ['ADMIN_PLATAFORMA']);
    const role = await createRole(admin, LEADS);
    const permissions = [...LEADS, { code: 'crm.report.read', scope: 'all' }];
    const edited = await scenario.patch(`/v1/roles/${role.id}`, admin.session, { permissions }, 1);
    expect(edited.status).toBe(200);
    expect(roleDetailResponseSchema.parse(edited.body)).toMatchObject({ version: 2 });
    const stale = await scenario.patch(`/v1/roles/${role.id}`, admin.session, { name: 'Viejo' }, 1);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const noVersion = await scenario.patch(`/v1/roles/${role.id}`, admin.session, {
      name: 'Sin versión',
    });
    expect(errorCode(noVersion)).toBe('VERSION_REQUIRED');
    expect(await auditActions(scenario.db, scenario.tenant.id, role.id)).toContain(
      'iam.role.update:success',
    );
  });
});

describe('nadie edita un rol que tiene', () => {
  it('quien tiene el rol no puede cambiarlo; otro administrador sí', async () => {
    const owner = await scenario.person('dueno', ['ADMIN_PLATAFORMA']);
    const other = await scenario.person('otro-admin', ['ADMIN_PLATAFORMA']);
    const role = await createRole(other, LEADS);
    const from = scenario.clock.now();
    await scenario.inTenant((tx) =>
      tx.userRole.create({
        data: { tenantId: scenario.tenant.id, userId: owner.id, roleId: role.id, validFrom: from },
      }),
    );
    const own = await scenario.patch(`/v1/roles/${role.id}`, owner.session, { name: 'Mío' }, 1);
    expect(errorCode(own)).toBe('SELF_PERMISSION_CHANGE');
    const byOther = await scenario.patch(
      `/v1/roles/${role.id}`,
      other.session,
      { name: 'Nuevo' },
      1,
    );
    expect(byOther.status).toBe(200);
  });
});

describe('aislamiento de roles personalizados', () => {
  it('el rol personalizado de una empresa no existe para otra', async () => {
    const adminA = await scenario.person('admin-roles-a', ['ADMIN_PLATAFORMA']);
    const adminB = await scenario.person('admin-roles-b', ['ADMIN_PLATAFORMA'], {
      tenantId: scenario.otherTenant.id,
    });
    const role = await createRole(adminA, LEADS);
    expect((await scenario.get(`/v1/roles/${role.id}`, adminB.session)).status).toBe(404);
    const listing = roleListResponseSchema.parse(
      (await scenario.get('/v1/roles', adminB.session)).body,
    );
    expect(listing.data.map((item) => item.id)).not.toContain(role.id);
  });
});
