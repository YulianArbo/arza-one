import { Inject, Injectable } from '@nestjs/common';
import {
  reviewStatusSchema,
  riskLevelSchema,
  type ApproveDueDiligenceRequest,
  type CreateDueDiligenceRequest,
  type DueDiligence as DueDiligenceView,
} from '@arza/contracts';

import type { DueDiligence } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { defaultNextReview, reviewProblem } from '../domain/reviews.js';
import { nextReviewInvalid, partyNotFound, reviewNotAllowed } from './party-messages.js';
import { ALL_PARTIES, auditParty, findParty, scopeOf, type PartyActor } from './party-support.js';
import { peopleOf, reviewFields, type People } from './review-views.js';

// Conocimiento del tercero y nivel de riesgo (ficha 17.3, FT-FIN-007). Versión mínima aprobada en
// el plan de B13: riesgo, resumen y próxima revisión. shortcut: el formulario completo del
// FT-FIN-007 se conecta cuando existan los formularios dinámicos (form_record_id).

function reviewView(people: People, row: DueDiligence) {
  const view: DueDiligenceView = {
    id: row.id,
    risk_level: riskLevelSchema.parse(row.riskLevel),
    summary: row.summary,
    status: reviewStatusSchema.parse(row.status),
    next_review_on: row.nextReviewOn === null ? null : toCalendarDate(row.nextReviewOn),
    ...reviewFields(people, row),
  };
  return view;
}

async function findReview(tx: TenantTransaction, partyId: string, id: string) {
  const row = await tx.dueDiligence.findFirst({ where: { id, partyId, deletedAt: null } });
  if (row === null) throw partyNotFound('El conocimiento del tercero');
  return row;
}

@Injectable()
export class DueDiligenceUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): PartyActor {
    return { principal, meta, at: this.clock.now() };
  }

  async list(
    principal: Principal,
    ability: AppAbility,
    partyId: string,
  ): Promise<DueDiligenceView[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findParty(tx, scopeOf(principal, ability), partyId);
      const rows = await tx.dueDiligence.findMany({
        where: { partyId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const people = await peopleOf(tx, rows);
      return rows.map((row) => reviewView(people, row));
    });
  }

  async create(
    principal: Principal,
    partyId: string,
    input: CreateDueDiligenceRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      await findParty(tx, ALL_PARTIES, partyId);
      const row = await tx.dueDiligence.create({
        data: {
          tenantId: principal.tenantId,
          partyId,
          riskLevel: input.risk_level,
          summary: input.summary,
        },
      });
      await auditParty(tx, actor, {
        action: 'party.due_diligence.create',
        entityType: 'party_due_diligence',
        entityId: row.id,
        changes: { party_id: partyId, risk_level: row.riskLevel },
      });
      return row.id;
    });
  }

  /** Aprueba con la próxima revisión indicada o, si no se indica, en doce meses. */
  async approve(
    principal: Principal,
    target: { readonly partyId: string; readonly id: string },
    input: ApproveDueDiligenceRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const today = bogotaToday(this.clock.now());
    const nextReview = input.next_review_on ?? defaultNextReview(today);
    if (nextReview <= today) throw nextReviewInvalid();
    await this.review(principal, target, { status: 'approved', note: null, nextReview }, meta);
  }

  async reject(
    principal: Principal,
    target: { readonly partyId: string; readonly id: string },
    note: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.review(principal, target, { status: 'rejected', note, nextReview: null }, meta);
  }

  private async review(
    principal: Principal,
    target: { readonly partyId: string; readonly id: string },
    decision: { status: string; note: string | null; nextReview: string | null },
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      await findParty(tx, ALL_PARTIES, target.partyId);
      const row = await findReview(tx, target.partyId, target.id);
      const problem = reviewProblem(row, principal.userId);
      if (problem !== null) throw reviewNotAllowed(problem);
      await tx.dueDiligence.update({
        where: { id: row.id },
        data: {
          status: decision.status,
          reviewedBy: principal.userId,
          reviewedAt: actor.at,
          reviewNote: decision.note,
          nextReviewOn: decision.nextReview === null ? null : fromCalendarDate(decision.nextReview),
        },
      });
      await auditParty(tx, actor, {
        action: `party.due_diligence.${decision.status === 'approved' ? 'approve' : 'reject'}`,
        entityType: 'party_due_diligence',
        entityId: row.id,
        changes: {
          party_id: target.partyId,
          risk_level: row.riskLevel,
          next_review_on: decision.nextReview,
          note: decision.note,
        },
      });
    });
  }
}
