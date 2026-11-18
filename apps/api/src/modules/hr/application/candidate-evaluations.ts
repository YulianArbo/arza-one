import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HR_ERROR_CODES, type AddSelectionEvaluation } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';

interface EvaluationTarget {
  readonly candidateId: string;
  readonly requestKey: string;
}

interface EvaluationAuthor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
}

/** Bloquea por clave de petición para que un reintento no duplique la evaluación. */
async function lockRequest(
  tx: TenantTransaction,
  tenantId: string,
  requestKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr.evaluation:${tenantId}:${requestKey}`}, 0))`;
}

/** Devuelve la evaluación previa si la petición repite los mismos datos. */
async function replayedEvaluation(
  tx: TenantTransaction,
  author: EvaluationAuthor,
  target: EvaluationTarget,
  input: AddSelectionEvaluation,
): Promise<string | null> {
  const existing = await tx.hrSelectionEvaluation.findUnique({
    where: { tenantId_requestKey: { tenantId: author.tenantId, requestKey: target.requestKey } },
  });
  if (existing === null) return null;
  const same =
    existing.candidateId === target.candidateId &&
    existing.evaluatorId === author.userId &&
    existing.kind === input.kind &&
    existing.score === input.score &&
    existing.note === input.note &&
    toCalendarDate(existing.evaluatedOn) === input.evaluated_on;
  if (!same) throw idempotencyKeyReused();
  return existing.id;
}

/** Verifica que la candidatura exista, esté en evaluación y la fecha sea coherente. */
async function assertEvaluable(
  tx: TenantTransaction,
  author: EvaluationAuthor,
  target: EvaluationTarget,
  input: AddSelectionEvaluation,
): Promise<void> {
  const rows = await tx.$queryRaw<{ stage: string; applied_on: Date }[]>`
    SELECT stage, applied_on FROM hr_candidates
    WHERE id = ${target.candidateId}::uuid AND tenant_id = ${author.tenantId}::uuid
      AND deleted_at IS NULL
    FOR SHARE
  `;
  const candidate = rows[0];
  if (candidate === undefined) {
    throw new AppError(
      HttpStatus.NOT_FOUND,
      HR_ERROR_CODES.recordNotFound,
      'La candidatura no existe.',
    );
  }
  if (candidate.stage !== 'evaluating') {
    throw new AppError(
      HttpStatus.CONFLICT,
      HR_ERROR_CODES.statusInvalid,
      'La candidatura debe estar en evaluación.',
    );
  }
  if (
    input.evaluated_on < toCalendarDate(candidate.applied_on) ||
    input.evaluated_on > bogotaToday(author.at)
  ) {
    throw new AppError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      HR_ERROR_CODES.recordInvalid,
      'Revise la fecha de la evaluación.',
    );
  }
}

/** Registra la evaluación y su evento de auditoría. */
async function storeEvaluation(
  tx: TenantTransaction,
  author: EvaluationAuthor,
  target: EvaluationTarget,
  input: AddSelectionEvaluation,
): Promise<string> {
  const evaluation = await tx.hrSelectionEvaluation.create({
    data: {
      tenantId: author.tenantId,
      candidateId: target.candidateId,
      requestKey: target.requestKey,
      kind: input.kind,
      evaluatedOn: fromCalendarDate(input.evaluated_on),
      score: input.score,
      note: input.note,
      evaluatorId: author.userId,
    },
    select: { id: true },
  });
  await recordAuditEvent(tx, {
    tenantId: author.tenantId,
    occurredAt: author.at,
    actor: { kind: 'user', id: author.userId },
    action: 'hr.candidate.evaluate',
    entityType: 'hr_candidate',
    entityId: target.candidateId,
    result: 'success',
    changes: { evaluation_id: evaluation.id, kind: input.kind },
    meta: author.meta,
  });
  return evaluation.id;
}

@Injectable()
export class CandidateEvaluations {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    principal: Principal,
    meta: RequestMeta,
    target: EvaluationTarget,
    input: AddSelectionEvaluation,
  ): Promise<string> {
    const author = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      await lockRequest(tx, principal.tenantId, target.requestKey);
      const replayed = await replayedEvaluation(tx, author, target, input);
      if (replayed !== null) return replayed;
      await assertEvaluable(tx, author, target, input);
      return storeEvaluation(tx, author, target, input);
    });
  }
}
