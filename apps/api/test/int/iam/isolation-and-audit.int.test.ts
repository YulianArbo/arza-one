import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../../src/platform/database/database.service.js';
import {
  connect,
  createDatabaseService,
  createTenant,
  integrationDatabase,
  newTestTenant,
} from '../support/integration-database.js';
import {
  ManualClock,
  accountEmailJob,
  profileOf,
  createIamTestApp,
  createUser,
  linkTokenFromEmail,
  signIn,
  uniqueEmail,
} from './support/iam-fixtures.js';

// Aislamiento entre empresas (ADR-007) y auditoría de solo inserción (capítulo 12.1) para las
// tablas de identidad.

const tenantA = newTestTenant('identidad A');
const tenantB = newTestTenant('identidad B');
const clock = new ManualClock();
let database: DatabaseService;
let app: NestExpressApplication;
let appUser: pg.Client;
let userA: string;
let userB: string;
let emailB: string;

beforeAll(async () => {
  database = createDatabaseService();
  await createTenant(database, tenantA);
  await createTenant(database, tenantB);
  userA = await createUser(database, { tenantId: tenantA.id, email: uniqueEmail('a') });
  emailB = uniqueEmail('b');
  userB = await createUser(database, { tenantId: tenantB.id, email: emailB });
  app = await createIamTestApp(clock);
  appUser = await connect(integrationDatabase().appUrl);
});

afterAll(async () => {
  await appUser.end();
  await app.close();
  await database.onModuleDestroy();
});

const IAM_TABLES = [
  'iam_users',
  'iam_sessions',
  'iam_tokens',
  'iam_login_attempts',
  'aud_events',
  'aud_security_events',
];

describe('aislamiento entre empresas', () => {
  it('dentro de la empresa A no se ve ninguna cuenta, sesión ni auditoría de la empresa B', async () => {
    await signIn(app, emailB);
    const seen = await database.withTenant({ tenantId: tenantA.id, userId: null }, async (tx) => ({
      users: await tx.user.findMany({ where: { tenantId: tenantB.id } }),
      byId: await tx.user.findUnique({ where: { id: userB } }),
      sessions: await tx.session.findMany({ where: { userId: userB } }),
      attempts: await tx.loginAttempt.findMany({ where: { userId: userB } }),
      audit: await tx.auditEvent.findMany({ where: { tenantId: tenantB.id } }),
    }));
    expect(seen).toEqual({ users: [], byId: null, sessions: [], attempts: [], audit: [] });
  });
});

describe('aislamiento entre empresas: escrituras y sesiones', () => {
  it('la empresa A no puede escribir una cuenta en la empresa B', async () => {
    await expect(
      database.withTenant({ tenantId: tenantA.id, userId: null }, (tx) =>
        tx.user.create({
          data: { tenantId: tenantB.id, email: uniqueEmail('intrusa'), kind: 'internal' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('una persona de la empresa B solo ve su propio perfil', async () => {
    const { cookie } = await signIn(app, emailB);
    const profile = await profileOf(app, cookie);
    expect(profile?.id).toBe(userB);
    expect(JSON.stringify(profile)).not.toContain(userA);
  });
});

describe('aislamiento entre empresas: enlaces y trabajos', () => {
  it('un enlace emitido para la empresa A solo cambia la cuenta de la empresa A', async () => {
    const token = await linkTokenFromEmail(
      database,
      clock,
      accountEmailJob(tenantA.id, userA, 'password_reset'),
    );
    const before = await database.withTenant({ tenantId: tenantB.id, userId: null }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userB } }),
    );
    const response = await request(app.getHttpServer())
      .post('/v1/auth/password/reset')
      .send({ token, password: 'arepa de choclo con queso' });
    expect(response.status).toBe(204);
    const after = await database.withTenant({ tenantId: tenantB.id, userId: null }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userB } }),
    );
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('un trabajo de correo con la empresa equivocada no encuentra la cuenta', async () => {
    await expect(
      linkTokenFromEmail(database, clock, accountEmailJob(tenantA.id, userB, 'password_reset')),
    ).rejects.toThrow('El correo no trae un enlace con llave.');
  });

  it('sin contexto de empresa, app_user no ve ninguna fila de identidad', async () => {
    for (const table of IAM_TABLES) {
      const { rows } = await appUser.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
      expect(rows[0]?.count, table).toBe('0');
    }
  });
});

describe('permisos de app_user sobre identidad y auditoría', () => {
  it('todas las tablas nuevas tienen la seguridad por fila forzada y no son de app_user', async () => {
    const { rows } = await appUser.query<{ owner: string; enabled: boolean; forced: boolean }>(
      `SELECT pg_get_userbyid(relowner) AS owner, relrowsecurity AS enabled,
              relforcerowsecurity AS forced
         FROM pg_class WHERE relname = ANY($1::text[])`,
      [IAM_TABLES],
    );
    expect(rows).toHaveLength(IAM_TABLES.length);
    for (const row of rows) {
      expect(row).toEqual({ owner: 'migration_user', enabled: true, forced: true });
    }
  });

  const denied: [string, string][] = [
    ['modificar un evento de auditoría', "UPDATE aud_events SET result = 'failure'"],
    ['borrar eventos de auditoría', 'DELETE FROM aud_events'],
    ['modificar un evento de seguridad', "UPDATE aud_security_events SET severity = 'low'"],
    ['borrar eventos de seguridad', 'DELETE FROM aud_security_events'],
    ['borrar cuentas (el borrado es lógico)', 'DELETE FROM iam_users'],
    ['borrar sesiones', 'DELETE FROM iam_sessions'],
    [
      'escribir intentos sin la función',
      `INSERT INTO iam_login_attempts (id, email, succeeded, reason, occurred_at)
       VALUES ('${uuidv7()}', 'x@pruebas.test', true, 'ok', now())`,
    ],
    ['modificar intentos', "UPDATE iam_login_attempts SET reason = 'ok'"],
    ['vaciar la auditoría', 'TRUNCATE aud_events'],
  ];

  it.each(denied)('no puede %s', async (_description, sql) => {
    await expect(appUser.query(sql)).rejects.toThrow(/permission denied/);
  });
});

describe('funciones de búsqueda de identidad', () => {
  it('las búsquedas de identidad solo devuelven a qué usuario y empresa pertenece el dato', async () => {
    const { rows } = await appUser.query('SELECT * FROM iam_find_login_user($1)', [emailB]);
    expect(rows).toEqual([{ user_id: userB, tenant_id: tenantB.id }]);
  });

  it('app_user no puede cambiar las funciones de búsqueda', async () => {
    await expect(
      appUser.query(
        'CREATE OR REPLACE FUNCTION iam_find_login_user(p_email TEXT) RETURNS TABLE (user_id UUID, tenant_id UUID) LANGUAGE sql AS $$ SELECT id, tenant_id FROM iam_users $$',
      ),
    ).rejects.toThrow(/must be owner|permission denied/);
  });
});
