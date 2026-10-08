import type { NestExpressApplication } from '@nestjs/platform-express';
import { acknowledgementResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prepareAccountEmail } from '../../../src/modules/iam/index.js';
import type { DatabaseService } from '../../../src/platform/database/database.service.js';
import type { TenantTransaction } from '../../../src/platform/database/tenant-context.js';
import {
  createDatabaseService,
  createTenant,
  newTestTenant,
} from '../support/integration-database.js';
import {
  APP_URL,
  GOOD_PASSWORD,
  MINUTE,
  ManualClock,
  WEB_ORIGIN,
  accountEmailJob,
  accountEmailJobs,
  auditActions,
  createIamTestApp,
  createUser,
  errorCode,
  linkTokenFromEmail,
  postFromWeb,
  profileOf,
  signIn,
  tenantScope,
  uniqueEmail,
} from './support/iam-fixtures.js';

// Recuperación y cambio de contraseña (numeral 15.1). Criterio de B08: cambiar la contraseña
// cierra todas las sesiones.

const tenant = newTestTenant('contraseñas');
const clock = new ManualClock();
const NEW_PASSWORD = 'arepa de choclo con queso';
let database: DatabaseService;
let app: NestExpressApplication;

beforeAll(async () => {
  database = createDatabaseService();
  await createTenant(database, tenant);
  app = await createIamTestApp(clock);
});

afterAll(async () => {
  await app.close();
  await database.onModuleDestroy();
});

function inTenant<T>(work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
  return tenantScope(database, tenant.id)(work);
}

async function newUser(label: string, status: 'active' | 'invited' | 'inactive' = 'active') {
  const email = uniqueEmail(label);
  const id = await createUser(database, { tenantId: tenant.id, email, status });
  return { email, id };
}

async function openSessions(userId: string): Promise<number> {
  return inTenant((tx) => tx.session.count({ where: { userId, revokedAt: null } }));
}

async function resetToken(userId: string): Promise<string> {
  return linkTokenFromEmail(database, clock, accountEmailJob(tenant.id, userId, 'password_reset'));
}

function reset(token: string, password = NEW_PASSWORD) {
  return postFromWeb(app, '/v1/auth/password/reset', { token, password });
}

describe('pedir el enlace de recuperación', () => {
  it('responde igual exista o no la cuenta, y solo encola el correo si existe', async () => {
    const { email, id } = await newUser('olvido');
    const known = await postFromWeb(app, '/v1/auth/password/forgot', { email });
    const unknown = await postFromWeb(app, '/v1/auth/password/forgot', {
      email: uniqueEmail('nadie'),
    });
    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(acknowledgementResponseSchema.parse(known.body)).toEqual(unknown.body);
    expect(await accountEmailJobs(id, 'password_reset')).toHaveLength(1);
    expect(await auditActions(database, tenant.id, id)).toContain(
      'iam.password.reset_request:success',
    );
  });

  it.each(['invited', 'inactive'] as const)('una cuenta %s no recibe enlace', async (status) => {
    const { email, id } = await newUser(status, status);
    expect((await postFromWeb(app, '/v1/auth/password/forgot', { email })).status).toBe(202);
    expect(await accountEmailJobs(id, 'password_reset')).toHaveLength(0);
  });
});

describe('crear la contraseña nueva con el enlace', () => {
  it('cambia la contraseña, cierra todas las sesiones y lo audita', async () => {
    const { email, id } = await newUser('restablecer');
    await signIn(app, email);
    await signIn(app, email);
    expect(await openSessions(id)).toBe(2);
    expect((await reset(await resetToken(id))).status).toBe(204);
    expect(await openSessions(id)).toBe(0);
    expect(await auditActions(database, tenant.id, id)).toContain('iam.password.reset:success');
  });

  it('la contraseña anterior deja de servir y la nueva funciona', async () => {
    const { email, id } = await newUser('nueva');
    await reset(await resetToken(id));
    const login = (password: string) => postFromWeb(app, '/v1/auth/login', { email, password });
    expect((await login(GOOD_PASSWORD)).status).toBe(401);
    clock.advance(MINUTE);
    expect((await login(NEW_PASSWORD)).status).toBe(200);
  });

  it('avisa por correo, sin enlace, cuándo cambió', async () => {
    const { email, id } = await newUser('aviso');
    const job = accountEmailJob(tenant.id, id, 'password_changed');
    const deps = { database, clock, appUrl: APP_URL };
    expect(await prepareAccountEmail(job, deps)).toBeNull();
    await reset(await resetToken(id));
    expect(await accountEmailJobs(id, 'password_changed')).toHaveLength(1);
    const notice = await prepareAccountEmail(job, deps);
    expect(notice).toMatchObject({ to: email, subject: 'Su contraseña de ARZA ONE cambió' });
    expect(notice?.text).toContain('se cerraron todas sus sesiones');
    expect(notice?.text).not.toContain('token=');
  });
});

