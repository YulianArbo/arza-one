import { createdResponseSchema, myPermissionsResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { apiDatabase } from '../support/integration-database.js';
import {
  MINUTE,
  accountEmailJobs,
  auditActions,
  errorCode,
  tenantScope,
} from './support/iam-fixtures.js';
import { AccountNotifier } from '../../../src/modules/iam/application/account-notifier.js';
import { CliRoleAssignment } from '../../../src/modules/iam/application/cli-role-assignment.js';
import { JobQueue } from '../../../src/platform/queues/job-queue.js';
import { AccessScenario, type Person } from './support/access-scenario.js';

// Asignar y retirar roles (B10, iam.role.assign). Nadie cambia sus propios roles (ficha 17.2).

const scenario = new AccessScenario('asignacion');
const DAY = 24 * 60 * MINUTE;

function assign(admin: Person, userId: string, body: object) {
  return scenario.post(`/v1/users/${userId}/roles`, admin.session, body);
}

function inDays(days: number): string {
  return new Date(scenario.clock.now().getTime() + days * DAY).toISOString();
}

async function roleCodes(person: Person): Promise<string[]> {
  const response = await scenario.get('/v1/me/permissions', person.session);
  return myPermissionsResponseSchema.parse(response.body).roles.map((role) => role.code);
}

describe('asignar un rol', () => {
  it('asigna, audita, alerta y avisa a la persona; surte efecto de inmediato', async () => {
    const admin = await scenario.person('admin', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('comercial', []);
    const response = await assign(admin, target.id, {
      role_id: await scenario.roleId('COMERCIAL'),
    });
    expect(response.status).toBe(201);
    const { id } = createdResponseSchema.parse(response.body);
    expect(await roleCodes(target)).toEqual(['COMERCIAL']);
    expect(await auditActions(scenario.db, scenario.tenant.id, target.id)).toContain(
      'iam.role.assign:success',
    );
    const saved = await scenario.inTenant((tx) => tx.userRole.findUniqueOrThrow({ where: { id } }));
    expect(saved).toMatchObject({ assignedBy: admin.id, createdBy: admin.id, revokedAt: null });
    const alerts = await scenario.inTenant((tx) =>
      tx.securityEvent.findMany({ where: { type: 'iam.permissions.changed', userId: admin.id } }),
    );
    expect(alerts).toHaveLength(1);
    expect(await accountEmailJobs(target.id, 'permissions_changed')).toHaveLength(1);
  });
});

describe('nadie se asigna roles a sí mismo', () => {
  it('nadie se asigna un rol a sí mismo, ni por la API ni en la base de datos', async () => {
    const admin = await scenario.person('a-si-mismo', ['ADMIN_PLATAFORMA']);
    const role_id = await scenario.roleId('DIRECCION');
    const response = await assign(admin, admin.id, { role_id });
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('SELF_PERMISSION_CHANGE');
    const direct = tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.userRole.create({
        data: {
          tenantId: scenario.tenant.id,
          userId: admin.id,
          roleId: role_id,
          validFrom: scenario.clock.now(),
          assignedBy: admin.id,
        },
      }),
    );
    await expect(direct).rejects.toThrow(/iam_user_roles_not_self_check/);
    expect(await roleCodes(admin)).toEqual(['ADMIN_PLATAFORMA']);
  });
});

describe('roles repetidos y de otro tipo de cuenta', () => {
  it('no repite un rol vigente ni asigna roles del portal a personas internas', async () => {
    const admin = await scenario.person('repite', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('ya-tiene', ['COMERCIAL']);
    const again = await assign(admin, target.id, { role_id: await scenario.roleId('COMERCIAL') });
    expect(errorCode(again)).toBe('ROLE_ALREADY_ASSIGNED');
    const portal = await assign(admin, target.id, {
      role_id: await scenario.roleId('CLIENTE_ADMIN'),
    });
    expect(errorCode(portal)).toBe('ROLE_AUDIENCE_MISMATCH');
  });
});

describe('reglas del rol de auditor y del administrador del cliente', () => {
  it('el auditor siempre vence, a los 90 días como máximo', async () => {
    const admin = await scenario.person('admin-auditor', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('auditora', []);
    const role_id = await scenario.roleId('AUDITOR');
    const forever = await assign(admin, target.id, { role_id });
    expect(errorCode(forever)).toBe('ROLE_EXPIRY_INVALID');
    const tooLong = await assign(admin, target.id, { role_id, valid_until: inDays(91) });
    expect(errorCode(tooLong)).toBe('ROLE_EXPIRY_INVALID');
    expect((await assign(admin, target.id, { role_id, valid_until: inDays(30) })).status).toBe(201);
  });

  it('asignar CLIENTE_ADMIN vuelve obligatorio el segundo factor', async () => {
    const admin = await scenario.person('admin-portal', ['ADMIN_PLATAFORMA']);
    const client = await scenario.newUser('cliente', { kind: 'portal' });
    const response = await assign(admin, client.id, {
      role_id: await scenario.roleId('CLIENTE_ADMIN'),
    });
    expect(response.status).toBe(201);
    const user = await scenario.inTenant((tx) =>
      tx.user.findUniqueOrThrow({ where: { id: client.id } }),
    );
    expect(user.mfaRequired).toBe(true);
  });
});

describe('retirar un rol', () => {
  it('retira, conserva el historial y surte efecto en la siguiente petición', async () => {
    const admin = await scenario.person('retira', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('pierde', ['DIRECCION']);
    const [assignment] = await scenario.inTenant((tx) =>
      tx.userRole.findMany({ where: { userId: target.id } }),
    );
    const path = `/v1/users/${target.id}/roles/${assignment?.id ?? ''}/actions/revoke`;
    expect((await scenario.post(path, admin.session)).status).toBe(204);
    expect((await scenario.get('/v1/users', target.session)).status).toBe(403);
    const history = await scenario.inTenant((tx) =>
      tx.userRole.findMany({ where: { userId: target.id } }),
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ revokedBy: admin.id });
    expect((await scenario.post(path, admin.session)).status).toBe(404);
  });

  it('nadie se retira sus propios roles', async () => {
    const admin = await scenario.person('auto-retiro', ['ADMIN_PLATAFORMA']);
    const [own] = await scenario.inTenant((tx) =>
      tx.userRole.findMany({ where: { userId: admin.id } }),
    );
    const path = `/v1/users/${admin.id}/roles/${own?.id ?? ''}/actions/revoke`;
    expect(errorCode(await scenario.post(path, admin.session))).toBe('SELF_PERMISSION_CHANGE');
  });
});

describe('alto riesgo y aislamiento', () => {
  it('pasados 30 minutos, asignar exige confirmar la identidad', async () => {
    const admin = await scenario.person('admin-antiguo', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('espera', []);
    scenario.clock.advance(31 * MINUTE);
    const response = await assign(admin, target.id, { role_id: await scenario.roleId('SST') });
    expect(errorCode(response)).toBe('REAUTHENTICATION_REQUIRED');
  });

  it('no se asignan roles a personas ni con roles de otra empresa: 404', async () => {
    const admin = await scenario.person('admin-aislado', ['ADMIN_PLATAFORMA']);
    const local = await scenario.person('local', []);
    const foreign = await scenario.newUser('ajena', { tenantId: scenario.otherTenant.id });
    const role_id = await scenario.roleId('COMERCIAL');
    expect((await assign(admin, foreign.id, { role_id })).status).toBe(404);
    const foreignRole = await scenario.roleId('COMERCIAL', scenario.otherTenant.id);
    const response = await assign(admin, local.id, { role_id: foreignRole });
    expect(errorCode(response)).toBe('ROLE_NOT_FOUND');
  });
});

describe('primer administrador por comando (pnpm iam:asignar-rol)', () => {
  it('el sistema asigna el rol, queda auditado como sistema y avisa a la persona', async () => {
    const first = await scenario.newUser('primer-admin');
    const notifier = new AccountNotifier(scenario.app.get(JobQueue));
    const command = new CliRoleAssignment(apiDatabase(), scenario.clock, notifier);
    const input = { email: first.email, roleCode: 'ADMIN_PLATAFORMA', validUntil: null };
    await expect(command.execute(input)).resolves.toBe('assigned');
    const [assignment] = await scenario.inTenant((tx) =>
      tx.userRole.findMany({ where: { userId: first.id } }),
    );
    expect(assignment).toMatchObject({ assignedBy: null, createdBy: null });
    const audit = await scenario.inTenant((tx) =>
      tx.auditEvent.findFirstOrThrow({ where: { entityId: first.id, action: 'iam.role.assign' } }),
    );
    expect(audit.actorKind).toBe('system');
    expect(await accountEmailJobs(first.id, 'permissions_changed')).toHaveLength(1);
  });

  it('un correo sin cuenta o un rol que no existe no asignan nada', async () => {
    const notifier = new AccountNotifier(scenario.app.get(JobQueue));
    const command = new CliRoleAssignment(apiDatabase(), scenario.clock, notifier);
    const unknown = { email: 'nadie@pruebas.test', roleCode: 'DIRECCION', validUntil: null };
    await expect(command.execute(unknown)).resolves.toBe('not_found');
    const person = await scenario.newUser('rol-inexistente');
    const badRole = { email: person.email, roleCode: 'NO_EXISTE', validUntil: null };
    await expect(command.execute(badRole)).resolves.toBe('not_found');
  });
});
