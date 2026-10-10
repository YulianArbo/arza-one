import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  errorResponseSchema,
  meResponseSchema,
  sessionResponseSchema,
  type MeResponse,
  type SessionResponse,
} from '@arza/contracts';
import { Queue } from 'bullmq';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import { prepareAccountEmail } from '../../../../src/modules/iam/index.js';
import { hashPassword } from '../../../../src/modules/iam/infrastructure/password-hasher.js';
import { newTotpSecret, totpCodeAt } from '../../../../src/modules/iam/infrastructure/totp.js';
import { CLOCK, type Clock } from '../../../../src/platform/clock/clock.js';
import { FieldCipher } from '../../../../src/platform/crypto/field-cipher.js';
import type { DatabaseService } from '../../../../src/platform/database/database.service.js';
import type { TenantTransaction } from '../../../../src/platform/database/tenant-context.js';
import {
  JOBS,
  QUEUES,
  type AccountEmailJob,
  type AccountEmailPurpose,
} from '../../../../src/platform/queues/jobs.js';
import { createTestApp } from '../../../support/test-app.js';
import { testEnv } from '../../../support/test-env.js';
import { createDatabaseService, integrationDatabase } from '../../support/integration-database.js';

// Apoyo de las pruebas de identidad con PostgreSQL y Valkey reales. Todos los datos son ficticios.

export const WEB_ORIGIN = 'http://localhost:3000';
export const APP_URL = 'http://localhost:3000/app';
export const SESSION_COOKIE = '__Host-arza_session';
/** Contraseña ficticia que cumple las reglas y no está en la lista de filtradas. */
export const GOOD_PASSWORD = 'mango biche con sal y limon';

