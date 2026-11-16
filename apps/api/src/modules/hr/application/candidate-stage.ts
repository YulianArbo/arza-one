import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CANDIDATE_RETENTION_MONTHS,
  candidateStageSchema,
  HR_ERROR_CODES,
  NEXT_STAGE,
  OPEN_CANDIDATE_STAGES,
  type CandidateStage,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';

type StageChange =
  | { readonly kind: 'advance'; readonly note: string | null }
  | { readonly kind: 'discard'; readonly reason: string };

interface StageActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
}

function retentionDate(discardedOn: Date): Date {
  const year = discardedOn.getUTCFullYear();
  const month = discardedOn.getUTCMonth() + CANDIDATE_RETENTION_MONTHS;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(discardedOn.getUTCDate(), lastDay)));
}

/** Candidatura vigente con la versión esperada por el cliente. */
async function loadCandidate(
  tx: TenantTransaction,
  tenantId: string,
  target: { readonly id: string; readonly version: number },
): Promise<{ readonly id: string; readonly stage: string }> {
  const candidate = await tx.hrCandidate.findFirst({
    where: { tenantId, id: target.id, deletedAt: null },
  });
  if (candidate === null) {
    throw new AppError(
      HttpStatus.NOT_FOUND,
      HR_ERROR_CODES.recordNotFound,
      'La candidatura no existe.',
    );
  }
  if (candidate.version !== target.version) throw versionConflict();
  return candidate;
}

/** Un descarte no puede dejar una vinculación pendiente huérfana. */
async function assertDiscardable(
  tx: TenantTransaction,
  tenantId: string,
  candidateId: string,
  kind: StageChange['kind'],
): Promise<void> {
  if (kind !== 'discard') return;
  const pending = await tx.hrEmployee.count({
    where: { tenantId, candidateId, status: 'pending', deletedAt: null },
  });
  if (pending === 0) return;
  throw new AppError(
    HttpStatus.CONFLICT,
    HR_ERROR_CODES.statusInvalid,
    'Anule la vinculación pendiente antes de descartar la candidatura.',
  );
}

/** Etapa destino del cambio, validando que la transición exista. */
function resolveNextStage(kind: StageChange['kind'], previous: CandidateStage): CandidateStage {
  const next = kind === 'advance' ? NEXT_STAGE[previous] : 'discarded';
  if (next === undefined || !OPEN_CANDIDATE_STAGES.includes(previous)) {
    throw new AppError(
      HttpStatus.CONFLICT,
      HR_ERROR_CODES.statusInvalid,
      'La candidatura no admite ese cambio de etapa.',
    );
  }
  return next;
}

/** Actualización condicional por versión y etapa, con su evento de auditoría. */
async function applyStageChange(
  tx: TenantTransaction,
  actor: StageActor,
  target: { readonly id: string; readonly version: number },
  input: StageChange,
  previous: CandidateStage,
  next: CandidateStage,
): Promise<void> {
  const discardedOn = fromCalendarDate(bogotaToday(actor.at));
  const result = await tx.hrCandidate.updateMany({
    where: {
      tenantId: actor.tenantId,
      id: target.id,
      deletedAt: null,
      version: target.version,
      stage: previous,
    },
    data:
      input.kind === 'discard'
        ? {
            stage: next,
            discardedOn,
            discardReason: input.reason,
            retentionUntil: retentionDate(discardedOn),
          }
        : { stage: next },
  });
  if (result.count !== 1) throw versionConflict();
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: `hr.candidate.${input.kind}`,
    entityType: 'hr_candidate',
    entityId: target.id,
    result: 'success',
    changes: { stage: { from: previous, to: next } },
    meta: actor.meta,
  });
}

@Injectable()
export class CandidateStageUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async change(
    principal: Principal,
    meta: RequestMeta,
    target: { readonly id: string; readonly version: number },
    input: StageChange,
  ): Promise<void> {
    const actor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const candidate = await loadCandidate(tx, actor.tenantId, target);
      await assertDiscardable(tx, actor.tenantId, candidate.id, input.kind);
      const previous = candidateStageSchema.parse(candidate.stage);
      const next = resolveNextStage(input.kind, previous);
      await applyStageChange(tx, actor, target, input, previous, next);
    });
  }
}
