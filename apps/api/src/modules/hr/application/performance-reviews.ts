import { Inject, Injectable } from '@nestjs/common';
import {
  performanceReviewSchema,
  type AgreeReview,
  type CreateReview,
  type PerformanceReview,
  type ScoreReview,
} from '@arza/contracts';
import type { HrEmployee, HrPerformanceReview } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import {
  auditHr,
  employeeOfUser,
  employeeRefsById,
  hrConflict,
  lockKey,
  managerOf,
  refOf,
  requireActiveEmployee,
  userRefs,
  type HrActor,
  type HrViewer,
} from './hr-support.js';
import {
  agreeReview,
  assertEvaluator,
  scoreReview,
  storedObjectives,
} from './performance-steps.js';

// Evaluación de desempeño (B36, ficha 17.13, decisión 7): Talento humano o el jefe inmediato fija
// los objetivos con su peso; el jefe califica de 1 a 5 cada objetivo y el colaborador acepta la
// evaluación desde «Mi espacio». Nadie se evalúa a sí mismo.

async function replayed(
  tx: TenantTransaction,
  tenantId: string,
  requestKey: string,
  input: CreateReview,
): Promise<string | null> {
  await lockKey(tx, `hr.review:${tenantId}:${requestKey}`);
  const existing = await tx.hrPerformanceReview.findUnique({
    where: { tenantId_requestKey: { tenantId, requestKey } },
  });
  if (existing === null) return null;
  if (existing.employeeId !== input.employee_id || existing.period !== input.period) {
    throw idempotencyKeyReused();
  }
  return existing.id;
}

async function reviewViews(
  tx: TenantTransaction,
  viewer: HrViewer,
  rows: readonly HrPerformanceReview[],
): Promise<PerformanceReview[]> {
  const employees = await employeeRefsById(
    tx,
    rows.map(({ employeeId }) => employeeId),
  );
  const people = await userRefs(
    tx,
    rows.map(({ reviewerId }) => reviewerId),
  );
  const own = await employeeOfUser(tx, viewer.principal.userId);
  const isHr = hasUnconditionalPermission(viewer.ability, 'hr.performance.manage');
  return rows.map((row) => {
    const mine = own?.id === row.employeeId;
    return performanceReviewSchema.parse({
      id: row.id,
      employee: employees.get(row.employeeId) ?? { id: row.employeeId, name: 'Colaborador' },
      period: row.period,
      objectives: storedObjectives(row),
      score: row.score === null ? null : row.score.toFixed(2),
      status: row.status,
      reviewer: refOf(people, row.reviewerId),
      reviewer_comment: row.reviewerComment,
      employee_comment: row.employeeComment,
      agreed_on: row.agreedOn === null ? null : toCalendarDate(row.agreedOn),
      can_score:
        row.status === 'draft' && !mine && (isHr || row.reviewerId === viewer.principal.userId),
      can_agree: row.status === 'scored' && mine,
      version: row.version,
    });
  });
}

@Injectable()
export class PerformanceReviews {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    viewer: HrViewer,
    meta: RequestMeta,
    requestKey: string,
    input: CreateReview,
  ): Promise<string> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    return this.database.withTenant(viewer.principal, async (tx) => {
      const previous = await replayed(tx, actor.tenantId, requestKey, input);
      if (previous !== null) return previous;
      const employee = await requireActiveEmployee(tx, input.employee_id);
      await assertEvaluator(tx, viewer, employee);
      await lockKey(tx, `hr.review.period:${employee.id}:${input.period}`);
      const taken = await tx.hrPerformanceReview.count({
        where: { employeeId: employee.id, period: input.period, deletedAt: null },
      });
      if (taken > 0)
        throw hrConflict('Ya existe una evaluación de ese periodo para el colaborador.');
      return storeReview(tx, actor, { employee, input, requestKey });
    });
  }

  async score(
    viewer: HrViewer,
    meta: RequestMeta,
    target: { id: string; version: number },
    input: ScoreReview,
  ): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    await this.database.withTenant(viewer.principal, (tx) =>
      scoreReview(tx, { viewer, actor, target, input }),
    );
  }

  async agree(
    viewer: HrViewer,
    meta: RequestMeta,
    target: { id: string; version: number },
    input: AgreeReview,
  ): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    const today = bogotaToday(actor.at);
    await this.database.withTenant(viewer.principal, (tx) =>
      agreeReview(tx, { actor, target, input, today }),
    );
  }

  async list(viewer: HrViewer, scope: 'mine' | 'team' | 'all'): Promise<PerformanceReview[]> {
    if (scope === 'all' && !hasUnconditionalPermission(viewer.ability, 'hr.performance.manage')) {
      throw permissionDenied();
    }
    return this.database.withTenant(viewer.principal, async (tx) => {
      const where = await scopeWhere(tx, viewer.principal.userId, scope);
      if (where === null) return [];
      const rows = await tx.hrPerformanceReview.findMany({
        where: { deletedAt: null, ...where },
        orderBy: [{ period: 'desc' }, { id: 'asc' }],
        take: 500,
      });
      return reviewViews(tx, viewer, rows);
    });
  }
}

async function scopeWhere(
  tx: TenantTransaction,
  userId: string,
  scope: 'mine' | 'team' | 'all',
): Promise<Record<string, string> | null> {
  if (scope === 'all') return {};
  if (scope === 'team') return { reviewerId: userId };
  const own = await employeeOfUser(tx, userId);
  return own === null ? null : { employeeId: own.id };
}

async function storeReview(
  tx: TenantTransaction,
  actor: HrActor,
  review: {
    readonly employee: HrEmployee;
    readonly input: CreateReview;
    readonly requestKey: string;
  },
): Promise<string> {
  const { employee, input, requestKey } = review;
  const reviewerId = (await managerOf(tx, employee)) ?? actor.userId;
  const row = await tx.hrPerformanceReview.create({
    data: {
      tenantId: actor.tenantId,
      employeeId: employee.id,
      period: input.period,
      objectives: input.objectives.map((objective) => ({ ...objective, score: null })),
      reviewerId,
      requestKey,
    },
  });
  await auditHr(tx, actor, {
    action: 'hr.review.create',
    entityType: 'hr_performance_review',
    entityId: row.id,
    changes: {
      period: input.period,
      objectives: input.objectives.length,
      reviewer_id: reviewerId,
    },
  });
  return row.id;
}