/** Reloj que las pruebas mueven a voluntad: bloqueo de 15 min, sesión de 8 h, enlaces de 72 h. */
export class ManualClock implements Clock {
  private current = new Date();

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

/**
 * Valkey de estas pruebas: base lógica 1, aparte de la que usan las pruebas de la cola de B06,
 * que cuentan los trabajos y correrían en paralelo con estas.
 */
function iamValkeyUrl(): string {
  return `${inject('valkeyUrl')}/1`;
}

export async function createIamTestApp(clock: Clock): Promise<NestExpressApplication> {
  return createTestApp({
    clock,
    env: { DATABASE_URL: integrationDatabase().appUrl, VALKEY_URL: iamValkeyUrl() },
  });
}

let ipCounter = 0;

/**
 * Dirección IP distinta para cada grupo de peticiones. El límite de peticiones de las rutas de
 * acceso (10 por minuto) cuenta por IP; así cada prueba tiene su propio conteo.
 */
export function freshIp(): string {
  ipCounter += 1;
  return `10.8.${String(Math.floor(ipCounter / 250))}.${String((ipCounter % 250) + 1)}`;
}

export function uniqueEmail(label: string): string {
  return `${label}-${uuidv7()}@pruebas.test`;
}

interface NewUser {
  readonly tenantId: string;
  readonly email: string;
  readonly status?: 'invited' | 'active' | 'locked' | 'inactive';
  readonly kind?: 'internal' | 'portal';
  readonly password?: string;
  /** Marca de segundo factor obligatorio para el portal (las internas siempre lo exigen). */
  readonly requireSecondFactor?: boolean;
  /**
   * La cuenta ya tiene segundo factor activo. Por defecto lo tienen las internas activas, que lo
   * exigen. Con false, la persona tendrá que configurarlo al entrar.
   */
  readonly withSecondFactor?: boolean;
}

/** Misma llave ficticia con la que la API de pruebas cifra los secretos. */
const cipher = new FieldCipher(testEnv()['FIELD_ENCRYPTION_KEY'] ?? '');

interface Phone {
  readonly secret: string;
  readonly tenantId: string;
  readonly userId: string;
}

/** «Celular» de cada cuenta de prueba: su secreto, por correo. */
const phones = new Map<string, Phone>();

export function factorContext(tenantId: string, userId: string): string {
  return `iam_mfa_factors:${tenantId}:${userId}`;
}

function phoneOf(email: string): Phone {
  const phone = phones.get(email);
  if (phone === undefined) throw new Error(`La cuenta ${email} no tiene segundo factor.`);
  return phone;
}

/** Código que mostraría la aplicación del celular de la persona (ahora, o desplazado). */
export function currentCode(email: string, clock: Clock, offsetMs = 0): string {
  return totpCodeAt(phoneOf(email).secret, new Date(clock.now().getTime() + offsetMs));
}

async function enrollSecondFactor(tx: TenantTransaction, phone: Phone, email: string) {
  await tx.mfaFactor.create({
    data: {
      tenantId: phone.tenantId,
      userId: phone.userId,
      secretEncrypted: cipher.encrypt(phone.secret, factorContext(phone.tenantId, phone.userId)),
      confirmedAt: new Date(),
    },
  });
  phones.set(email, phone);
}

/** Crea una cuenta directamente en la base, dentro de su empresa. */
export async function createUser(database: DatabaseService, user: NewUser): Promise<string> {
  const status = user.status ?? 'active';
  const kind = user.kind ?? 'internal';
  const passwordHash =
    status === 'invited' ? null : await hashPassword(user.password ?? GOOD_PASSWORD);
  return database.withTenant({ tenantId: user.tenantId, userId: null }, async (tx) => {
    const created = await tx.user.create({
      data: {
        tenantId: user.tenantId,
        email: user.email,
        kind,
        status,
        passwordHash,
        displayName: 'Persona de prueba',
        mfaRequired: kind === 'internal' || user.requireSecondFactor === true,
      },
    });
    if (user.withSecondFactor ?? (kind === 'internal' && status !== 'invited')) {
      const phone = { secret: newTotpSecret(), tenantId: user.tenantId, userId: created.id };
      await enrollSecondFactor(tx, phone, user.email);
    }
    return created.id;
  });
}

export interface SignedIn {
  readonly token: string;
  readonly cookie: string;
  readonly session: SessionResponse;
}

/** Valor de una cookie en la cabecera Set-Cookie de una respuesta. */
export function cookieValue(header: string | string[] | undefined, name: string): string | null {
  const cookies = Array.isArray(header) ? header : header === undefined ? [] : [header];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (cookie === undefined) return null;
  const value = cookie.slice(name.length + 1).split(';')[0] ?? '';
  return value === '' ? null : value;
}

/** Sesión que entrega una respuesta de inicio de sesión o de segundo paso. */
export function signedInFrom(response: request.Response, what: string): SignedIn {
  if (response.status !== 200) {
    throw new Error(`${what} respondió ${String(response.status)}: ${response.text}`);
  }
  const token = cookieValue(response.headers['set-cookie'], SESSION_COOKIE);
  if (token === null) throw new Error(`${what} no entregó la cookie de sesión.`);
  return {
    token,
    cookie: `${SESSION_COOKIE}=${token}`,
    session: sessionResponseSchema.parse(response.body),
  };
}

export interface SignInOptions {
  readonly password?: string;
  /** Cookies adicionales, como la marca del equipo. */
  readonly cookies?: readonly string[];
}

/** Solo la contraseña: la sesión puede quedar a medias, esperando el segundo factor. */
export async function signInWithPassword(
  app: NestExpressApplication,
  email: string,
  options: SignInOptions = {},
): Promise<SignedIn> {
  let call = request(app.getHttpServer())
    .post('/v1/auth/login')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp());
  const cookies = options.cookies ?? [];
  if (cookies.length > 0) call = call.set('Cookie', cookies.join('; '));
  const response = await call.send({ email, password: options.password ?? GOOD_PASSWORD });
  return signedInFrom(response, 'El inicio de sesión');
}

