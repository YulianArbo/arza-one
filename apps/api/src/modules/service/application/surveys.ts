import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_SURVEY,
  npsOf,
  SURVEY_RULES,
  surveyTriggerSchema,
  type Survey,
  type SurveyListResponse,
  type SurveyResults,
  type SurveyResultsQuery,
  type TicketSurvey,
  type UpdateSurveyRequest,
} from '@arza/contracts';

import type { SvcSurvey, SvcSurveyResponse, SvcTicket } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addDays, bogotaToday } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { commercialParties } from '../../party/index.js';
import {
  recordServiceChange,
  serviceActorOf,
  serviceNotFound,
  type ServiceActor,
  type ServiceTarget,
} from './service-support.js';

// Encuestas de satisfacción y NPS (B29, ficha 17.9, FT-SAC-003). Al resolver un tiquete se crea la
// invitación a la encuesta de quien lo pidió (decisión 8): a su correo de usuario o al correo del
// tiquete; sin correo queda «sin correo». El worker crea el enlace y envía el correo. El informe
// calcula el NPS y el promedio de satisfacción del periodo; cada respuesta deja un evento para el
// indicador de satisfacción de Calidad (B39).

/** La encuesta de la empresa; la crea con los textos de fábrica si falta (con su auditoría). */
export async function surveyFor(tx: TenantTransaction, actor: ServiceActor): Promise<SvcSurvey> {
  const found = await tx.svcSurvey.findFirst({
    where: { key: DEFAULT_SURVEY.key, deletedAt: null },
  });
  if (found !== null) return found;
  const created = await tx.svcSurvey.create({
    data: {
      tenantId: actor.tenantId,
      key: DEFAULT_SURVEY.key,
      name: DEFAULT_SURVEY.name,
      trigger: 'ticket_resolved',
      recommendQuestion: DEFAULT_SURVEY.recommend_question,
      satisfactionQuestion: DEFAULT_SURVEY.satisfaction_question,
      commentQuestion: DEFAULT_SURVEY.comment_question,
    },
  });
  await recordServiceChange(tx, actor, {
    action: 'service.survey.create',
    event: 'service.survey.created',
    entityType: 'svc_survey',
    entityId: created.id,
    changes: { key: created.key, is_active: created.isActive },
    payload: { key: created.key },
  });
  return created;
}

/** A dónde va la encuesta: el correo del usuario que lo pidió o el que quedó en el tiquete. */
async function recipientOf(tx: TenantTransaction, ticket: SvcTicket): Promise<string | null> {
  if (ticket.requesterId !== null) {
    const person = (await peopleById(tx, [ticket.requesterId])).get(ticket.requesterId);
    if (person !== undefined) return person.email;
  }
  return ticket.requesterEmail;
}

/**
 * Invita a la encuesta al resolver un tiquete. Si la encuesta está apagada no hace nada. Una
 * invitación anterior sin responder queda reemplazada: vale el enlace más reciente.
 */
export async function inviteToSurvey(
  tx: TenantTransaction,
  actor: ServiceActor,
  ticket: SvcTicket,
): Promise<void> {
  const survey = await surveyFor(tx, actor);
  if (!survey.isActive) return;
  await tx.svcSurveyResponse.updateMany({
    where: { entityId: ticket.id, answeredAt: null, supersededAt: null, deletedAt: null },
    data: { supersededAt: actor.at, mailPending: false },
  });
  const email = await recipientOf(tx, ticket);
  const invitation = await tx.svcSurveyResponse.create({
    data: {
      tenantId: actor.tenantId,
      surveyId: survey.id,
      partyId: ticket.partyId,
      entityType: 'svc_ticket',
      entityId: ticket.id,
      recipientEmail: email,
      mailPending: email !== null,
    },
  });
  await recordServiceChange(tx, actor, {
    action: 'service.survey.invite',
    event: 'service.survey.invited',
    entityType: 'svc_survey_response',
    entityId: invitation.id,
    changes: { ticket_id: ticket.id, ticket_code: ticket.code, has_recipient: email !== null },
    payload: { ticket_id: ticket.id, ticket_code: ticket.code },
  });
}

function stateOf(row: SvcSurveyResponse, now: Date): TicketSurvey['state'] {
  if (row.answeredAt !== null) return 'answered';
  if (row.recipientEmail === null) return 'no_recipient';
  return row.expiresAt !== null && row.expiresAt <= now ? 'expired' : 'sent';
}

