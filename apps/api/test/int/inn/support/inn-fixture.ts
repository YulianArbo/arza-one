import { innCodeResponseSchema, innCreatedResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import { addDays, bogotaToday, seedCore } from '../../../../src/modules/core/index.js';
import { seedDocForms } from '../../../../src/modules/doc/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import { freshIp, WEB_ORIGIN } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';

// Personas y registros de prueba de Innovación (B40): Calidad administra, la Dirección evalúa y
// aprueba, el Líder técnico lee y vigila, el Auditor lee y un colaborador solo propone ideas.

export interface InnStaff {
  readonly quality: Person;
  readonly director: Person;
  readonly tech: Person;
  readonly auditor: Person;
  readonly worker: Person;
}

export async function innFixture(s: AccessScenario, label: string): Promise<InnStaff> {
  // Catálogos de la empresa y el formato FT-INN-003 publicado, como en la carga inicial.
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
  await seedDocForms(apiDatabase(), [s.tenant.id], systemClock);
  const tag = `${label}-${uuidv7().slice(-6)}`;
  const [quality, director, tech, auditor, worker] = await Promise.all([
    s.person(`${tag}-calidad`, ['CALIDAD']),
    s.person(`${tag}-direccion`, ['DIRECCION']),
    s.person(`${tag}-tecnico`, ['LIDER_TECNICO']),
    s.person(`${tag}-auditor`, ['AUDITOR']),
    s.person(`${tag}-colaborador`, ['COLABORADOR']),
  ]);
  return { quality, director, tech, auditor, worker };
}

export function later(s: AccessScenario, days: number): string {
  return addDays(bogotaToday(s.clock.now()), days);
}

export function created(response: request.Response): string {
  if (response.status !== 201) throw new Error(response.text);
  return innCreatedResponseSchema.parse(response.body).id;
}

export function coded(response: request.Response): { id: string; code: string } {
  if (response.status !== 201) throw new Error(response.text);
  return innCodeResponseSchema.parse(response.body);
}

/** POST con If-Match. */
export function at(
  s: AccessScenario,
  path: string,
  person: Person,
  version: number,
  body: object = {},
): request.Test {
  return s.post(path, person.session, body).set('If-Match', `"${String(version)}"`);
}

export function remove(s: AccessScenario, path: string, person: Person): request.Test {
  return request(s.app.getHttpServer())
    .delete(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token);
}

export const IDEA = {
  title: 'Asistente de conciliación bancaria',
  description: 'Conciliar automáticamente los extractos con los pagos registrados.',
  expected_benefit: 'Menos horas de trabajo manual al cierre.',
};

export const VIABILITY = {
  scores: { market: 4, technical: 4, strategic: 5, cost_benefit: 3, risk: 4 },
  concept: 'viable',
  observations: 'Conviene un piloto con un cliente.',
};

export async function proposed(s: AccessScenario, person: Person): Promise<string> {
  return coded(await s.post('/v1/innovation/ideas', person.session, IDEA)).id;
}

/** Inscrita por el colaborador, evaluada por la Dirección (versión 3). */
export async function evaluated(s: AccessScenario, f: InnStaff): Promise<string> {
  const id = await proposed(s, f.worker);
  const base = `/v1/innovation/ideas/${id}`;
  for (const [step, version, body] of [
    ['evaluation', 1, {}],
    ['viability', 2, VIABILITY],
  ] as const) {
    const response = await at(s, `${base}/${step}`, f.director, version, body);
    if (response.status !== 204) throw new Error(response.text);
  }
  return id;
}

export function trademark(
  s: AccessScenario,
  responsibleId: string,
  expiresIn: number,
): Record<string, unknown> {
  return {
    kind: 'trademark',
    title: `Marca de prueba ${uuidv7().slice(-6)}`,
    holder: 'Empresa de prueba S.A.S.',
    registry_number: `SD-${uuidv7().slice(-6)}`,
    nice_classes: '9, 42',
    filed_on: later(s, -3000),
    granted_on: later(s, -2900),
    expires_on: later(s, expiresIn),
    status: 'registered',
    responsible_id: responsibleId,
  };
}

export function software(responsibleId: string): Record<string, unknown> {
  return {
    kind: 'software',
    title: `Software de prueba ${uuidv7().slice(-6)}`,
    holder: 'Empresa de prueba S.A.S.',
    status: 'proposed',
    responsible_id: responsibleId,
    product: 'Producto de prueba',
    version_label: '1.0.0',
  };
}