describe('el enlace de recuperación', () => {
  it('sirve una sola vez', async () => {
    const { id } = await newUser('una-vez');
    const token = await resetToken(id);
    expect((await reset(token)).status).toBe(204);
    const again = await reset(token, 'otra frase distinta y larga');
    expect(again.status).toBe(422);
    expect(errorCode(again)).toBe('LINK_INVALID');
  });

  it('vence a los 30 minutos', async () => {
    const { id } = await newUser('vencido');
    const token = await resetToken(id);
    clock.advance(30 * MINUTE);
    expect(errorCode(await reset(token))).toBe('LINK_INVALID');
  });

  it('pedir uno nuevo deja sin efecto el anterior', async () => {
    const { id } = await newUser('reemplazo');
    const first = await resetToken(id);
    const second = await resetToken(id);
    expect(errorCode(await reset(first))).toBe('LINK_INVALID');
    expect((await reset(second)).status).toBe(204);
  });

  it('rechaza contraseñas cortas o filtradas sin gastarse', async () => {
    const { id } = await newUser('reglas');
    const token = await resetToken(id);
    expect(errorCode(await reset(token, 'corta'))).toBe('PASSWORD_TOO_SHORT');
    expect(errorCode(await reset(token, '123456789012'))).toBe('PASSWORD_BREACHED');
    expect((await reset(token)).status).toBe(204);
  });

  it('uno inventado no sirve', async () => {
    expect(errorCode(await reset('b'.repeat(43)))).toBe('LINK_INVALID');
  });
});

function change(cookie: string, csrf: string | null, body: object) {
  const call = request(app.getHttpServer())
    .post('/v1/me/password')
    .set('Origin', WEB_ORIGIN)
    .set('Cookie', cookie);
  return (csrf === null ? call : call.set('X-CSRF-Token', csrf)).send(body);
}

const CHANGE = { current_password: GOOD_PASSWORD, new_password: NEW_PASSWORD };

describe('cambiar la contraseña desde el perfil', () => {
  it('cierra todas las sesiones, incluida la actual, y borra la cookie', async () => {
    const { email, id } = await newUser('cambio');
    const other = await signIn(app, email);
    const current = await signIn(app, email);
    const response = await change(current.cookie, current.session.csrf_token, CHANGE);
    expect(response.status).toBe(204);
    expect(String(response.headers['set-cookie'])).toMatch(/__Host-arza_session=;/);
    expect(await openSessions(id)).toBe(0);
    expect(await profileOf(app, current.cookie)).toBeNull();
    expect(await profileOf(app, other.cookie)).toBeNull();
  });

  it('lo audita y avisa por correo', async () => {
    const { email, id } = await newUser('cambio-aviso');
    const { cookie, session } = await signIn(app, email);
    await change(cookie, session.csrf_token, CHANGE);
    expect(await auditActions(database, tenant.id, id)).toContain('iam.password.change:success');
    expect(await accountEmailJobs(id, 'password_changed')).toHaveLength(1);
  });
});

describe('cambiar la contraseña: permiso denegado y reglas', () => {
  it('sin el código antifalsificación se rechaza y nada cambia', async () => {
    const { email, id } = await newUser('sin-codigo');
    const { cookie } = await signIn(app, email);
    expect((await change(cookie, null, CHANGE)).status).toBe(403);
    expect(await openSessions(id)).toBe(1);
  });

  it('exige la contraseña actual correcta y una nueva distinta', async () => {
    const { email } = await newUser('actual');
    const { cookie, session } = await signIn(app, email);
    const wrong = await change(cookie, session.csrf_token, {
      current_password: 'no es la actual de esta cuenta',
      new_password: NEW_PASSWORD,
    });
    expect(errorCode(wrong)).toBe('CURRENT_PASSWORD_INCORRECT');
    const same = await change(cookie, session.csrf_token, {
      current_password: GOOD_PASSWORD,
      new_password: GOOD_PASSWORD,
    });
    expect(errorCode(same)).toBe('PASSWORD_UNCHANGED');
  });
});