/** POST con la cookie y el código antifalsificación de una sesión (completa o a medias). */
export function postWithSession(
  app: NestExpressApplication,
  path: string,
  signedIn: SignedIn,
  body: object = {},
): request.Test {
  return request(app.getHttpServer())
    .post(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', signedIn.cookie)
    .set('X-CSRF-Token', signedIn.session.csrf_token)
    .send(body);
}

let fixtureDatabase: DatabaseService | undefined;

/** Olvida el último código usado de la cuenta (ver signIn). Es preparación, no un caso de uso. */
async function forgetLastCode(email: string): Promise<void> {
  const { tenantId, userId } = phoneOf(email);
  fixtureDatabase ??= createDatabaseService();
  await fixtureDatabase.withTenant({ tenantId, userId: null }, (tx) =>
    tx.mfaFactor.updateMany({ where: { userId }, data: { lastUsedStep: null } }),
  );
}

/**
 * Inicia sesión por la API, con el segundo factor si la cuenta lo tiene, y devuelve la cookie y
 * el código antifalsificación. Cada código sirve una sola vez; para que una misma cuenta pueda
 * entrar varias veces dentro de los mismos 30 segundos, este ayudante olvida el último código
 * usado antes de enviar el siguiente. La prueba de que un código no sirve dos veces está en
 * second-factor.int.test.ts, sin este atajo.
 */
export async function signIn(
  app: NestExpressApplication,
  email: string,
  options: SignInOptions | string = {},
): Promise<SignedIn> {
  const settings = typeof options === 'string' ? { password: options } : options;
  const pending = await signInWithPassword(app, email, settings);
  if (pending.session.stage !== 'second_factor') return pending;
  await forgetLastCode(email);
  const code = currentCode(email, app.get<Clock>(CLOCK));
  // El navegador envía en el segundo paso las mismas cookies, como la marca del equipo.
  const withCookies = {
    ...pending,
    cookie: [pending.cookie, ...(settings.cookies ?? [])].join('; '),
  };
  const response = await postWithSession(app, '/v1/auth/mfa/verify', withCookies, { code });
  return signedInFrom(response, 'El segundo factor');
}

/** Trabajos de correo de cuenta encolados para una persona. */
export async function accountEmailJobs(
  userId: string,
  purpose: AccountEmailPurpose,
): Promise<AccountEmailJob[]> {
  const queue = new Queue(QUEUES.platform, { connection: { url: iamValkeyUrl() } });
  try {
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
    return jobs
      .filter((job) => job.name === JOBS.accountEmail.name)
      .map((job) => JOBS.accountEmail.schema.parse(job.data))
      .filter((data) => data.accountUserId === userId && data.purpose === purpose);
  } finally {
    await queue.close();
  }
}

/**
 * Hace lo que el worker: prepara el correo del trabajo y devuelve la llave del enlace, que solo
 * existe dentro del correo.
 */
export async function linkTokenFromEmail(
  database: DatabaseService,
  clock: Clock,
  job: AccountEmailJob,
): Promise<string> {
  const email = await prepareAccountEmail(job, { database, clock, appUrl: APP_URL });
  const match = email === null ? null : /#token=([\w-]{43})/.exec(email.text);
  if (match?.[1] === undefined) throw new Error('El correo no trae un enlace con llave.');
  return match[1];
}

/** Trabajo de correo como lo encolaría la API, para preparar enlaces sin pasar por la cola. */
export function accountEmailJob(
  tenantId: string,
  accountUserId: string,
  purpose: AccountEmailPurpose,
): AccountEmailJob {
  return { tenantId, userId: null, accountUserId, purpose, correlationId: uuidv7() };
}

/** Ejecuta consultas de comprobación dentro de una empresa, como el sistema. */
export function tenantScope(database: DatabaseService, tenantId: string) {
  return <T>(work: (tx: TenantTransaction) => Promise<T>): Promise<T> =>
    database.withTenant({ tenantId, userId: null }, work);
}

/** Acciones de auditoría registradas sobre un registro, en orden. */
export async function auditActions(
  database: DatabaseService,
  tenantId: string,
  entityId: string,
): Promise<string[]> {
  const events = await tenantScope(
    database,
    tenantId,
  )((tx) => tx.auditEvent.findMany({ where: { entityId }, orderBy: { occurredAt: 'asc' } }));
  return events.map((event) => `${event.action}:${event.result}`);
}

/** POST desde la web, cada vez con una IP distinta (ver freshIp). */
export function postFromWeb(
  app: NestExpressApplication,
  path: string,
  body: object,
  ip = freshIp(),
): request.Test {
  return request(app.getHttpServer())
    .post(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', ip)
    .send(body);
}

/** Código de error de una respuesta, validada contra el formato del numeral 14.2. */
export function errorCode(response: request.Response): string {
  return errorResponseSchema.parse(response.body).error.code;
}

/** Perfil propio con la cookie dada: null si no hay acceso. */
export async function profileOf(
  app: NestExpressApplication,
  cookie: string,
): Promise<MeResponse | null> {
  const response = await request(app.getHttpServer()).get('/v1/me').set('Cookie', cookie);
  return response.status === 200 ? meResponseSchema.parse(response.body) : null;
}

/** Cierra la sesión con la cookie, el origen y el código dados. */
export function logout(
  app: NestExpressApplication,
  cookie: string,
  headers: { origin?: string; csrf?: string },
): request.Test {
  let call = request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookie);
  if (headers.origin !== undefined) call = call.set('Origin', headers.origin);
  if (headers.csrf !== undefined) call = call.set('X-CSRF-Token', headers.csrf);
  return call;
}
