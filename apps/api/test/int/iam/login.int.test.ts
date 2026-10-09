import type { NestExpressApplication } from '@nestjs/platform-express';
import { errorResponseSchema, sessionResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashSecretToken } from '../../../src/modules/iam/infrastructure/secret-token.js';
import type { DatabaseService } from '../../../src/platform/database/database.service.js';
import type { TenantTransaction } from '../../../src/platform/database/tenant-context.js';
import {
  createDatabaseService,
  createTenant,
  newTestTenant,
} from '../support/integration-database.js';
import {
  GOOD_PASSWORD,
  MINUTE,
  ManualClock,
  SESSION_COOKIE,
  auditActions,
  createIamTestApp,
  createUser,
  errorCode,
  freshIp,
  postFromWeb,
  profileOf,
  signIn,
  tenantScope,
  uniqueEmail,
} from './support/iam-fixtures.js';

// Inicio de sesión (numeral 15.1) contra la base de datos real.

const tenant = newTestTenant('inicio de sesión');
const clock = new ManualClock();
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

function login(email: string, password: string, ip = freshIp()) {
  return postFromWeb(app, '/v1/auth/login', { email, password }, ip);
}

function inTenant<T>(work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
  return tenantScope(database, tenant.id)(work);
}

async function newUser(label: string, extra: { kind?: 'portal' } = {}) {
  const email = uniqueEmail(label);
  const id = await createUser(database, { tenantId: tenant.id, email, ...extra });
  return { email, id };
}

describe('cookie de sesión', () => {
  it('es HttpOnly, Secure, SameSite=Lax, de todo el dominio y con prefijo __Host-', async () => {
    const { email } = await newUser('ana');
    const response = await login(email.toUpperCase(), GOOD_PASSWORD);
    expect(response.status).toBe(200);
    expect(sessionResponseSchema.parse(response.body).user.email).toBe(email);
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    for (const attribute of [/HttpOnly/, /Secure/, /SameSite=Lax/, /Path=\//]) {
      expect(setCookie).toMatch(attribute);
    }
    expect(setCookie).not.toMatch(/Domain=/);
  });

  it('en la base queda solo la huella de la llave, nunca la llave', async () => {
    const { email } = await newUser('huella');
    const { token } = await signIn(app, email);
    const byHash = await inTenant((tx) =>
      tx.session.count({ where: { tokenHash: hashSecretToken(token) } }),
    );
    const byToken = await inTenant((tx) => tx.session.count({ where: { tokenHash: token } }));
    expect({ byHash, byToken }).toEqual({ byHash: 1, byToken: 0 });
  });

  it('cada inicio de sesión recibe una llave distinta', async () => {
    const { email } = await newUser('rotacion');
    const first = await signIn(app, email);
    const second = await signIn(app, email);
    expect(first.token).not.toBe(second.token);
    expect(first.session.csrf_token).not.toBe(second.session.csrf_token);
  });
});

describe('sesión iniciada', () => {
  it('da acceso a la sesión actual y al perfil propio', async () => {
    const { email, id } = await newUser('perfil');
    const { cookie, session } = await signIn(app, email);
    const current = await request(app.getHttpServer())
      .get('/v1/auth/session')
      .set('Cookie', cookie);
    expect(sessionResponseSchema.parse(current.body).csrf_token).toBe(session.csrf_token);
    const profile = await profileOf(app, cookie);
    expect(profile).toMatchObject({ id, email, kind: 'internal' });
    expect(profile?.last_login_at).not.toBeNull();
  });

  it('deja auditoría de los dos pasos del inicio de sesión', async () => {
    const { email, id } = await newUser('auditoria');
    await signIn(app, email);
    const sessions = await inTenant((tx) => tx.session.findMany({ where: { userId: id } }));
    const actions = await auditActions(database, tenant.id, sessions[0]?.id ?? '');
    expect(actions).toEqual(['iam.session.create:success', 'iam.mfa.verify:success']);
  });

  it('una persona del portal inicia sesión y se identifica como tal', async () => {
    const { email } = await newUser('portal', { kind: 'portal' });
    const { cookie, session } = await signIn(app, email);
    expect(session.user.kind).toBe('portal');
    expect((await profileOf(app, cookie))?.kind).toBe('portal');
  });

  it('sin cookie, o con una llave que no existe, no hay acceso', async () => {
    expect((await request(app.getHttpServer()).get('/v1/me')).status).toBe(401);
    expect(await profileOf(app, `${SESSION_COOKIE}=${'c'.repeat(43)}`)).toBeNull();
  });
});

describe('el mensaje de error no revela si el correo existe (numeral 15.1)', () => {
  it('contraseña equivocada y correo inexistente responden exactamente igual', async () => {
    const { email } = await newUser('existe');
    const wrongPassword = await login(email, 'otra frase cualquiera');
    const unknownEmail = await login(uniqueEmail('no-existe'), 'otra frase cualquiera');
    expect([wrongPassword.status, unknownEmail.status]).toEqual([401, 401]);
    const a = errorResponseSchema.parse(wrongPassword.body).error;
    const b = errorResponseSchema.parse(unknownEmail.body).error;
    expect({ code: a.code, message: a.message }).toEqual({ code: b.code, message: b.message });
    expect(a.code).toBe('INVALID_CREDENTIALS');
  });

  it.each(['invited', 'locked', 'inactive'] as const)(
    'una cuenta en estado %s no entra y recibe el mismo mensaje',
    async (status) => {
      const email = uniqueEmail(status);
      await createUser(database, { tenantId: tenant.id, email, status });
      const response = await login(email, GOOD_PASSWORD);
      expect(response.status).toBe(401);
      expect(errorCode(response)).toBe('INVALID_CREDENTIALS');
    },
  );
});

describe('espera progresiva (numeral 15.1)', () => {
  it('después de un fallo exige esperar antes del siguiente intento', async () => {
    const { email } = await newUser('espera');
    expect((await login(email, 'frase equivocada uno')).status).toBe(401);
    const early = await login(email, GOOD_PASSWORD);
    expect(early.status).toBe(429);
    expect(errorCode(early)).toBe('LOGIN_DELAYED');
    expect(early.headers['retry-after']).toBe('1');
    clock.advance(1000);
    expect((await login(email, GOOD_PASSWORD)).status).toBe(200);
  });

  it('el límite general de peticiones de acceso es de 10 por minuto por IP', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await login(uniqueEmail('limite'), 'frase equivocada', ip)).status);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});

