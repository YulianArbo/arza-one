import { Inject, Injectable } from '@nestjs/common';
import {
  REVIEW_RESULTS,
  checkAnswerSchema,
  isWorkItem,
  reviewResultSchema,
  type CodeReview,
  type CodeReviewListQuery,
  type CodeReviewRequest,
} from '@arza/contracts';
import { z } from 'zod';

import type { PrjCodeReview, PrjItem, PrjProject } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday } from '../../core/index.js';
import { CODE_REVIEW_CODE, recordSystemForm } from '../../doc/index.js';
import { reviewProblem } from '../domain/control-rules.js';
import type { ItemRequester } from './items.js';
import { typeOf } from './item-records.js';
import { formUnavailable, projectNotFound, reviewInvalid } from './project-messages.js';
import { assertOpen, findProjectForItems, findVisibleProject } from './project-records.js';
import {
  peopleNames,
  personRef,
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
} from './project-support.js';

// Revisiones de código (B27, ficha 17.8 y FT-TEC-002). Un compañero revisa el ítem punto por punto
// con la Lista de Revisión de Código; quien hizo el ítem no se revisa a sí mismo (decisión 9). La
// plataforma llena el registro FT-TEC-002 con su PDF. Un ítem solo pasa a terminado con su última
// revisión aprobada. Las revisiones no se editan: si hay cambios, se hace otra.

const answersSchema = z.array(checkAnswerSchema);

type ReviewRow = PrjCodeReview & { readonly item: Pick<PrjItem, 'id' | 'number' | 'title'> };

function reviewView(review: ReviewRow, names: ReadonlyMap<string, string>): CodeReview {
  return {
    id: review.id,
    item: review.item,
    reference_url: review.referenceUrl,
    reviewer: personRef(names, review.reviewerId),
    answers: answersSchema.parse(review.answers),
    result: reviewResultSchema.parse(review.result),
    notes: review.notes,
    record_code: review.recordCode,
    created_at: review.createdAt.toISOString(),
  };
}

/** El ítem es de trabajo, está asignado a otra persona y va por revisión o pruebas. */
function assertReviewable(item: PrjItem, reviewerId: string): void {
  if (!isWorkItem(typeOf(item))) throw reviewInvalid('Las épicas no se revisan: revise sus ítems.');
  if (item.assigneeId === null) {
    throw reviewInvalid('Asigne el ítem a quien lo hizo antes de revisarlo.');
  }
  if (item.assigneeId === reviewerId) {
    throw reviewInvalid('Quien hizo el ítem no revisa su propio código: pídaselo a un compañero.');
  }
  if (item.status !== 'in_review' && item.status !== 'in_testing') {
    throw reviewInvalid('El ítem se revisa cuando está en las columnas En revisión o En pruebas.');
  }
}

/** Los datos del registro FT-TEC-002, con los nombres de sus campos en el formato. */
function checklistData(
  context: { readonly project: string; readonly reviewer: string; readonly at: Date },
  item: PrjItem,
  input: CodeReviewRequest,
) {
  return {
    proyecto: context.project,
    item: `#${String(item.number)} · ${item.title}`,
    enlace: input.reference_url,
    revisor: context.reviewer,
    fecha: bogotaToday(context.at),
    puntos: input.answers.map((result) => ({ result, note: '' })),
    resultado: REVIEW_RESULTS[input.result],
    observaciones: input.notes ?? '',
  };
}

function reviewData(item: PrjItem, input: CodeReviewRequest, actor: ProjectActor) {
  return {
    itemId: item.id,
    referenceUrl: input.reference_url,
    reviewerId: actor.userId ?? '',
    answers: input.answers,
    result: input.result,
    notes: input.notes,
  };
}

/** El ítem existe en el proyecto, se puede revisar y la revisión es coherente con sus puntos. */
async function reviewableItem(
  tx: TenantTransaction,
  projectId: string,
  input: CodeReviewRequest,
  reviewerId: string,
): Promise<PrjItem> {
  const item = await tx.prjItem.findFirst({
    where: { id: input.item_id, projectId, deletedAt: null },
  });
  if (item === null) throw projectNotFound('El ítem');
  assertReviewable(item, reviewerId);
  const problem = reviewProblem(input.answers, input.result);
  if (problem !== null) throw reviewInvalid(problem);
  return item;
}

/** Llena el registro FT-TEC-002 de la revisión y lo une a ella; devuelve su código. */
async function recordChecklist(
  tx: TenantTransaction,
  actor: ProjectActor,
  target: { readonly project: PrjProject; readonly item: PrjItem; readonly reviewId: string },
  input: CodeReviewRequest,
): Promise<string> {
  const { project, item, reviewId } = target;
  const reviewerId = actor.userId ?? '';
  const reviewer = (await peopleNames(tx, [reviewerId])).get(reviewerId) ?? 'Colaborador';
  const record = await recordSystemForm(tx, actor, {
    templateCode: CODE_REVIEW_CODE,
    entityType: 'prj_code_review',
    entityId: reviewId,
    data: checklistData(
      { project: `${project.code} · ${project.name}`, reviewer, at: actor.at },
      item,
      input,
    ),
  });
  if (record === null) throw formUnavailable(CODE_REVIEW_CODE);
  await tx.prjCodeReview.update({
    where: { id: reviewId },
    data: { checklistRecordId: record.id, recordCode: record.code },
  });
  return record.code;
}

@Injectable()
export class CodeReviewsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    requester: ItemRequester,
    projectId: string,
    input: CodeReviewRequest,
  ): Promise<string> {
    const actor = projectActorOf(requester.principal, requester.meta, this.clock.now());
    return this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await findProjectForItems(tx, requester.ability, projectId);
      assertOpen(project);
      const item = await reviewableItem(tx, projectId, input, actor.userId ?? '');
      const review = await tx.prjCodeReview.create({
        data: { tenantId: actor.tenantId, projectId, ...reviewData(item, input, actor) },
      });
      const recordCode = await recordChecklist(
        tx,
        actor,
        { project, item, reviewId: review.id },
        input,
      );
      await recordProjectChange(tx, actor, {
        action: 'project.code_review.create',
        event: 'project.code_review.created',
        entityType: 'prj_code_review',
        entityId: review.id,
        changes: {
          project: project.code,
          item: item.code,
          result: input.result,
          not_met: input.answers.filter((answer) => answer === 'no').length,
          record_code: recordCode,
        },
        payload: { project_id: projectId, code: project.code, item_id: item.id },
      });
      return review.id;
    });
  }

  async list(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
    query: CodeReviewListQuery,
  ): Promise<CodeReview[]> {
    return this.database.withTenant(principal, async (tx: TenantTransaction) => {
      await findVisibleProject(tx, ability, projectId);
      const rows = await tx.prjCodeReview.findMany({
        where: {
          projectId,
          deletedAt: null,
          ...(query.item_id === undefined ? {} : { itemId: query.item_id }),
        },
        include: { item: { select: { id: true, number: true, title: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
      const names = await peopleNames(
        tx,
        rows.map((row) => row.reviewerId),
      );
      return rows.map((row) => reviewView(row, names));
    });
  }
}
