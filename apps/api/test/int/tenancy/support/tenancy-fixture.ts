import { platformTenantListResponseSchema, type PlatformTenant } from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { Prisma } from '../../../../src/generated/prisma/client.js';
import { seedAccessControl } from '../../../../src/modules/iam/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { OPERATOR_TENANT_ID } from '../../../../src/platform/database/operator-tenant.js';
import { PLATFORM_TENANT } from '../../../../src/platform/database/seed/seed-data.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { apiDatabase, preparationDatabase } from '../../support/integration-database.js';

// Ayudas de las pruebas de multiempresa (B48). La empresa operadora tiene un identificador fijo
// (la de ARZA TECH); varias pruebas pueden crearla a la vez, así que se crea solo si falta.

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

let operatorReady: Promise<void> | undefined;

async function createOperatorTenant(): Promise<void> {
  const context = { tenantId: OPERATOR_TENANT_ID, userId: null };
  await preparationDatabase()
    .withTenant(context, async (tx) => {
      const existing = await tx.tenant.findUnique({ where: { id: OPERATOR_TENANT_ID } });
      if (existing !== null) return;
      const { id, legalName, tradeName, taxId } = PLATFORM_TENANT;
      await tx.tenant.create({ data: { id, legalName, tradeName, taxId } });
    })
    .catch((error: unknown) => {
      if (!isUniqueViolation(error)) throw error;
    });
  await seedAccessControl(apiDatabase(), [OPERATOR_TENANT_ID], systemClock);
}

/** La empresa operadora, con sus roles, una sola vez por archivo de pruebas. */
export function ensureOperatorTenant(): Promise<void> {
  operatorReady ??= createOperatorTenant();
  return operatorReady;
}

/** Operador de la plataforma con sesión completa (identidad recién confirmada). */
export async function operator(s: AccessScenario, label = 'operador'): Promise<Person> {
  await ensureOperatorTenant();
  return s.person(label, ['OPERADOR_PLATAFORMA'], { tenantId: OPERATOR_TENANT_ID });
}

function withSession(call: request.Test, session: SignedIn, version?: number): request.Test {
  const ready = call
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', session.cookie)
    .set('X-CSRF-Token', session.session.csrf_token);
  return version === undefined ? ready : ready.set('If-Match', `"${String(version)}"`);
}

export function sendAs(
  s: AccessScenario,
  method: 'post' | 'put' | 'delete',
  path: string,
  session: SignedIn,
  options: { readonly body?: object; readonly version?: number } = {},
): request.Test {
  const call = withSession(request(s.app.getHttpServer())[method](path), session, options.version);
  return options.body === undefined ? call : call.send(options.body);
}

export async function tenantCards(s: AccessScenario, person: Person): Promise<PlatformTenant[]> {
  const response = await s.get('/v1/platform/tenants', person.session);
  expect(response.status, response.text).toBe(200);
  return platformTenantListResponseSchema.parse(response.body).data;
}

export async function card(
  s: AccessScenario,
  person: Person,
  tenantId: string,
): Promise<PlatformTenant> {
  const found = (await tenantCards(s, person)).find((entry) => entry.id === tenantId);
  if (found === undefined) throw new Error(`La empresa ${tenantId} no aparece en la lista.`);
  return found;
}

/** NIT válido (con su dígito de verificación) distinto en cada llamada. */
export function freshNit(): string {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const number = String(800_000_000 + Math.floor(Math.random() * 99_999_999));
  const sum = Array.from(number, Number)
    .reverse()
    .reduce((total, digit, index) => total + digit * (weights[index] ?? 0), 0);
  const remainder = sum % 11;
  return `${number}-${String(remainder > 1 ? 11 - remainder : remainder)}`;
}

/** Acciones de auditoría de la empresa, de lo más reciente a lo más antiguo. */
export async function actionsIn(s: AccessScenario, tenantId: string): Promise<string[]> {
  const events = await s.db.withTenant({ tenantId, userId: null }, (tx) =>
    tx.auditEvent.findMany({ select: { action: true }, orderBy: { seq: 'desc' }, take: 500 }),
  );
  return events.map((event) => event.action);
}