async function failFiveTimes(email: string): Promise<request.Response> {
  let last: request.Response | undefined;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    last = await login(email, `frase equivocada ${String(attempt)}`);
    clock.advance(10_000);
  }
  if (last === undefined) throw new Error('Sin intentos');
  return last;
}

describe('bloqueo al quinto fallo (ficha 17.2)', () => {
  it('bloquea 15 minutos, incluso con la contraseña correcta, y luego deja entrar', async () => {
    const { email } = await newUser('bloqueo');
    const fifth = await failFiveTimes(email);
    expect(fifth.status).toBe(429);
    expect(errorCode(fifth)).toBe('ACCOUNT_LOCKED');
    expect(errorCode(await login(email, GOOD_PASSWORD))).toBe('ACCOUNT_LOCKED');
    clock.advance(15 * MINUTE);
    expect((await login(email, GOOD_PASSWORD)).status).toBe(200);
  });

  it('registra el evento de seguridad, la alerta y la auditoría', async () => {
    const { email, id } = await newUser('evento');
    await failFiveTimes(email);
    const security = await inTenant((tx) => tx.securityEvent.findMany({ where: { userId: id } }));
    expect(security.map((event) => event.type)).toEqual(['iam.account.locked']);
    const alerts = await inTenant((tx) =>
      tx.outboxEvent.findMany({ where: { eventType: 'security.alert' } }),
    );
    expect(alerts.some((alert) => JSON.stringify(alert.payload).includes(id))).toBe(true);
    const actions = await auditActions(database, tenant.id, id);
    expect(actions.filter((action) => action === 'iam.session.create:failure')).toHaveLength(5);
    expect(actions).toContain('iam.user.lock:success');
  });

  it('un correo sin cuenta se bloquea igual: el comportamiento no delata cuáles existen', async () => {
    const fifth = await failFiveTimes(uniqueEmail('fantasma'));
    expect(fifth.status).toBe(429);
    expect(errorCode(fifth)).toBe('ACCOUNT_LOCKED');
  });
});
