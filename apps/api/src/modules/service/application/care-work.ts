import { randomBytes } from 'node:crypto';

import { SURVEY_RULES } from '@arza/contracts';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, companyIdentity, fromCalendarDate } from '../../core/index.js';
import { ackMail, responseMail, surveyMail, surveyUrl, type CareMail } from './care-mail.js';
import { OPEN_STATUSES, pqrsfAudit, pqrsfPayload } from './pqrsf-records.js';
import { recordServiceAudit, recordServiceChange, type ServiceActor } from './service-support.js';
import { surveyTokenHash } from './survey-public.js';

// Trabajo de las PQRSF y las encuestas en el worker (B29). Cada 30 segundos, en cada empresa con
// trabajo: el acuse y la respuesta de las PQRSF, la invitación a la encuesta (crea el enlace al
// enviarla: la llave nunca se guarda) y los avisos de «por vencer» (faltan dos días hábiles) y de
// plazo vencido. Repetirlo no cambia nada: solo toma lo pendiente. Si el correo no responde, queda
// para la pasada siguiente.

export interface CareWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly mailer: { send(message: CareMail): Promise<void> };
  /** Dirección de la aplicación (APP_URL): los enlaces van a su mismo dominio. */
  readonly appUrl: string;
}

export interface CareWorkResult {
  readonly emails: number;
  readonly warned: number;
  readonly breached: number;
}

const BATCH = 25;
const OPEN = { in: [...OPEN_STATUSES] };

function systemActor(tenantId: string, at: Date): ServiceActor {
  return { tenantId, userId: null, meta: null, at };
}

function scopeOf(tenantId: string) {
  return { tenantId, userId: null };
}

/** Correo de una PQRSF: se arma, se envía y después se marca, solo si sigue pendiente. */
async function sendPqrsfMail(deps: CareWorkDependencies, tenantId: string, id: string) {
  const prepared = await deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const pqrsf = await tx.svcPqrsf.findFirst({ where: { id, mailPending: { not: null } } });
    if (pqrsf === null) return null;
    const company = await companyIdentity(tx);
    const kind = pqrsf.mailPending === 'ack' ? 'ack' : 'response';
    const mail =
      kind === 'ack' ? ackMail(pqrsf, company, deps.appUrl) : responseMail(pqrsf, company);
    return { kind, mail };
  });
  if (prepared === null) return false;
  await deps.mailer.send(prepared.mail);
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const at = deps.clock.now();
    const sentField = prepared.kind === 'ack' ? { ackSentAt: at } : { responseSentAt: at };
    const { count } = await tx.svcPqrsf.updateMany({
      where: { id, mailPending: prepared.kind },
      data: { mailPending: null, ...sentField },
    });
    if (count === 0) return false;
    const pqrsf = await tx.svcPqrsf.findUniqueOrThrow({ where: { id } });
    await recordServiceChange(tx, systemActor(tenantId, at), {
      action: 'service.pqrsf.mail',
      event: `service.pqrsf.${prepared.kind === 'ack' ? 'acknowledged' : 'delivered'}`,
      entityType: 'svc_pqrsf',
      entityId: id,
      changes: { ...pqrsfAudit(pqrsf), mail: prepared.kind },
      payload: pqrsfPayload(pqrsf),
    });
    return true;
  });
}

/** Crea el enlace de la encuesta y su correo; null si ya no está pendiente. */
async function prepareSurveyMail(
  tx: TenantTransaction,
  deps: CareWorkDependencies,
  id: string,
): Promise<CareMail | null> {
  const invitation = await tx.svcSurveyResponse.findFirst({
    where: { id, mailPending: true, supersededAt: null, deletedAt: null },
  });
  const email = invitation?.recipientEmail ?? null;
  if (invitation === null || email === null) return null;
  const ticket = await tx.svcTicket.findUniqueOrThrow({ where: { id: invitation.entityId } });
  const token = randomBytes(32).toString('base64url');
  const at = deps.clock.now();
  await tx.svcSurveyResponse.update({
    where: { id },
    data: {
      tokenHash: surveyTokenHash(token),
      sentAt: at,
      expiresAt: new Date(at.getTime() + SURVEY_RULES.linkDays * 86_400_000),
    },
  });
  await recordServiceChange(tx, systemActor(invitation.tenantId, at), {
    action: 'service.survey.link.issue',
    event: 'service.survey.sent',
    entityType: 'svc_survey_response',
    entityId: id,
    changes: { ticket_code: ticket.code },
    payload: { ticket_id: ticket.id, ticket_code: ticket.code },
  });
  const company = await companyIdentity(tx);
  return surveyMail(email, ticket, company, surveyUrl(deps.appUrl, token));
}

