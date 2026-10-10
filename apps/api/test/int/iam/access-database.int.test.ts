import { PERMISSIONS, systemRoleGrants } from '@arza/contracts';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedAccessControl } from '../../../src/modules/iam/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import type { DatabaseService } from '../../../src/platform/database/database.service.js';
import {
  apiDatabase,
  connect,
  createDatabaseService,
  createTenant,
  integrationDatabase,
  newTestTenant,
} from '../support/integration-database.js';
import { createUser, tenantScope, uniqueEmail } from './support/iam-fixtures.js';

// Roles y permisos en la base de datos (B10): catálogo y roles del sistema como dato semilla,
// semilla que se puede repetir, seguridad por fila y reglas que la base hace cumplir sola.

const tenantA = newTestTenant('acceso A');
const tenantB = newTestTenant('acceso B');
const TENANT_TABLES = ['iam_roles', 'iam_role_permissions', 'iam_user_roles', 'iam_delegations'];
let database: DatabaseService;
let appUser: pg.Client;

beforeAll(async () => {
  database = createDatabaseService();
  await createTenant(database, tenantA);
  await createTenant(database, tenantB);
  appUser = await connect(integrationDatabase().appUrl);
});

afterAll(async () => {
  await appUser.end();
  await database.onModuleDestroy();
});

describe('datos semilla de acceso', () => {
  it('el catálogo de la base es el del anexo G', async () => {
    const rows = await tenantScope(database, tenantA.id)((tx) => tx.permission.findMany());
    const live = rows.filter((row) => row.deletedAt === null).map((row) => row.code);
    expect(live.sort()).toEqual(PERMISSIONS.map((permission) => permission.code).sort());
  });

  it('cada empresa tiene los 16 roles del sistema con los permisos de la matriz', async () => {
    const roles = await tenantScope(
      database,
      tenantA.id,
    )((tx) =>
      tx.role.findMany({
        where: { isSystem: true },
        include: { permissions: { where: { deletedAt: null }, include: { permission: true } } },
      }),
    );
    expect(roles).toHaveLength(16);
    const director = roles.find((role) => role.code === 'DIRECCION');
    const codes = director?.permissions.map((item) => item.permission.code).sort();
    expect(codes).toEqual(
      systemRoleGrants('DIRECCION')
        .map((grant) => grant.code)
        .sort(),
    );
  });
});

describe('semilla repetible', () => {
  it('repetir la semilla no cambia nada; un permiso agregado a mano se retira', async () => {
    const sync = () =>
      tenantScope(
        database,
        tenantA.id,
      )((tx) => tx.auditEvent.count({ where: { action: 'iam.role.sync' } }));
    const before = await sync();
    await seedAccessControl(apiDatabase(), [tenantA.id], systemClock);
    expect(await sync()).toBe(before);
    await tenantScope(
      database,
      tenantA.id,
    )(async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { code: 'COLABORADOR' } });
      const salary = await tx.permission.findUniqueOrThrow({ where: { code: 'hr.salary.read' } });
      await tx.rolePermission.create({
        data: { tenantId: tenantA.id, roleId: role.id, permissionId: salary.id },
      });
    });
    await seedAccessControl(apiDatabase(), [tenantA.id], systemClock);
    expect(await sync()).toBe(before + 1);
    const extra = await tenantScope(
      database,
      tenantA.id,
    )((tx) =>
      tx.rolePermission.count({
        where: {
          deletedAt: null,
          role: { code: 'COLABORADOR' },
          permission: { code: 'hr.salary.read' },
        },
      }),
    );
    expect(extra).toBe(0);
  });
});

describe('seguridad por fila de las tablas nuevas', () => {
  it('todas la tienen forzada y app_user no es su dueño', async () => {
    const { rows } = await appUser.query<{ owner: string; forced: boolean }>(
      `SELECT pg_get_userbyid(relowner) AS owner, relforcerowsecurity AS forced
         FROM pg_class WHERE relname = ANY($1::text[])`,
      [TENANT_TABLES],
    );
    expect(rows).toHaveLength(TENANT_TABLES.length);
    expect(rows.every((row) => row.owner === 'migration_user' && row.forced)).toBe(true);
  });

  it('sin empresa no se ve ningún rol, y una empresa no ve los de otra', async () => {
    const { rows: none } = await appUser.query('SELECT id FROM iam_roles');
    expect(none).toHaveLength(0);
    const seen = await tenantScope(database, tenantA.id)((tx) => tx.role.findMany());
    expect(seen.every((role) => role.tenantId === tenantA.id)).toBe(true);
    expect(seen).toHaveLength(16);
  });

  it.each([...TENANT_TABLES, 'iam_permissions'])(
    'app_user no puede borrar en %s',
    async (table) => {
      await expect(appUser.query(`DELETE FROM ${table}`)).rejects.toThrow(/permission denied/);
    },
  );
});

describe('reglas que la base de datos hace cumplir', () => {
  it('una condición distinta de «solo lo propio» se rechaza', async () => {
    const write = tenantScope(
      database,
      tenantA.id,
    )(async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { code: 'AUDITOR' } });
      const permission = await tx.permission.findUniqueOrThrow({
        where: { code: 'iam.user.lock' },
      });
      await tx.rolePermission.create({
        data: {
          tenantId: tenantA.id,
          roleId: role.id,
          permissionId: permission.id,
          conditions: { owner: { $ne: null } },
        },
      });
    });
    await expect(write).rejects.toThrow(/iam_role_permissions_conditions_check/);
  });
});

describe('reglas de las delegaciones en la base de datos', () => {
  it('una delegación a quien la registra o de más de 60 días se rechaza', async () => {
    const from = await createUser(database, { tenantId: tenantA.id, email: uniqueEmail('de') });
    const to = await createUser(database, { tenantId: tenantA.id, email: uniqueEmail('para') });
    const start = new Date();
    const delegation = (endsInDays: number) => ({
      tenantId: tenantA.id,
      fromUserId: from,
      toUserId: to,
      startsAt: start,
      endsAt: new Date(start.getTime() + endsInDays * 24 * 60 * 60 * 1000),
      scope: ['finance.invoice.approve'],
      reason: 'Prueba de reglas',
    });
    const asDelegate = database.withTenant({ tenantId: tenantA.id, userId: to }, (tx) =>
      tx.delegation.create({ data: delegation(5) }),
    );
    await expect(asDelegate).rejects.toThrow(/iam_delegations_not_self_check/);
    const tooLong = tenantScope(
      database,
      tenantA.id,
    )((tx) => tx.delegation.create({ data: delegation(61) }));
    await expect(tooLong).rejects.toThrow(/iam_delegations_period_check/);
  });
});
