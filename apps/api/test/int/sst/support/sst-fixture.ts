import {
  quickReportResponseSchema,
  sstCreatedResponseSchema,
  type InspectionKind,
} from '@arza/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import {
  activeCatalogOptions,
  activeProcesses,
  bogotaToday,
} from '../../../../src/modules/core/index.js';
import { INSPECTION_CATALOGS } from '@arza/contracts';
import { freshIp, WEB_ORIGIN } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { staffFixture, type Staff } from '../../hr/support/people-fixture.js';

// Personas y registros de prueba de SST (B37): las del B36 (Talento humano, jefe, colaborador y
// compañero, todos activos) y una persona con el rol SST.

export interface SstStaff extends Staff {
  readonly sst: Person;
}

export async function sstFixture(scenario: AccessScenario, label: string): Promise<SstStaff> {
  const staff = await staffFixture(scenario, `${label}-${uuidv7().slice(-6)}`);
  const sst = await scenario.person(`${label}-sst-${uuidv7().slice(-6)}`, ['SST', 'COLABORADOR']);
  return { ...staff, sst };
}

export function today(scenario: AccessScenario): string {
  return bogotaToday(scenario.clock.now());
}

export function created(response: request.Response): string {
  return sstCreatedResponseSchema.parse(response.body).id;
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

export function put(
  s: AccessScenario,
  path: string,
  person: Person,
  body: object,
  version?: number,
): request.Test {
  const call = request(s.app.getHttpServer())
    .put(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token);
  return (version === undefined ? call : call.set('If-Match', `"${String(version)}"`)).send(body);
}

export async function processId(s: AccessScenario): Promise<string> {
  const processes = await s.inTenant((tx) => activeProcesses(tx));
  const first = processes[0];
  if (first === undefined) throw new Error('La empresa de prueba no tiene procesos.');
  return first.id;
}

export function hazardBody(process: string, review: string): Record<string, unknown> {
  return {
    process_id: process,
    activity: 'Trabajo en computador',
    hazard_class: 'biomechanical',
    hazard: 'Postura prolongada sentado',
    effects: 'Dolor lumbar y cervical',
    deficiency: 6,
    exposure: 4,
    consequence: 25,
    review_on: review,
  };
}

/** Reporte desde el celular; devuelve el identificador. */
export async function quickReport(
  s: AccessScenario,
  person: Person,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await s
    .post('/v1/sst/me/reports', person.session, body)
    .set('Idempotency-Key', uuidv7());
  if (response.status !== 201) throw new Error(response.text);
  return quickReportResponseSchema.parse(response.body).id;
}

export const ACCIDENT = {
  kind: 'accident',
  description: 'Se resbaló en la escalera y se golpeó la rodilla.',
  location: 'Escalera del piso 2',
  affected: 'self',
} as const;

/** Un incidente investigado con su plan; devuelve el incidente y su acción. */
export async function plannedIncident(
  s: AccessScenario,
  f: SstStaff,
): Promise<{ readonly id: string; readonly actionId: string }> {
  const id = await quickReport(s, f.worker, {
    kind: 'incident',
    description: 'Casi se cae un monitor mal asegurado.',
    location: 'Oficina',
  });
  await at(s, `/v1/sst/incidents/${id}/actions/investigate`, f.sst, 1, { team: 'SST y jefe' });
  const plan = {
    immediate_causes: 'Soporte del monitor suelto.',
    root_causes: 'No hay revisión periódica de soportes.',
    actions: [{ description: 'Ajustar soportes', responsible_id: f.worker.id, due_on: today(s) }],
  };
  await at(s, `/v1/sst/incidents/${id}/actions/plan`, f.sst, 2, plan);
  const action = await s.inTenant((tx) =>
    tx.sstInvestigationAction.findFirstOrThrow({
      where: { investigation: { incidentId: id } },
    }),
  );
  return { id, actionId: action.id };
}

/** Respuestas «cumple» para cada punto de la lista de chequeo del tipo. */
export async function answersFor(
  s: AccessScenario,
  kind: InspectionKind,
): Promise<{ code: string; result: 'ok' | 'fail'; note: null }[]> {
  const items = await s.inTenant((tx) => activeCatalogOptions(tx, INSPECTION_CATALOGS[kind]));
  return items.map((item, index) => ({
    code: item.code,
    result: index === 0 ? 'fail' : 'ok',
    note: null,
  }));
}

/** Pide la autoinspección del puesto en casa del colaborador. */
export async function homeRequest(s: AccessScenario, f: SstStaff): Promise<string> {
  const body = { employee_id: f.workerEmployeeId, due_on: today(s) };
  return created(await s.post('/v1/sst/inspections/home-requests', f.sst.session, body));
}

export async function examFor(
  s: AccessScenario,
  f: SstStaff,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const body = {
    employee_id: f.workerEmployeeId,
    kind: 'periodic',
    exam_date: today(s),
    provider: 'IPS de prueba',
    concept: 'fit_with_restrictions',
    restrictions: 'Evitar levantar más de 10 kilos.',
    ...extra,
  };
  const response = await s
    .post('/v1/sst/medical-exams', f.sst.session, body)
    .set('Idempotency-Key', uuidv7());
  if (response.status !== 201) throw new Error(response.text);
  return created(response);
}

export async function ppeFor(s: AccessScenario, f: SstStaff): Promise<string> {
  const body = { employee_id: f.workerEmployeeId, item: 'REPOSAPIES', delivered_on: today(s) };
  return created(
    await s.post('/v1/sst/ppe-deliveries', f.sst.session, body).set('Idempotency-Key', uuidv7()),
  );
}

export async function addMember(
  s: AccessScenario,
  f: SstStaff,
  committee: 'copasst' | 'coexistence',
  person: Person,
): Promise<string> {
  const body = { committee, user_id: person.id, represents: 'workers', from_on: today(s) };
  return created(await s.post('/v1/sst/committee-members', f.sst.session, body));
}

export async function fileComplaint(s: AccessScenario, person: Person): Promise<string> {
  const body = { facts: 'Mi compañero me grita en las reuniones delante del equipo.' };
  const response = await s
    .post('/v1/sst/complaints', person.session, body)
    .set('Idempotency-Key', uuidv7());
  if (response.status !== 201) throw new Error(response.text);
  return sstCreatedResponseSchema.parse(response.body).id;
}
