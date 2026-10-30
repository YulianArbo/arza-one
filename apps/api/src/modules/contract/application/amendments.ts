import { Inject, Injectable } from '@nestjs/common';
import {
  CONTRACT_KINDS,
  IN_FORCE_STATUSES,
  contractKindSchema,
  type AmendmentDecisionRequest,
  type CreateAmendmentRequest,
  type RegisterSignatureRequest,
  type RenewContractRequest,
} from '@arza/contracts';
import { printedDate } from '@arza/templates';

import type { CtrAmendment, CtrContract } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { APPROVAL_ACTIONS } from '../domain/contract-flows.js';
import {
  amendmentAudit,
  approveAmendment,
  findAmendment,
  returnAmendment,
  startAmendmentApproval,
} from './amendment-flow.js';
import { assertNotAuthor, closeApprovalTask } from './contract-flow.js';
import { datesInvalid, pdfNotReady, statusInvalid } from './contract-messages.js';
import { assertContractStatus, contractAudit, findContract } from './contract-records.js';
import {
  contractActorOf,
  recordContractChange,
  type ContractActor,
  type ContractRequester,
  type ContractTarget,
} from './contract-support.js';
import { assertSignedCopy } from './signed-copy.js';

// Otrosíes y prórrogas de un contrato vigente (B24, ficha 17.7). El otrosí lo elabora Comercial y
// lo aprueba la Dirección; la prórroga la decide la Dirección. Los dos tienen su PDF y rigen al
// registrar su copia firmada: entonces cambian la fecha de fin o el valor del contrato.

const NOT_IN_FORCE = 'Solo un contrato vigente tiene otrosíes y prórrogas.';

/** Un otrosí de un contrato: el registro y la versión que se vio. */
export interface AmendmentTarget extends ContractTarget {
  readonly contractId: string;
}

async function nextCode(tx: TenantTransaction, contract: CtrContract) {
  const sequence = (await tx.ctrAmendment.count({ where: { contractId: contract.id } })) + 1;
  return { sequence, code: `${contract.code}-OT${String(sequence).padStart(2, '0')}` };
}

function assertNewEnd(contract: CtrContract, newEndsOn: string | null, effectiveOn: string) {
  if (effectiveOn < toCalendarDate(contract.startsOn)) {
    throw datesInvalid('El otrosí no puede regir antes del inicio del contrato.');
  }
  if (newEndsOn !== null && newEndsOn < effectiveOn) {
    throw datesInvalid('La nueva fecha de fin debe ser igual o posterior a la fecha en que rige.');
  }
}

function extensionText(contract: CtrContract, input: RenewContractRequest): string {
  const kind = CONTRACT_KINDS[contractKindSchema.parse(contract.kind)].toLowerCase();
  return `Las partes acuerdan prorrogar el ${kind} ${contract.code} hasta el ${printedDate(input.new_ends_on)}, en las mismas condiciones pactadas. Motivo: ${input.summary}`;
}

