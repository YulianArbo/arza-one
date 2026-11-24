import { COOKIE_RETENTION_YEARS, PRIVACY_TERMS, SITE_FORM_RETENTION_YEARS } from '@arza/contracts';

import type { PrivacyIncident, PrivacyRequest } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, businessDeadline, toCalendarDate } from '../../core/index.js';
import {
  auditPrivacy,
  privacySystemActor,
  recordPrivacyChange,
  type PrivacyActor,
} from './privacy-support.js';
import { addRequestEvent } from './request-records.js';
import { closeRequestTask } from './request-steps.js';

// Trabajo diario de Privacidad (B42), a las 7:00 de Colombia: avisa al Oficial las solicitudes y
// los incidentes a dos días hábiles de vencer y el día del vencimiento (decisión 11), cierra por
// desistimiento el reclamo que en dos meses no se completó (decisión 4) y borra las elecciones de
// cookies de más de tres años (decisión 10). Repetirlo el mismo día no cambia nada.

export interface PrivacyDailyDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface PrivacyDailyResult {
  readonly alerts: number;
  readonly desisted: number;
  readonly cookiesPurged: number;
}

function yearsBefore(at: Date, years: number): Date {
  const cutoff = new Date(at);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}

function monthsBefore(at: Date, months: number): Date {
  const cutoff = new Date(at);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

/** Las empresas con plazos abiertos o algo por retener (también los formularios del sitio). */
export async function tenantsWithPrivacyDailyWork(
  database: PrivacyDailyDependencies['database'],
  at: Date,
): Promise<string[]> {
  const cookieCutoff = yearsBefore(at, COOKIE_RETENTION_YEARS);
  const formCutoff = yearsBefore(at, SITE_FORM_RETENTION_YEARS);
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT prv_tenants_with_daily_work(${cookieCutoff}::timestamptz, ${formCutoff}::timestamptz) AS id
    `,
  );
  return rows.map((row) => row.id);
}

type Alert = 'due_soon' | 'due' | null;

/** Qué aviso toca hoy para una fecha límite, si no se dio ya para esa misma fecha. */
async function alertFor(
  tx: TenantTransaction,
  today: string,
  due: Date,
  given: { readonly warnedFor: Date | null; readonly breachedFor: Date | null },
): Promise<Alert> {
  const dueOn = toCalendarDate(due);
  const same = (value: Date | null) => value !== null && toCalendarDate(value) === dueOn;
  if (today >= dueOn) return same(given.breachedFor) ? null : 'due';
  const warnFrom = await businessDeadline(tx, today, PRIVACY_TERMS.warnBusinessDaysBefore);
  return warnFrom >= dueOn && !same(given.warnedFor) ? 'due_soon' : null;
}

async function alertRequest(
  tx: TenantTransaction,
  actor: PrivacyActor,
  row: PrivacyRequest,
): Promise<boolean> {
  if (row.dueOn === null) return false;
  const alert = await alertFor(tx, bogotaToday(actor.at), row.dueOn, row);
  if (alert === null) return false;
  await tx.privacyRequest.update({
    where: { id: row.id },
    data: alert === 'due' ? { breachedFor: row.dueOn } : { warnedFor: row.dueOn },
  });
  await recordPrivacyChange(tx, actor, {
    action: `privacy.request.${alert}`,
    event: alert === 'due' ? 'privacy.request.due' : 'privacy.request.warned',
    entityType: 'prv_request',
    entityId: row.id,
    changes: { code: row.code, due_on: toCalendarDate(row.dueOn) },
    payload: { id: row.id, code: row.code, due_on: toCalendarDate(row.dueOn) },
  });
  return true;
}

async function alertIncident(
  tx: TenantTransaction,
  actor: PrivacyActor,
  row: PrivacyIncident,
): Promise<boolean> {
  const alert = await alertFor(tx, bogotaToday(actor.at), row.sicDueOn, row);
  if (alert === null) return false;
  await tx.privacyIncident.update({
    where: { id: row.id },
    data: alert === 'due' ? { breachedFor: row.sicDueOn } : { warnedFor: row.sicDueOn },
  });
  await recordPrivacyChange(tx, actor, {
    action: `privacy.incident.${alert}`,
    event: alert === 'due' ? 'privacy.incident.due' : 'privacy.incident.warned',
    entityType: 'prv_incident',
    entityId: row.id,
    changes: { code: row.code, sic_due_on: toCalendarDate(row.sicDueOn) },
    payload: { id: row.id, code: row.code, due_on: toCalendarDate(row.sicDueOn) },
  });
  return true;
}

/** Dos meses sin completar el reclamo: se entiende que desistió (Ley 1581, art. 15). */
async function desist(
  tx: TenantTransaction,
  actor: PrivacyActor,
  row: PrivacyRequest,
): Promise<void> {
  const after = await tx.privacyRequest.update({
    where: { id: row.id },
    data: { status: 'closed', closure: 'desisted', closedAt: actor.at },
  });
  await addRequestEvent(tx, actor, after, { kind: 'desisted', note: null, mail: true });
  await auditPrivacy(tx, actor, {
    action: 'privacy.request.desist',
    entityType: 'prv_request',
    entityId: row.id,
    changes: { code: row.code, status: [row.status, 'closed'], closure: 'desisted' },
  });
  await closeRequestTask(tx, actor, after);
}

async function followRequests(tx: TenantTransaction, actor: PrivacyActor) {
  const open = await tx.privacyRequest.findMany({
    where: { status: { in: ['received', 'verifying', 'in_progress'] }, deletedAt: null },
  });
  const desistBefore = monthsBefore(actor.at, PRIVACY_TERMS.desistMonths);
  let alerts = 0;
  let desisted = 0;
  for (const row of open) {
    const waiting = row.requirementSentAt !== null && row.requirementAnsweredAt === null;
    if (waiting && row.requirementSentAt !== null && row.requirementSentAt <= desistBefore) {
      await desist(tx, actor, row);
      desisted += 1;
    } else if (await alertRequest(tx, actor, row)) {
      alerts += 1;
    }
  }
  return { alerts, desisted };
}

async function followIncidents(tx: TenantTransaction, actor: PrivacyActor): Promise<number> {
  const pending = await tx.privacyIncident.findMany({
    where: { status: { in: ['open', 'contained'] }, reportedOn: null, deletedAt: null },
  });
  let alerts = 0;
  for (const row of pending) if (await alertIncident(tx, actor, row)) alerts += 1;
  return alerts;
}

/** Borra las elecciones de cookies vencidas con la función de la base (la aplicación no borra). */
async function purgeCookies(tx: TenantTransaction, actor: PrivacyActor): Promise<number> {
  const cutoff = yearsBefore(actor.at, COOKIE_RETENTION_YEARS);
  const [row] = await tx.$queryRaw<{ removed: number }[]>`
    SELECT prv_purge_cookie_consents(${cutoff}::timestamptz) AS removed
  `;
  const removed = row?.removed ?? 0;
  if (removed > 0) {
    await auditPrivacy(tx, actor, {
      action: 'privacy.cookie_consent.purge',
      entityType: 'prv_cookie_consent',
      entityId: actor.tenantId,
      changes: { removed, before: cutoff.toISOString() },
    });
  }
  return removed;
}

/** El trabajo diario en una empresa. */
export async function runPrivacyDailyIn(
  deps: PrivacyDailyDependencies,
  tenantId: string,
): Promise<PrivacyDailyResult> {
  const actor = privacySystemActor(tenantId, deps.clock.now());
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const requests = await followRequests(tx, actor);
    const incidentAlerts = await followIncidents(tx, actor);
    return {
      alerts: requests.alerts + incidentAlerts,
      desisted: requests.desisted,
      cookiesPurged: await purgeCookies(tx, actor),
    };
  });
}
