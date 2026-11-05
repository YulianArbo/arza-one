import { Inject, Injectable } from '@nestjs/common';
import type { CompleteObligationRequest, ObligationRequest } from '@arza/contracts';

import type { CtrObligation } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { contractNotFound, statusInvalid } from './contract-messages.js';
import { assertContractStatus, findContract } from './contract-records.js';
import {
  contractActorOf,
  recordContractChange,
  responsibleFor,
  type ContractActor,
} from './contract-support.js';

// Obligaciones e hitos de un contrato (B24, ficha 17.7), cada uno con su responsable y su fecha.
// Se registran desde el borrador y mientras el contrato rige; el worker avisa al responsable 7 días
// antes y marca vencida la que pasó su fecha sin cumplirse.

const OPEN_CONTRACT = 'Las obligaciones se registran en un contrato que no ha terminado.';

/** Una obligación de un contrato: el registro y la versión que se vio. */
export interface ObligationTarget {
  readonly contractId: string;
  readonly id: string;
  readonly version: number;
}

function obligationAudit(obligation: CtrObligation): Record<string, string | null> {
  return {
    description: obligation.description,
    responsible_id: obligation.responsibleId,
    due_on: toCalendarDate(obligation.dueOn),
    status: obligation.status,
  };
}

async function findObligation(tx: TenantTransaction, target: ObligationTarget) {
  const obligation = await tx.ctrObligation.findFirst({
    where: { id: target.id, contractId: target.contractId, deletedAt: null },
  });
  if (obligation === null) throw contractNotFound('La obligación');
  return obligation;
}

@Injectable()
export class ObligationsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ContractActor {
    return contractActorOf(principal, meta, this.clock.now());
  }

  async create(
    principal: Principal,
    contractId: string,
    input: ObligationRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const contract = await findContract(tx, contractId);
      assertContractStatus(
        contract,
        ['draft', 'in_review', 'approved', 'active', 'expiring'],
        OPEN_CONTRACT,
      );
      const responsibleId = await responsibleFor(tx, actor, input.responsible_id);
      const obligation = await tx.ctrObligation.create({
        data: {
          tenantId: actor.tenantId,
          contractId,
          description: input.description,
          responsibleId: responsibleId ?? input.responsible_id,
          dueOn: fromCalendarDate(input.due_on),
        },
      });
      await recordContractChange(tx, actor, {
        action: 'contract.obligation.create',
        event: 'contract.obligation.created',
        entityType: 'ctr_obligation',
        entityId: obligation.id,
        changes: { contract: contract.code, ...obligationAudit(obligation) },
        payload: { contract_id: contractId, responsible_id: obligation.responsibleId },
      });
      return obligation.id;
    });
  }

  /** Cambia una pendiente o vencida; cambiar la fecha vuelve a avisar 7 días antes. */
  async update(
    principal: Principal,
    target: ObligationTarget,
    input: ObligationRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findObligation(tx, target);
      if (before.status === 'done') throw statusInvalid('Una obligación cumplida ya no cambia.');
      const responsibleId =
        (await responsibleFor(tx, actor, input.responsible_id)) ?? input.responsible_id;
      const dueChanged = toCalendarDate(before.dueOn) !== input.due_on;
      const { count } = await tx.ctrObligation.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: {
          description: input.description,
          responsibleId,
          dueOn: fromCalendarDate(input.due_on),
          ...(dueChanged ? { status: 'pending', remindedAt: null } : {}),
        },
      });
      if (count === 0) throw versionConflict();
      const after = await findObligation(tx, target);
      await recordContractChange(tx, actor, {
        action: 'contract.obligation.update',
        event: 'contract.obligation.updated',
        entityType: 'ctr_obligation',
        entityId: target.id,
        changes: changesBetween(obligationAudit(before), obligationAudit(after)),
        payload: { contract_id: target.contractId, responsible_id: responsibleId },
      });
    });
  }

  async complete(
    principal: Principal,
    target: ObligationTarget,
    input: CompleteObligationRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findObligation(tx, target);
      if (before.status === 'done') throw statusInvalid('La obligación ya está cumplida.');
      const { count } = await tx.ctrObligation.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: { status: 'done', doneAt: actor.at, doneBy: actor.userId, doneNote: input.note },
      });
      if (count === 0) throw versionConflict();
      await recordContractChange(tx, actor, {
        action: 'contract.obligation.complete',
        event: 'contract.obligation.completed',
        entityType: 'ctr_obligation',
        entityId: target.id,
        changes: { ...obligationAudit(before), status: [before.status, 'done'], note: input.note },
        payload: { contract_id: target.contractId, responsible_id: before.responsibleId },
      });
    });
  }
}
