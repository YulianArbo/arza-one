import {
  auditDetailResponseSchema,
  managementReviewSchema,
  type AuditDetailResponse,
  type ManagementReview,
} from '@arza/contracts';
import request from 'supertest';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { freshIp, WEB_ORIGIN } from '../../iam/support/iam-fixtures.js';
import { at, coded, created, later, processId, today, type QualityStaff } from './qms-fixture.js';

// Registros de prueba de auditorías, indicadores y revisión por la dirección (B39).

let nextYear = 2030;

/** Un programa de un año que no choca con los de otras pruebas de la misma empresa. */
export function programBody(): {
  year: number;
  objectives: string;
  scope: string;
  criteria: string;
} {
  nextYear += 1;
  return {
    year: nextYear,
    objectives: 'Verificar la eficacia del sistema de gestión de calidad.',
    scope: 'Todos los procesos de la sede principal.',
    criteria: 'ISO 9001:2015 y documentos del SGC.',
  };
}

export async function program(s: AccessScenario, f: QualityStaff): Promise<string> {
  return created(await s.post('/v1/qms/audit-programs', f.quality.session, programBody()));
}

/** El cargo de la persona queda en el proceso dado: así ese es «su proceso». */
export async function placeIn(s: AccessScenario, person: Person, process: string): Promise<void> {
  await s.inTenant(async (tx) => {
    const position = await tx.position.findFirst({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    if (position === null) throw new Error('La empresa de prueba no tiene cargos.');
    const moved = await tx.position.create({
      data: {
        tenantId: position.tenantId,
        name: `Cargo de prueba ${person.id.slice(-6)}`,
        orgUnitId: process,
      },
    });
    await tx.user.update({ where: { id: person.id }, data: { positionId: moved.id } });
  });
}

export function planBody(
  programId: string,
  process: string,
  auditorId: string,
  plannedOn: string,
): Record<string, unknown> {
  return {
    program_id: programId,
    process_id: process,
    auditor_id: auditorId,
    planned_on: plannedOn,
    objective: 'Verificar el tratamiento de las salidas no conformes.',
    criteria: 'ISO 9001:2015 numeral 8.7',
  };
}

/** Una auditoría programada al colaborador sobre el proceso 0. */
export async function plannedAudit(
  s: AccessScenario,
  f: QualityStaff,
  auditor: Person = f.worker,
): Promise<{ readonly id: string; readonly code: string }> {
  const body = planBody(await program(s, f), await processId(s, 0), auditor.id, today(s));
  return coded(await s.post('/v1/qms/audits', f.quality.session, body));
}

export async function auditDetail(
  s: AccessScenario,
  person: Person,
  id: string,
): Promise<AuditDetailResponse> {
  const response = await s.get(`/v1/qms/audits/${id}`, person.session);
  if (response.status !== 200) throw new Error(response.text);
  return auditDetailResponseSchema.parse(response.body);
}

export function started(s: AccessScenario, person: Person, id: string): request.Test {
  return at(s, `/v1/qms/audits/${id}/actions/start`, person, 1, { started_on: today(s) });
}

/** PUT con sesión, CSRF e If-Match (la lista de chequeo). */
export function put(
  s: AccessScenario,
  path: string,
  person: Person,
  version: number,
  body: object,
): request.Test {
  return request(s.app.getHttpServer())
    .put(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token)
    .set('If-Match', `"${String(version)}"`)
    .send(body);
}

export const FINDING = {
  type: 'minor',
  requirement: 'ISO 9001 8.7.2',
  description: 'Las salidas no conformes no tienen registro de su tratamiento.',
  evidence: 'Revisión de 5 casos de octubre.',
};

export function reportBody(s: AccessScenario): { reported_on: string; conclusions: string } {
  return { reported_on: today(s), conclusions: 'El proceso es conforme con una excepción menor.' };
}

/** Programada → iniciada → con un hallazgo de cada tipo dado → informe emitido. */
export async function reportedAudit(
  s: AccessScenario,
  f: QualityStaff,
  types: readonly string[] = ['minor', 'opportunity'],
): Promise<{ readonly id: string; readonly code: string }> {
  const audit = await plannedAudit(s, f);
  if ((await started(s, f.worker, audit.id)).status !== 204) throw new Error('No inició');
  for (const type of types) {
    const response = await s.post(`/v1/qms/audits/${audit.id}/findings`, f.worker.session, {
      ...FINDING,
      type,
    });
    created(response);
  }
  const report = await at(
    s,
    `/v1/qms/audits/${audit.id}/actions/report`,
    f.worker,
    2,
    reportBody(s),
  );
  if (report.status !== 204) throw new Error(report.text);
  return audit;
}

export async function indicatorBody(
  s: AccessScenario,
  responsible: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return {
    process_id: await processId(s, 0),
    name: 'Satisfacción con las capacitaciones',
    objective: 'Que el personal valore bien la formación recibida.',
    formula: 'Promedio de la encuesta de capacitación',
    unit: 'score',
    target: '4',
    direction: 'higher_better',
    frequency: 'monthly',
    source: 'manual',
    responsible_id: responsible,
    ...overrides,
  };
}

export function measurementBody(periodStart: string, value: string): Record<string, unknown> {
  return {
    period_start: periodStart,
    value,
    analysis: 'El resultado se explica por la nueva metodología.',
    evidence_note: 'Encuesta del mes en la carpeta de Talento humano.',
  };
}

/** El primer día del mes, n meses atrás. */
export function monthStart(s: AccessScenario, monthsBack: number): string {
  const [year, month] = today(s).split('-').map(Number) as [number, number];
  const total = year * 12 + (month - 1) - monthsBack;
  return `${String(Math.floor(total / 12))}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

export function reviewBody(s: AccessScenario): Record<string, string> {
  return {
    period_from: monthStart(s, 11),
    period_to: today(s),
    meeting_on: later(s, 1),
    attendees: 'Dirección, Calidad y líderes de proceso',
  };
}

export async function reviewOf(
  s: AccessScenario,
  person: Person,
  id: string,
): Promise<ManagementReview> {
  const response = await s.get(`/v1/qms/management-reviews/${id}`, person.session);
  if (response.status !== 200) throw new Error(response.text);
  return managementReviewSchema.parse(response.body);
}
