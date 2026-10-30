import { Inject, Injectable } from '@nestjs/common';
import type {
  ApproveContractRequest,
  CreateContractRequest,
  RegisterSignatureRequest,
  ReturnContractRequest,
  TerminateContractRequest,
  UpdateContractRequest,
} from '@arza/contracts';

import type { CtrContract } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { needsReview } from '../domain/clause-composition.js';
import { APPROVAL_ACTIONS } from '../domain/contract-flows.js';
import { registerContractSignature, terminateContract } from './contract-closing.js';
import { generateContract, saveDraft } from './contract-drafts.js';
import {
  approveContract,
  assertNotAuthor,
  closeApprovalTask,
  returnContract,
  startContractApproval,
} from './contract-flow.js';
import { reviewIncomplete } from './contract-messages.js';
import {
  assertContractStatus,
  contractAudit,
  contractEventPayload,
  findContract,
  updateContractVersioned,
} from './contract-records.js';
import {
  contractActorOf,
  recordContractChange,
  type ContractActor,
  type ContractRequester,
  type ContractTarget,
} from './contract-support.js';

const DRAFT_ONLY = 'Solo un borrador se edita. Un contrato aprobado no cambia: use un otrosí.';

/** Contratos (B24, ficha 17.7): borrador, revisión de la Dirección, firma y terminación. */
@Injectable()
export class ContractsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ContractActor {
    return contractActorOf(principal, meta, this.clock.now());
  }

  /** Genera el contrato desde la plantilla: idéntico al modelo salvo las variables. */
  async create(
    principal: Principal,
    input: CreateContractRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, (tx) => generateContract(tx, actor, input));
  }

  /** Guarda el borrador completo: los datos y las cláusulas. */
  async update(
    principal: Principal,
    target: ContractTarget,
    input: UpdateContractRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findContract(tx, target.id);
      assertContractStatus(before, ['draft'], DRAFT_ONLY);
      await saveDraft(tx, actor, before, target, input);
    });
  }

  /** Pide la revisión: la Dirección recibe la tarea de aprobarlo en Mis tareas. */
  async submit(principal: Principal, target: ContractTarget, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const contract = await findContract(tx, target.id);
      assertContractStatus(contract, ['draft'], 'Solo se pide la revisión de un borrador.');
      await updateContractVersioned(tx, target, {
        status: 'in_review',
        submittedAt: actor.at,
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      });
      await startContractApproval(tx, actor, contract);
      await recordContractChange(tx, actor, {
        action: 'contract.submit',
        event: 'contract.submitted',
        entityType: 'ctr_contract',
        entityId: contract.id,
        changes: {
          ...contractAudit(contract),
          status: ['draft', 'in_review'],
          has_modified_clauses: contract.hasModifiedClauses,
        },
        payload: contractEventPayload(contract),
      });
    });
  }

  /** La Dirección aprueba desde la ficha; si hay cláusulas modificadas, las revisó todas. */
  async approve(
    requester: ContractRequester,
    target: ContractTarget,
    input: ApproveContractRequest,
  ): Promise<void> {
    const actor = this.actor(requester.principal, requester.meta);
    await this.database.withTenant(requester.principal, async (tx) => {
      const contract = await this.decidable(tx, actor, target);
      await this.assertReviewed(tx, contract, input.reviewed_clause_ids);
      await approveContract(tx, actor, contract, {
        comment: input.comment,
        legalNote: input.legal_note,
        reviewed: input.reviewed_clause_ids,
      });
      await closeApprovalTask(tx, actor, requester, contract.workflowInstanceId, {
        action: APPROVAL_ACTIONS.approve,
        comment: input.comment,
      });
    });
  }

  async returnToDraft(
    requester: ContractRequester,
    target: ContractTarget,
    input: ReturnContractRequest,
  ): Promise<void> {
    const actor = this.actor(requester.principal, requester.meta);
    await this.database.withTenant(requester.principal, async (tx) => {
      const contract = await this.decidable(tx, actor, target);
      await returnContract(tx, actor, contract, input.comment);
      await closeApprovalTask(tx, actor, requester, contract.workflowInstanceId, {
        action: APPROVAL_ACTIONS.return,
        comment: input.comment,
      });
    });
  }

  private async decidable(
    tx: TenantTransaction,
    actor: ContractActor,
    target: ContractTarget,
  ): Promise<CtrContract> {
    const contract = await findContract(tx, target.id);
    if (contract.version !== target.version) throw versionConflict();
    assertContractStatus(contract, ['in_review'], 'El contrato no está esperando aprobación.');
    assertNotAuthor(contract, actor.userId, null, 'el contrato');
    return contract;
  }

  /** Cada cláusula modificada o nueva está entre las revisadas, y no sobra ninguna. */
  private async assertReviewed(
    tx: TenantTransaction,
    contract: CtrContract,
    reviewed: readonly string[],
  ): Promise<void> {
    const clauses = await tx.ctrContractClause.findMany({
      where: { contractId: contract.id, deletedAt: null },
      select: { id: true, origin: true },
    });
    const pending = clauses.filter(needsReview).map((clause) => clause.id);
    const given = new Set(reviewed);
    if (given.size !== pending.length || pending.some((id) => !given.has(id))) {
      throw reviewIncomplete();
    }
  }

  /** Firma manuscrita digitalizada: la copia firmada por todos y el contrato queda vigente. */
  async registerSignature(
    principal: Principal,
    target: ContractTarget,
    input: RegisterSignatureRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, (tx) =>
      registerContractSignature(tx, actor, principal, target, input),
    );
  }

  /** Terminación anticipada por la Dirección, con su fecha y su motivo. */
  async terminate(
    principal: Principal,
    target: ContractTarget,
    input: TerminateContractRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, (tx) => terminateContract(tx, actor, target, input));
  }
}
