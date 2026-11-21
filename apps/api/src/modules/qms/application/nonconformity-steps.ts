import { Inject, Injectable } from '@nestjs/common';
import {
  canNonconformityStep,
  NONCONFORMITY_STATUSES,
  nonconformityStatusSchema,
  type AnalyzeNonconformity,
  type CloseNonconformity,
  type ContainNonconformity,
  type NonconformityStep,
  type ReopenNonconformity,
} from '@arza/contracts';

import type { Prisma, QmsNonconformity } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import {
  assertProcess,
  auditQms,
  emitQms,
  qmsActorOf,
  qmsConflict,
  qmsInvalid,
  qmsNotFound,
  type QmsActor,
  type Target,
} from './qms-support.js';

// Los pasos de la no conformidad (B38, ficha 17.15): contener (corrección inmediata, clasificación
// y proceso), analizar la causa (decisión 7), registrar el plan (al menos una acción vigente),
// cerrar como eficaz o reabrir. «Verificada» llega sola al verificar la última acción.

interface Step {
  readonly step: NonconformityStep;
  readonly data: Prisma.QmsNonconformityUpdateManyMutationInput;
  readonly changes: Prisma.InputJsonObject;
}

export async function findNonconformity(
  tx: TenantTransaction,
  id: string,
): Promise<QmsNonconformity> {
  const row = await tx.qmsNonconformity.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw qmsNotFound('La no conformidad no existe.');
  return row;
}

function assertStep(row: QmsNonconformity, step: NonconformityStep): void {
  const status = nonconformityStatusSchema.parse(row.status);
  if (!canNonconformityStep(step, status)) {
    throw qmsConflict(`Una no conformidad «${NONCONFORMITY_STATUSES[status]}» no admite ese paso.`);
  }
}

async function applyStep(
  tx: TenantTransaction,
  actor: QmsActor,
  row: QmsNonconformity,
  version: number,
  step: Step,
): Promise<void> {
  assertStep(row, step.step);
  const updated = await tx.qmsNonconformity.updateMany({
    where: { id: row.id, version, status: row.status },
    data: step.data,
  });
  if (updated.count !== 1) throw versionConflict();
  const after = typeof step.data.status === 'string' ? step.data.status : row.status;
  await auditQms(tx, actor, {
    action: `qms.nonconformity.${step.step}`,
    entityType: 'qms_nonconformity',
    entityId: row.id,
    changes: { code: row.code, status: [row.status, after], ...step.changes },
  });
  await emitQms(tx, actor, `qms.nonconformity.${step.step}`, {
    nonconformity_id: row.id,
    code: row.code,
    status: after,
  });
}

function assertNotFuture(date: string, at: Date, label: string): void {
  if (date > bogotaToday(at)) throw qmsInvalid(`La fecha de ${label} no puede ser futura.`);
}

@Injectable()
export class NonconformitySteps {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async contain(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: ContainNonconformity,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      assertNotFuture(input.contained_on, actor.at, 'contención');
      await assertProcess(tx, input.process_id);
      await applyStep(tx, actor, row, target.version, {
        step: 'contain',
        data: {
          status: 'contained',
          classification: input.classification,
          processId: input.process_id,
          containment: input.containment,
          containedOn: fromCalendarDate(input.contained_on),
          containedBy: actor.userId,
        },
        changes: { classification: input.classification, process_id: input.process_id },
      });
    });
  }

  async analyze(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: AnalyzeNonconformity,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      await applyStep(tx, actor, row, target.version, {
        step: 'analyze',
        data: {
          status: 'analyzing',
          analysis: input.analysis,
          rootCause: input.root_cause,
          analyzedBy: actor.userId,
        },
        changes: { method: input.analysis.method },
      });
    });
  }

  /** Con plan: la causa raíz y al menos una acción abierta o ejecutada. */
  async plan(principal: Principal, meta: RequestMeta, target: Target): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      assertStep(row, 'plan');
      const live = await tx.qmsAction.count({
        where: { nonconformityId: row.id, status: { in: ['open', 'executed'] }, deletedAt: null },
      });
      if (live === 0) throw qmsInvalid('Registre al menos una acción con responsable y fecha.');
      await applyStep(tx, actor, row, target.version, {
        step: 'plan',
        data: { status: 'planned' },
        changes: { actions: live },
      });
    });
  }

  async close(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: CloseNonconformity,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      await applyStep(tx, actor, row, target.version, {
        step: 'close',
        data: {
          status: 'closed',
          closeNote: input.note,
          closedOn: fromCalendarDate(bogotaToday(actor.at)),
          closedBy: actor.userId,
        },
        changes: { note: input.note !== null },
      });
    });
  }

  /** La dirección o Calidad juzga que no fue eficaz: vuelve a análisis con su motivo. */
  async reopen(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: ReopenNonconformity,
  ): Promise<void> {
    await this.run(principal, meta, target, async (tx, actor, row) => {
      await applyStep(tx, actor, row, target.version, {
        step: 'reopen',
        data: { status: 'reopened', reopenReason: input.reason },
        changes: { reason: input.reason },
      });
    });
  }

  private async run(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    work: (tx: TenantTransaction, actor: QmsActor, row: QmsNonconformity) => Promise<void>,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await findNonconformity(tx, target.id);
      if (row.version !== target.version) throw versionConflict();
      await work(tx, actor, row);
    });
  }
}
