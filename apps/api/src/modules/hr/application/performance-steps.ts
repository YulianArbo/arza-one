import type { AgreeReview, ScoreReview } from '@arza/contracts';

import { z } from 'zod';

import type { HrEmployee, HrPerformanceReview } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { fromCalendarDate } from '../../core/index.js';
import { weightedScore } from '../domain/review-score.js';
import {
  auditHr,
  employeeOfUser,
  hrConflict,
  hrInvalid,
  hrNotFound,
  isManagerOf,
  type HrActor,
  type HrViewer,
} from './hr-support.js';

// Pasos de la evaluación de desempeño (decisión 7): calificar (el jefe o Talento humano) y aceptar
// (el colaborador evaluado). Una evaluación aceptada ya no cambia.

const storedObjectivesSchema = z.array(
  z.object({ title: z.string(), weight: z.number(), score: z.number().nullable().default(null) }),
);

export type StoredObjective = z.infer<typeof storedObjectivesSchema>[number];

export function storedObjectives(
  review: Pick<HrPerformanceReview, 'objectives'>,
): StoredObjective[] {
  return storedObjectivesSchema.parse(review.objectives);
}

/** Talento humano sobre todos, o el jefe inmediato sobre su equipo; nunca sobre sí mismo. */
export async function assertEvaluator(
  tx: TenantTransaction,
  viewer: HrViewer,
  employee: Pick<HrEmployee, 'positionId' | 'userId'>,
): Promise<void> {
  if (employee.userId === viewer.principal.userId) throw permissionDenied();
  if (hasUnconditionalPermission(viewer.ability, 'hr.performance.manage')) return;
  if (await isManagerOf(tx, viewer.principal.userId, employee)) return;
  throw permissionDenied();
}

interface Target {
  readonly id: string;
  readonly version: number;
}

async function requireReview(tx: TenantTransaction, target: Target): Promise<HrPerformanceReview> {
  const review = await tx.hrPerformanceReview.findFirst({
    where: { id: target.id, deletedAt: null },
  });
  if (review === null) throw hrNotFound('La evaluación no existe.');
  if (review.version !== target.version) throw versionConflict();
  return review;
}

/** Guarda las calificaciones y el promedio; devuelve el promedio con dos decimales. */
async function storeScores(
  tx: TenantTransaction,
  actor: HrActor,
  review: HrPerformanceReview,
  input: ScoreReview,
): Promise<string> {
  const objectives = storedObjectives(review);
  if (input.scores.length !== objectives.length) {
    throw hrInvalid('Califique cada uno de los objetivos.');
  }
  const score = weightedScore(objectives, input.scores).toFixed(2);
  const updated = await tx.hrPerformanceReview.updateMany({
    where: { id: review.id, version: review.version, status: 'draft' },
    data: {
      objectives: objectives.map((objective, index) => ({
        ...objective,
        score: input.scores[index] ?? null,
      })),
      score,
      status: 'scored',
      reviewerId: actor.userId,
      reviewerComment: input.comment,
      scoredAt: actor.at,
    },
  });
  if (updated.count !== 1) throw versionConflict();
  return score;
}

export async function scoreReview(
  tx: TenantTransaction,
  step: {
    readonly viewer: HrViewer;
    readonly actor: HrActor;
    readonly target: Target;
    readonly input: ScoreReview;
  },
): Promise<void> {
  const { viewer, actor, target, input } = step;
  const review = await requireReview(tx, target);
  const employee = await tx.hrEmployee.findFirst({ where: { id: review.employeeId } });
  if (employee === null) throw hrNotFound('La evaluación no existe.');
  await assertEvaluator(tx, viewer, employee);
  if (review.status !== 'draft') throw hrConflict('La evaluación ya está calificada.');
  const score = await storeScores(tx, actor, review, input);
  await auditHr(tx, actor, {
    action: 'hr.review.score',
    entityType: 'hr_performance_review',
    entityId: review.id,
    changes: { status: { from: 'draft', to: 'scored' }, score },
  });
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType: 'hr.review.scored',
    payload: {
      review_id: review.id,
      recipients: employee.userId === null ? [] : [employee.userId],
    },
  });
}

export async function agreeReview(
  tx: TenantTransaction,
  step: {
    readonly actor: HrActor;
    readonly target: Target;
    readonly input: AgreeReview;
    readonly today: string;
  },
): Promise<void> {
  const { actor, target, input, today } = step;
  const review = await requireReview(tx, target);
  const own = await employeeOfUser(tx, actor.userId);
  if (own?.id !== review.employeeId) throw hrNotFound('La evaluación no existe.');
  if (review.status !== 'scored') throw hrConflict('La evaluación aún no está lista para aceptar.');
  const updated = await tx.hrPerformanceReview.updateMany({
    where: { id: review.id, version: review.version, status: 'scored' },
    data: { status: 'agreed', agreedOn: fromCalendarDate(today), employeeComment: input.comment },
  });
  if (updated.count !== 1) throw versionConflict();
  await auditHr(tx, actor, {
    action: 'hr.review.agree',
    entityType: 'hr_performance_review',
    entityId: review.id,
    changes: { status: { from: 'scored', to: 'agreed' }, with_comment: input.comment !== null },
  });
}
