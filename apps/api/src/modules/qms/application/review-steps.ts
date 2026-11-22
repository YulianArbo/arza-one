import { Inject, Injectable } from '@nestjs/common';
import { REVIEW_INPUTS, type ReturnManagementReview } from '@arza/contracts';

import type { Prisma, QmsManagementReview } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import { insertAction, NO_LINK } from './action-records.js';
import {
  auditQms,
  emitQms,
  qmsActorOf,
  qmsConflict,
  qmsNotFound,
  type QmsActor,
  type Target,
} from './qms-support.js';
import { automaticLines } from './review-inputs.js';
import { storedDecisions, storedInputs, type StoredDecision } from './review-views.js';

// Los pasos del acta de revisión por la dirección (B39). Calidad precarga las entradas y la envía;
// la Dirección la devuelve con el motivo o la aprueba (decisión 5). Al aprobarse, cada decisión se
// vuelve una acción de mejora con su responsable y fecha, el acta queda fija y su PDF en cola
// (decisión 9).

type ReviewStep = 'load' | 'submit' | 'return' | 'approve';

interface StepContext {
  readonly tx: TenantTransaction;
  readonly actor: QmsActor;
  readonly review: QmsManagementReview;
}

const STEP_FROM: Readonly<Record<ReviewStep, string>> = {
  load: 'draft',
  submit: 'draft',
  return: 'submitted',
  approve: 'submitted',
};

const STEP_MESSAGES: Readonly<Record<ReviewStep, string>> = {
  load: 'Solo se precargan las entradas de un acta en preparación.',
  submit: 'El acta ya se envió a la Dirección.',
  return: 'Solo se devuelve un acta por aprobar.',
  approve: 'Solo se aprueba un acta por aprobar.',
};

async function move(
  ctx: StepContext,
  target: Target,
  step: ReviewStep,
  data: Prisma.QmsManagementReviewUpdateManyMutationInput,
): Promise<void> {
  const updated = await ctx.tx.qmsManagementReview.updateMany({
    where: { id: ctx.review.id, version: target.version, status: STEP_FROM[step] },
    data,
  });
  if (updated.count !== 1) throw versionConflict();
  await auditQms(ctx.tx, ctx.actor, {
    action: `qms.management_review.${step}`,
    entityType: 'qms_management_review',
    entityId: ctx.review.id,
    changes: {
      code: ctx.review.code,
      status: [ctx.review.status, data.status ?? ctx.review.status],
    },
  });
}

/** Cada decisión se vuelve una acción de mejora enlazada al acta. */
async function decisionActions(ctx: StepContext): Promise<StoredDecision[]> {
  const result: StoredDecision[] = [];
  for (const decision of storedDecisions(ctx.review)) {
    const action = await insertAction(ctx.tx, ctx.actor, {
      originType: 'management_review',
      link: { ...NO_LINK, reviewId: ctx.review.id },
      description: decision.description,
      responsibleId: decision.responsible_id,
      dueOn: decision.due_on,
      notes: null,
    });
    result.push({ ...decision, action });
  }
  return result;
}

@Injectable()
export class ReviewSteps {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async step(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    step: ReviewStep,
    run: (ctx: StepContext) => Promise<void>,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const review = await tx.qmsManagementReview.findFirst({
        where: { id: target.id, deletedAt: null },
      });
      if (review === null) throw qmsNotFound('El acta no existe.');
      if (review.status !== STEP_FROM[step]) throw qmsConflict(STEP_MESSAGES[step]);
      await run({ tx, actor, review });
    });
  }

  /** «Precargar entradas»: las cifras del periodo; conserva los comentarios ya escritos. */
  async loadInputs(principal: Principal, meta: RequestMeta, target: Target): Promise<void> {
    await this.step(principal, meta, target, 'load', async (ctx) => {
      const lines = await automaticLines(ctx.tx, {
        reviewId: ctx.review.id,
        from: toCalendarDate(ctx.review.periodFrom),
        to: toCalendarDate(ctx.review.periodTo),
      });
      const inputs = storedInputs(ctx.review).map((input) => ({
        ...input,
        lines: REVIEW_INPUTS[input.key].manual ? [] : (lines.get(input.key) ?? []),
      }));
      await move(ctx, target, 'load', { inputs, inputsLoadedAt: ctx.actor.at });
    });
  }

  async submit(principal: Principal, meta: RequestMeta, target: Target): Promise<void> {
    await this.step(principal, meta, target, 'submit', async (ctx) => {
      if (ctx.review.inputsLoadedAt === null) {
        throw qmsConflict('Precargue las entradas antes de enviar el acta.');
      }
      if (ctx.review.conclusions === null) {
        throw qmsConflict('Escriba las conclusiones antes de enviar el acta.');
      }
      await move(ctx, target, 'submit', { status: 'submitted', returnReason: null });
      await emitQms(ctx.tx, ctx.actor, 'qms.review.submitted', {
        review_id: ctx.review.id,
        code: ctx.review.code,
        recipients: await activeUsersWithRoles(ctx.tx, ['DIRECCION'], ctx.actor.at),
      });
    });
  }

  async returnToDraft(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: ReturnManagementReview,
  ): Promise<void> {
    await this.step(principal, meta, target, 'return', async (ctx) => {
      await move(ctx, target, 'return', { status: 'draft', returnReason: input.reason });
    });
  }

  /** Solo la Dirección (decisión 5): las decisiones se vuelven acciones y el acta queda fija. */
  async approve(principal: Principal, meta: RequestMeta, target: Target): Promise<void> {
    await this.step(principal, meta, target, 'approve', async (ctx) => {
      const decisions = await decisionActions(ctx);
      await move(ctx, target, 'approve', {
        status: 'approved',
        decisions,
        approvedBy: ctx.actor.userId,
        approvedOn: fromCalendarDate(bogotaToday(ctx.actor.at)),
        pdfStatus: 'pending',
      });
    });
  }
}