/** La encuesta del tiquete, para su ficha: la invitación más reciente. */
export async function ticketSurvey(
  tx: TenantTransaction,
  ticketId: string,
  now: Date,
): Promise<TicketSurvey | null> {
  const row = await tx.svcSurveyResponse.findFirst({
    where: { entityId: ticketId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (row === null) return null;
  return { state: stateOf(row, now), score: row.score, satisfaction: row.satisfaction };
}

function surveyView(survey: SvcSurvey): Survey {
  return {
    id: survey.id,
    key: survey.key,
    name: survey.name,
    trigger: surveyTriggerSchema.parse(survey.trigger),
    recommend_question: survey.recommendQuestion,
    satisfaction_question: survey.satisfactionQuestion,
    comment_question: survey.commentQuestion,
    is_active: survey.isActive,
    version: survey.version,
  };
}

function summaryOf(answers: readonly SvcSurveyResponse[], sent: number): SurveyResults['summary'] {
  const scores = answers.map((row) => row.score ?? 0);
  const ratings = answers.map((row) => row.satisfaction ?? 0);
  const average =
    ratings.length === 0
      ? null
      : Math.round((ratings.reduce((sum, value) => sum + value, 0) * 10) / ratings.length) / 10;
  return {
    sent,
    answered: answers.length,
    nps: npsOf(scores),
    promoters: scores.filter((score) => score >= 9).length,
    passives: scores.filter((score) => score === 7 || score === 8).length,
    detractors: scores.filter((score) => score <= 6).length,
    satisfaction_avg: average,
  };
}

/** Del primer instante del día `from` al último del día `to`, en hora de Colombia. */
function periodOf(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00-05:00`),
    lt: new Date(`${addDays(to, 1)}T00:00:00-05:00`),
  };
}

@Injectable()
export class SurveysUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal, ability: AppAbility): Promise<SurveyListResponse> {
    const actor: ServiceActor = { ...principal, meta: null, at: this.clock.now() };
    const survey = await this.database.withTenant(principal, (tx) => surveyFor(tx, actor));
    return {
      data: [surveyView(survey)],
      can_manage: hasUnconditionalPermission(ability, 'service.survey.manage'),
    };
  }

  async update(
    principal: Principal,
    target: ServiceTarget,
    input: UpdateSurveyRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const survey = await tx.svcSurvey.findFirst({ where: { id: target.id, deletedAt: null } });
      if (survey === null) throw serviceNotFound('La encuesta');
      const { count } = await tx.svcSurvey.updateMany({
        where: { id: survey.id, version: target.version, deletedAt: null },
        data: {
          name: input.name,
          recommendQuestion: input.recommend_question,
          satisfactionQuestion: input.satisfaction_question,
          commentQuestion: input.comment_question,
          isActive: input.is_active,
        },
      });
      if (count === 0) throw versionConflict();
      await recordServiceChange(tx, actor, {
        action: 'service.survey.update',
        event: 'service.survey.updated',
        entityType: 'svc_survey',
        entityId: survey.id,
        changes: { key: survey.key, is_active: [survey.isActive, input.is_active] },
        payload: { key: survey.key, is_active: input.is_active },
      });
    });
  }

  /** NPS y satisfacción del periodo: lo leen quienes ven todos los tiquetes. */
  async results(
    principal: Principal,
    ability: AppAbility,
    query: SurveyResultsQuery,
  ): Promise<SurveyResults> {
    if (!hasUnconditionalPermission(ability, 'service.ticket.read')) throw permissionDenied();
    const today = bogotaToday(this.clock.now());
    const to = query.to ?? today;
    const from = query.from ?? addDays(to, -SURVEY_RULES.defaultReportDays);
    const period = periodOf(from, to);
    return this.database.withTenant(principal, async (tx) => {
      const sent = await tx.svcSurveyResponse.count({
        where: { deletedAt: null, sentAt: period },
      });
      const answers = await tx.svcSurveyResponse.findMany({
        where: { deletedAt: null, answeredAt: period },
        orderBy: { answeredAt: 'desc' },
      });
      return { from, to, summary: summaryOf(answers, sent), data: await answerViews(tx, answers) };
    });
  }
}

async function answerViews(
  tx: TenantTransaction,
  answers: readonly SvcSurveyResponse[],
): Promise<SurveyResults['data']> {
  const ticketIds = answers.map((row) => row.entityId);
  const tickets = await tx.svcTicket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, code: true },
  });
  const codes = new Map(tickets.map((ticket) => [ticket.id, ticket.code]));
  const partyIds = answers.flatMap((row) => (row.partyId === null ? [] : [row.partyId]));
  const parties = await commercialParties(tx, partyIds);
  return answers.map((row) => {
    const party = row.partyId === null ? undefined : parties.get(row.partyId);
    return {
      id: row.id,
      ticket: { id: row.entityId, code: codes.get(row.entityId) ?? '—' },
      party: party === undefined ? null : { id: party.id, name: party.name },
      score: row.score ?? 0,
      satisfaction: row.satisfaction ?? 0,
      comment: row.comment,
      answered_at: (row.answeredAt ?? row.updatedAt).toISOString(),
    };
  });
}
