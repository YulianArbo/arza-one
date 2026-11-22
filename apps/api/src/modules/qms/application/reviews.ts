import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateManagementReview,
  ManagementReview,
  ManagementReviewSummary,
  QmsCodeResponse,
  UpdateManagementReview,
} from '@arza/contracts';

import type { QmsManagementReview } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { assertPlan } from './action-records.js';
import { auditQms, qmsActorOf, qmsConflict, qmsNotFound, type Target } from './qms-support.js';
import {
  emptyInputs,
  reviewSummaryView,
  reviewView,
  storedInputs,
  type StoredDecision,
} from './review-views.js';

// El acta de revisión por la dirección (B39; RE-SGC-007): Calidad la crea y la prepara mientras está
// en preparación; luego la envía a la Dirección (review-steps).

const REVIEWS = { name: 'Revisiones por la dirección', prefix: 'RD', padding: 4 };

/** Las entradas con los comentarios nuevos; las que no se mencionan conservan el suyo. */
function withComments(row: Pick<QmsManagementReview, 'inputs'>, input: UpdateManagementReview) {
  const comments = new Map(input.comments.map((item) => [item.key, item.comment]));
  return storedInputs(row).map((stored) => ({
    ...stored,
    comment: comments.has(stored.key) ? (comments.get(stored.key) ?? null) : stored.comment,
  }));
}

@Injectable()
export class ManagementReviews {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<ManagementReviewSummary[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsManagementReview.findMany({
        where: { deletedAt: null },
        orderBy: { code: 'desc' },
        take: 100,
      });
      return rows.map(reviewSummaryView);
    });
  }

  async detail(principal: Principal, id: string): Promise<ManagementReview> {
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsManagementReview.findFirst({ where: { id, deletedAt: null } });
      if (row === null) throw qmsNotFound('El acta no existe.');
      return reviewView(tx, row);
    });
  }

  async create(
    principal: Principal,
    meta: RequestMeta,
    input: CreateManagementReview,
  ): Promise<QmsCodeResponse> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const code = await nextBusinessCode(tx, 'qms.management_review', actor.at, REVIEWS);
      const row = await tx.qmsManagementReview.create({
        data: {
          tenantId: actor.tenantId,
          code,
          periodFrom: fromCalendarDate(input.period_from),
          periodTo: fromCalendarDate(input.period_to),
          meetingOn: fromCalendarDate(input.meeting_on),
          attendees: input.attendees,
          inputs: emptyInputs(),
        },
      });
      await auditQms(tx, actor, {
        action: 'qms.management_review.create',
        entityType: 'qms_management_review',
        entityId: row.id,
        changes: { code, period_from: input.period_from, period_to: input.period_to },
      });
      return { id: row.id, code };
    });
  }

  /** Asistentes, comentarios de cada entrada, conclusiones y decisiones, mientras se prepara. */
  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: UpdateManagementReview,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsManagementReview.findFirst({
        where: { id: target.id, deletedAt: null },
      });
      if (row === null) throw qmsNotFound('El acta no existe.');
      if (row.status !== 'draft') throw qmsConflict('Solo se edita un acta en preparación.');
      for (const decision of input.decisions) await assertPlan(tx, actor, decision);
      const decisions: StoredDecision[] = input.decisions.map((decision) => ({
        ...decision,
        action: null,
      }));
      const updated = await tx.qmsManagementReview.updateMany({
        where: { id: row.id, version: target.version, status: 'draft' },
        data: {
          attendees: input.attendees,
          conclusions: input.conclusions,
          inputs: withComments(row, input),
          decisions,
        },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.management_review.update',
        entityType: 'qms_management_review',
        entityId: row.id,
        changes: { code: row.code, decisions: decisions.length },
      });
    });
  }
}