@Injectable()
export class AmendmentsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ContractActor {
    return contractActorOf(principal, meta, this.clock.now());
  }

  /** Otrosí nuevo: queda en revisión y la Dirección recibe la tarea de aprobarlo. */
  async create(
    principal: Principal,
    contractId: string,
    input: CreateAmendmentRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const contract = await findContract(tx, contractId);
      assertContractStatus(contract, IN_FORCE_STATUSES, NOT_IN_FORCE);
      assertNewEnd(contract, input.new_ends_on, input.effective_on);
      const amendment = await tx.ctrAmendment.create({
        data: {
          tenantId: actor.tenantId,
          contractId,
          ...(await nextCode(tx, contract)),
          kind: 'amendment',
          status: 'in_review',
          summary: input.summary,
          body: input.body,
          effectiveOn: fromCalendarDate(input.effective_on),
          newEndsOn: input.new_ends_on === null ? null : fromCalendarDate(input.new_ends_on),
          newValue: input.new_value,
        },
      });
      await startAmendmentApproval(tx, actor, amendment);
      await this.recordCreated(tx, actor, amendment, contract, 'contract.amendment.create');
      return amendment.id;
    });
  }

  /** Prórroga decidida por la Dirección: nace aprobada y rige al registrar la firmada. */
  async renew(
    principal: Principal,
    contractId: string,
    input: RenewContractRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const contract = await findContract(tx, contractId);
      assertContractStatus(contract, IN_FORCE_STATUSES, NOT_IN_FORCE);
      if (input.new_ends_on <= toCalendarDate(contract.endsOn)) {
        throw datesInvalid('La nueva fecha de fin debe ser posterior a la fecha de fin actual.');
      }
      const amendment = await tx.ctrAmendment.create({
        data: {
          tenantId: actor.tenantId,
          contractId,
          ...(await nextCode(tx, contract)),
          kind: 'extension',
          status: 'approved',
          summary: input.summary,
          body: extensionText(contract, input),
          effectiveOn: fromCalendarDate(bogotaToday(actor.at)),
          newEndsOn: fromCalendarDate(input.new_ends_on),
          decidedBy: actor.userId,
          decidedAt: actor.at,
          pdfStatus: 'pending',
        },
      });
      await this.recordCreated(tx, actor, amendment, contract, 'contract.renew');
      return amendment.id;
    });
  }

  private async recordCreated(
    tx: TenantTransaction,
    actor: ContractActor,
    amendment: CtrAmendment,
    contract: CtrContract,
    action: string,
  ): Promise<void> {
    await recordContractChange(tx, actor, {
      action,
      event: amendment.kind === 'extension' ? 'contract.renewed' : 'contract.amendment.submitted',
      entityType: 'ctr_amendment',
      entityId: amendment.id,
      changes: {
        ...amendmentAudit(amendment),
        contract: contract.code,
        new_ends_on: amendment.newEndsOn === null ? null : toCalendarDate(amendment.newEndsOn),
      },
      payload: { code: amendment.code, contract_id: contract.id },
    });
  }

  async approve(
    requester: ContractRequester,
    target: AmendmentTarget,
    input: AmendmentDecisionRequest,
  ): Promise<void> {
    await this.decide(requester, target, APPROVAL_ACTIONS.approve, input.comment);
  }

  async returnToAuthor(
    requester: ContractRequester,
    target: AmendmentTarget,
    input: AmendmentDecisionRequest,
  ): Promise<void> {
    await this.decide(requester, target, APPROVAL_ACTIONS.return, input.comment);
  }

  private async decide(
    requester: ContractRequester,
    target: AmendmentTarget,
    action: string,
    comment: string | null,
  ): Promise<void> {
    const actor = this.actor(requester.principal, requester.meta);
    await this.database.withTenant(requester.principal, async (tx) => {
      const amendment = await findAmendment(tx, target.contractId, target.id);
      if (amendment.version !== target.version) throw versionConflict();
      if (amendment.status !== 'in_review')
        throw statusInvalid('El otrosí no está esperando aprobación.');
      assertNotAuthor(amendment, actor.userId, null, 'el otrosí');
      if (action === APPROVAL_ACTIONS.approve) {
        await approveAmendment(tx, actor, amendment, comment);
      } else {
        await returnAmendment(tx, actor, amendment, comment ?? 'Devuelto para corregir.');
      }
      await closeApprovalTask(tx, actor, requester, amendment.workflowInstanceId, {
        action,
        comment,
      });
    });
  }

  /** Copia firmada del otrosí: rige y cambia la fecha de fin o el valor del contrato. */
  async registerSignature(
    principal: Principal,
    target: AmendmentTarget,
    input: RegisterSignatureRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const contract = await findContract(tx, target.contractId);
      assertContractStatus(contract, IN_FORCE_STATUSES, NOT_IN_FORCE);
      const amendment = await findAmendment(tx, contract.id, target.id);
      if (amendment.status !== 'approved') {
        throw statusInvalid('Solo se registra la firma de un otrosí aprobado.');
      }
      if (amendment.pdfStatus !== 'ready') throw pdfNotReady();
      const decided = bogotaToday(amendment.decidedAt ?? actor.at);
      await assertSignedCopy(tx, principal, input, {
        notBefore: decided,
        today: bogotaToday(actor.at),
      });
      const { count } = await tx.ctrAmendment.updateMany({
        where: { id: amendment.id, version: target.version, status: 'approved' },
        data: {
          status: 'signed',
          signedFileId: input.file_id,
          signedOn: fromCalendarDate(input.signed_on),
          signedBy: actor.userId,
        },
      });
      if (count === 0) throw versionConflict();
      await this.apply(tx, actor, contract, amendment, input);
    });
  }

  /** El otrosí firmado rige: cambia el contrato y, con un nuevo fin, reinicia las alertas. */
  private async apply(
    tx: TenantTransaction,
    actor: ContractActor,
    contract: CtrContract,
    amendment: CtrAmendment,
    input: RegisterSignatureRequest,
  ): Promise<void> {
    const newEnd = amendment.newEndsOn;
    await tx.ctrContract.update({
      where: { id: contract.id },
      data: {
        endsOn: newEnd ?? contract.endsOn,
        value: amendment.newValue ?? contract.value,
        ...(newEnd === null ? {} : { status: 'active', lastAlertDays: null }),
      },
    });
    const after = await findContract(tx, contract.id);
    await recordContractChange(tx, actor, {
      action: 'contract.amendment.signature.register',
      event: 'contract.amended',
      entityType: 'ctr_amendment',
      entityId: amendment.id,
      changes: {
        ...amendmentAudit(amendment),
        status: ['approved', 'signed'],
        signed_file_id: input.file_id,
        signed_on: input.signed_on,
        contract_before: contractAudit(contract),
        contract_after: contractAudit(after),
      },
      payload: { code: amendment.code, contract_id: contract.id },
    });
  }
}