/** Correo de la encuesta: si falla después de crear el enlace, la pasada siguiente crea otro. */
async function sendSurveyMail(deps: CareWorkDependencies, tenantId: string, id: string) {
  const mail = await deps.database.withTenant(scopeOf(tenantId), (tx) =>
    prepareSurveyMail(tx, deps, id),
  );
  if (mail === null) return false;
  await deps.mailer.send(mail);
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const { count } = await tx.svcSurveyResponse.updateMany({
      where: { id, mailPending: true },
      data: { mailPending: false },
    });
    if (count === 0) return false;
    await recordServiceAudit(tx, systemActor(tenantId, deps.clock.now()), {
      action: 'service.survey.mail',
      entityType: 'svc_survey_response',
      entityId: id,
      changes: { mail: 'invitation' },
    });
    return true;
  });
}

type Mark = 'warned' | 'breached';

/** «Por vencer» cuando faltan dos días hábiles; «vencida» al pasar la fecha límite. */
async function markPqrsf(tx: TenantTransaction, actor: ServiceActor, id: string, mark: Mark) {
  const today = fromCalendarDate(bogotaToday(actor.at));
  const due =
    mark === 'warned'
      ? { warnedAt: null, warnOn: { lte: today } }
      : { breachedAt: null, dueOn: { lt: today } };
  const { count } = await tx.svcPqrsf.updateMany({
    where: { id, status: OPEN, deletedAt: null, ...due },
    data: mark === 'warned' ? { warnedAt: actor.at } : { breachedAt: actor.at, warnedAt: actor.at },
  });
  if (count === 0) return false;
  const pqrsf = await tx.svcPqrsf.findUniqueOrThrow({ where: { id } });
  await recordServiceChange(tx, actor, {
    action: mark === 'warned' ? 'service.pqrsf.warn' : 'service.pqrsf.breach',
    event: `service.pqrsf.${mark}`,
    entityType: 'svc_pqrsf',
    entityId: id,
    changes: pqrsfAudit(pqrsf),
    payload: pqrsfPayload(pqrsf),
  });
  return true;
}

async function pendingIds(deps: CareWorkDependencies, tenantId: string, now: Date) {
  const today = fromCalendarDate(bogotaToday(now));
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
    const pqrsf = (where: object) =>
      tx.svcPqrsf.findMany({
        where: { deletedAt: null, ...where },
        select: { id: true },
        take: BATCH,
      });
    return {
      mails: ids(await pqrsf({ mailPending: { not: null } })),
      surveys: ids(
        await tx.svcSurveyResponse.findMany({
          where: { mailPending: true, deletedAt: null },
          select: { id: true },
          take: BATCH,
        }),
      ),
      breach: ids(await pqrsf({ status: OPEN, breachedAt: null, dueOn: { lt: today } })),
      warn: ids(await pqrsf({ status: OPEN, warnedAt: null, warnOn: { lte: today } })),
    };
  });
}

async function countDone(list: readonly string[], work: (id: string) => Promise<boolean>) {
  let done = 0;
  for (const id of list) if (await work(id)) done += 1;
  return done;
}

async function workTenant(
  deps: CareWorkDependencies,
  tenantId: string,
  now: Date,
): Promise<CareWorkResult> {
  const ids = await pendingIds(deps, tenantId, now);
  const actor = systemActor(tenantId, now);
  const mark = (id: string, kind: Mark) =>
    deps.database.withTenant(scopeOf(tenantId), (tx) => markPqrsf(tx, actor, id, kind));
  const pqrsfMails = await countDone(ids.mails, (id) => sendPqrsfMail(deps, tenantId, id));
  const surveyMails = await countDone(ids.surveys, (id) => sendSurveyMail(deps, tenantId, id));
  // Primero la vencida: si ya pasó la fecha, avisa una vez como vencida, no dos.
  const breached = await countDone(ids.breach, (id) => mark(id, 'breached'));
  const warned = await countDone(ids.warn, (id) => mark(id, 'warned'));
  return { emails: pqrsfMails + surveyMails, warned, breached };
}

/** Las empresas con correos por enviar o con PQRSF que llegaron a un aviso de plazo. */
export async function tenantsWithCareWork(
  deps: Pick<CareWorkDependencies, 'database'>,
  now: Date,
): Promise<string[]> {
  const today = bogotaToday(now);
  const rows = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT svc_tenants_with_care_work(${today}::date) AS id`,
  );
  return rows.map((row) => row.id);
}

/** Revisa las PQRSF y las encuestas de las empresas dadas. */
export async function followCustomerCareIn(
  deps: CareWorkDependencies,
  tenantIds: readonly string[],
): Promise<CareWorkResult> {
  const now = deps.clock.now();
  const total = { emails: 0, warned: 0, breached: 0 };
  for (const id of tenantIds) {
    const result = await workTenant(deps, id, now);
    total.emails += result.emails;
    total.warned += result.warned;
    total.breached += result.breached;
  }
  return total;
}

/** Revisa las PQRSF y las encuestas de todas las empresas con trabajo. */
export async function followCustomerCare(deps: CareWorkDependencies): Promise<CareWorkResult> {
  return followCustomerCareIn(deps, await tenantsWithCareWork(deps, deps.clock.now()));
}
