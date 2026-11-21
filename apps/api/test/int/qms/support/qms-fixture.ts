import {
  nonconformityDetailResponseSchema,
  qmsCodeResponseSchema,
  qmsCreatedResponseSchema,
  type NonconformityDetailResponse,
} from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import {
  activeProcesses,
  addDays,
  bogotaToday,
  seedCore,
} from '../../../../src/modules/core/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';

// Personas y registros de prueba de Calidad (B38): dos personas de Calidad (una registra y otra
// verifica), la Dirección, el Auditor y un colaborador que reporta y responde por acciones.

export interface QualityStaff {
  readonly quality: Person;
  readonly verifier: Person;
  readonly director: Person;
  readonly auditor: Person;
  readonly worker: Person;
}

export async function qualityFixture(s: AccessScenario, label: string): Promise<QualityStaff> {
  // Procesos, listas y festivos de la empresa, como en la carga inicial (idempotente).
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
  const tag = `${label}-${uuidv7().slice(-6)}`;
  const [quality, verifier, director, auditor, worker] = await Promise.all([
    s.person(`${tag}-calidad`, ['CALIDAD']),
    s.person(`${tag}-verifica`, ['CALIDAD']),
    s.person(`${tag}-direccion`, ['DIRECCION']),
    s.person(`${tag}-auditor`, ['AUDITOR']),
    s.person(`${tag}-colaborador`, ['COLABORADOR']),
  ]);
  return { quality, verifier, director, auditor, worker };
}

export function today(s: AccessScenario): string {
  return bogotaToday(s.clock.now());
}

export function later(s: AccessScenario, days: number): string {
  return addDays(today(s), days);
}

export function created(response: request.Response): string {
  if (response.status !== 201) throw new Error(response.text);
  return qmsCreatedResponseSchema.parse(response.body).id;
}

export function coded(response: request.Response): { id: string; code: string } {
  if (response.status !== 201) throw new Error(response.text);
  return qmsCodeResponseSchema.parse(response.body);
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

export async function processId(s: AccessScenario, index = 0): Promise<string> {
  const processes = await s.inTenant((tx) => activeProcesses(tx));
  const found = processes[index];
  if (found === undefined) throw new Error('La empresa de prueba no tiene procesos.');
  return found.id;
}

export async function detail(
  s: AccessScenario,
  person: Person,
  id: string,
): Promise<NonconformityDetailResponse> {
  const response = await s.get(`/v1/qms/nonconformities/${id}`, person.session);
  if (response.status !== 200) throw new Error(response.text);
  return nonconformityDetailResponseSchema.parse(response.body);
}

export async function reported(s: AccessScenario, person: Person): Promise<string> {
  const body = { description: 'El informe mensual salió sin revisión.', detected_on: today(s) };
  return coded(await s.post('/v1/qms/nonconformities', person.session, body)).id;
}

export const ANALYSIS = {
  analysis: { method: 'five_whys', whys: ['No se revisó', 'No había quién revisara'] },
  root_cause: 'El procedimiento no asigna quién revisa el informe.',
};

/** Detectada → contenida → en análisis; devuelve la versión. */
export async function analyzed(s: AccessScenario, f: QualityStaff, id: string): Promise<number> {
  const contain = {
    classification: 'minor',
    process_id: await processId(s),
    containment: 'Se retiró el informe y se envió una versión revisada.',
    contained_on: today(s),
  };
  const base = `/v1/qms/nonconformities/${id}/actions`;
  for (const [step, version, body] of [
    ['contain', 1, contain],
    ['analyze', 2, ANALYSIS],
  ] as const) {
    const response = await at(s, `${base}/${step}`, f.quality, version, body);
    if (response.status !== 204) throw new Error(response.text);
  }
  return 3;
}

export interface ActionBody {
  readonly origin_type: string;
  readonly origin_id: string | null;
  readonly description: string;
  readonly responsible_id: string;
  readonly due_on: string;
}

export function actionBody(
  origin: { type: string; id: string | null },
  responsible: string,
  due: string,
): ActionBody {
  return {
    origin_type: origin.type,
    origin_id: origin.id,
    description: 'Asignar en el procedimiento quién revisa el informe mensual.',
    responsible_id: responsible,
    due_on: due,
  };
}

/** Una no conformidad con plan y una acción a cargo del colaborador. */
export async function plannedNonconformity(
  s: AccessScenario,
  f: QualityStaff,
): Promise<{ readonly id: string; readonly actionId: string }> {
  const id = await reported(s, f.worker);
  const version = await analyzed(s, f, id);
  const body = actionBody({ type: 'nonconformity', id }, f.worker.id, later(s, 10));
  const actionId = coded(await s.post('/v1/qms/actions', f.quality.session, body)).id;
  const plan = await at(s, `/v1/qms/nonconformities/${id}/actions/plan`, f.quality, version);
  if (plan.status !== 204) throw new Error(plan.text);
  return { id, actionId };
}

export const EXECUTION = {
  evidence_note: 'Se actualizó el procedimiento y se socializó con el equipo.',
};

export function executed(s: AccessScenario, person: Person, actionId: string): request.Test {
  const body = { ...EXECUTION, executed_on: today(s) };
  return at(s, `/v1/qms/actions/${actionId}/actions/execute`, person, 1, body);
}

export function verification(
  s: AccessScenario,
  effective: boolean,
): { effective: boolean; verified_on: string; note: string } {
  return { effective, verified_on: today(s), note: 'Se revisaron los dos últimos informes.' };
}
