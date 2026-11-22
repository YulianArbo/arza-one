import { Inject, Injectable } from '@nestjs/common';
import type { ExecuteQmsAction, VerifyQmsAction } from '@arza/contracts';

import type { QmsAction } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import type { QmsViewer } from './nonconformities.js';
import {
  assertFile,
  auditQms,
  emitQms,
  qmsActorOf,
  qmsConflict,
  qmsInvalid,
  qmsNotFound,
  qualityLeaders,
  selfVerification,
  type QmsActor,
  type Target,
} from './qms-support.js';

// Ejecutar y verificar una acción (B38, decisión 8). La marca ejecutada su responsable (o Calidad)
// con la evidencia; verifica su eficacia alguien distinto del responsable y de quien la ejecutó.
// Una acción no eficaz reabre su no conformidad; cuando todas las de una no conformidad con plan
// resultan eficaces, la no conformidad queda verificada y lista para cerrarse.

function assertPast(date: string, at: Date, label: string): void {
  if (date > bogotaToday(at)) throw qmsInvalid(`La fecha de ${label} no puede ser futura.`);
}

async function moveNonconformity(
  tx: TenantTransaction,
  actor: QmsActor,
  nonconformityId: string,
  change: { readonly status: 'verified' | 'reopened'; readonly reason: string | null },
): Promise<void> {
  const nc = await tx.qmsNonconformity.findFirst({ where: { id: nonconformityId } });
  if (nc?.status !== 'planned') return;
  await tx.qmsNonconformity.update({
    where: { id: nc.id },
    data: {
      status: change.status,
      ...(change.reason === null ? {} : { reopenReason: change.reason }),
    },
  });
  const step = change.status === 'verified' ? 'verify' : 'reopen';
  await auditQms(tx, actor, {
    action: `qms.nonconformity.${step}`,
    entityType: 'qms_nonconformity',
    entityId: nc.id,
    changes: { code: nc.code, status: [nc.status, change.status], by: 'action_verification' },
  });
  await emitQms(tx, actor, `qms.nonconformity.${step}`, {
    nonconformity_id: nc.id,
    code: nc.code,
    status: change.status,
  });
}

/** Lo que la verificación de una acción produce en su no conformidad. */
async function followUp(
  tx: TenantTransaction,
  actor: QmsActor,
  action: QmsAction,
  effective: boolean,
) {
  if (action.nonconformityId === null) return;
  if (!effective) {
    const reason = `La acción ${action.code} no fue eficaz.`;
    await moveNonconformity(tx, actor, action.nonconformityId, { status: 'reopened', reason });
    return;
  }
  const pending = await tx.qmsAction.count({
    where: {
      nonconformityId: action.nonconformityId,
      status: { in: ['open', 'executed'] },
      deletedAt: null,
    },
  });
  if (pending > 0) return;
  await moveNonconformity(tx, actor, action.nonconformityId, { status: 'verified', reason: null });
}

/** La huella de la ejecución y el aviso a Calidad para que alguien verifique. */
async function recordExecution(
  tx: TenantTransaction,
  actor: QmsActor,
  row: QmsAction,
  facts: { readonly on: string; readonly manager: boolean },
): Promise<void> {
  await auditQms(tx, actor, {
    action: 'qms.action.execute',
    entityType: 'qms_action',
    entityId: row.id,
    changes: {
      code: row.code,
      executed_on: facts.on,
      by: facts.manager ? 'quality' : 'responsible',
    },
  });
  const verifiers = await qualityLeaders(tx, actor.at);
  await emitQms(tx, actor, 'qms.action.executed', {
    action_id: row.id,
    code: row.code,
    recipients: verifiers.filter((id) => id !== row.responsibleId),
  });
}

@Injectable()
export class ActionSteps {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Su responsable o Calidad la marca ejecutada, con la evidencia. */
  async execute(
    viewer: QmsViewer,
    meta: RequestMeta,
    target: Target,
    input: ExecuteQmsAction,
  ): Promise<void> {
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    assertPast(input.executed_on, actor.at, 'ejecución');
    const manager = hasUnconditionalPermission(viewer.ability, 'qms.action.manage');
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await tx.qmsAction.findFirst({
        where: {
          id: target.id,
          deletedAt: null,
          ...(manager ? {} : { responsibleId: actor.userId }),
        },
      });
      if (row === null) throw qmsNotFound('La acción no existe.');
      if (row.status !== 'open') throw qmsConflict('La acción ya está ejecutada.');
      await assertFile(tx, viewer.principal, input.evidence_file_id);
      const updated = await tx.qmsAction.updateMany({
        where: { id: row.id, version: target.version, status: 'open' },
        data: {
          status: 'executed',
          executedOn: fromCalendarDate(input.executed_on),
          executedBy: actor.userId,
          evidenceNote: input.evidence_note,
          evidenceFileId: input.evidence_file_id,
        },
      });
      if (updated.count !== 1) throw versionConflict();
      await recordExecution(tx, actor, row, { on: input.executed_on, manager });
    });
  }

  /** Verificación de eficacia por un tercero (decisión 8). */
  async verify(
    viewer: QmsViewer,
    meta: RequestMeta,
    target: Target,
    input: VerifyQmsAction,
  ): Promise<void> {
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    assertPast(input.verified_on, actor.at, 'verificación');
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await tx.qmsAction.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('La acción no existe.');
      if (row.status !== 'executed') throw qmsConflict('Solo se verifica una acción ejecutada.');
      if (actor.userId === row.responsibleId || actor.userId === row.executedBy) {
        throw selfVerification();
      }
      const status = input.effective ? 'effective' : 'ineffective';
      const updated = await tx.qmsAction.updateMany({
        where: { id: row.id, version: target.version, status: 'executed' },
        data: {
          status,
          verifiedOn: fromCalendarDate(input.verified_on),
          verifiedBy: actor.userId,
          verificationNote: input.note,
        },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.action.verify',
        entityType: 'qms_action',
        entityId: row.id,
        changes: { code: row.code, status: ['executed', status] },
      });
      await followUp(tx, actor, row, input.effective);
    });
  }
}
