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
import type { Clock } from '../../../../src/platform/clock/clock.js';
import type { DatabaseService } from '../../../../src/platform/database/database.service.js';
import type { TenantTransaction } from '../../../../src/platform/database/tenant-context.js';
import {
  JOBS,
  QUEUES,
  type AccountEmailJob,
  type AccountEmailPurpose,
} from '../../../../src/platform/queues/jobs.js';
import { createTestApp } from '../../../support/test-app.js';
import { integrationDatabase } from '../../support/integration-database.js';

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
export function iamValkeyUrl(): string {
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
}

/** Crea una cuenta directamente en la base, dentro de su empresa. */
export async function createUser(database: DatabaseService, user: NewUser): Promise<string> {
  const status = user.status ?? 'active';
  const passwordHash =
    status === 'invited' ? null : await hashPassword(user.password ?? GOOD_PASSWORD);
  const created = await database.withTenant({ tenantId: user.tenantId, userId: null }, (tx) =>
    tx.user.create({
      data: {
        tenantId: user.tenantId,
        email: user.email,
        kind: user.kind ?? 'internal',
        status,
        passwordHash,
        displayName: 'Persona de prueba',
      },
    }),
  );
  return created.id;
}

export interface SignedIn {
  readonly token: string;
  readonly cookie: string;
  readonly session: SessionResponse;
}

/** Inicia sesión por la API y devuelve la cookie y el código antifalsificación. */
export async function signIn(
  app: NestExpressApplication,
  email: string,
  password = GOOD_PASSWORD,
): Promise<SignedIn> {
  const response = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .send({ email, password });
  if (response.status !== 200) {
    throw new Error(`El inicio de sesión respondió ${String(response.status)}: ${response.text}`);
  }
  const token = sessionCookieValue(response.headers['set-cookie']);
  if (token === null) throw new Error('El inicio de sesión no entregó la cookie de sesión.');
  return {
    token,
    cookie: `${SESSION_COOKIE}=${token}`,
    session: sessionResponseSchema.parse(response.body),
  };
}

export function sessionCookieValue(header: string | string[] | undefined): string | null {
  const cookies = Array.isArray(header) ? header : header === undefined ? [] : [header];
  const cookie = cookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  if (cookie === undefined) return null;
  const value = cookie.slice(SESSION_COOKIE.length + 1).split(';')[0] ?? '';
  return value === '' ? null : value;
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
