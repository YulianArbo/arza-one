import { Inject, Injectable } from '@nestjs/common';
import {
  LOAN_SIGNATURE_DAYS,
  type AssetAssignee,
  type AssignAsset,
  type ReturnAsset,
} from '@arza/contracts';

import type { AstAsset, AstAssignment } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { cancelLoanSignature } from '../../contract/index.js';
import { addDays, bogotaToday, companyIdentity, toCalendarDate } from '../../core/index.js';
import { LOAN_CONTRACT_CODE, recordSystemForm } from '../../doc/index.js';
import { activeCollaborators, type Collaborator } from '../../iam/index.js';
import { signingPerson } from '../../party/index.js';
import { dateProblem, loanContractData } from '../domain/asset-rules.js';
import {
  formUnavailable,
  holderNotReady,
  recordInvalid,
  recordNotFound,
  statusInvalid,
} from './asset-messages.js';
import {
  changeAsset,
  dateColumn,
  findAsset,
  recordAstEvent,
  type AstActor,
} from './asset-support.js';

// Asignación de activos en comodato (B34, ficha 17.12, CT-ADM-001): al asignar se llena el contrato
// y el activo queda reservado; el worker lo envía a firma del colaborador y solo con el contrato
// firmado la asignación queda vigente y el activo «asignado». La devolución lo libera.

const ENTITY = 'ast_assignment';

function nameOf(person: Collaborator): string {
  return person.displayName ?? person.email;
}

/** El colaborador con su persona de Terceros y su documento: lo que exige firmar el comodato. */
async function borrowerOf(tx: TenantTransaction, userId: string) {
  const [collaborator] = await activeCollaborators(tx, [userId]);
  if (collaborator === undefined) throw recordInvalid('Elija un colaborador con la cuenta activa.');
  const person =
    collaborator.partyId === null ? null : await signingPerson(tx, collaborator.partyId);
  const document = person?.document ?? null;
  if (person === null || document === null) throw holderNotReady(nameOf(collaborator));
  return { personId: person.personId, name: person.name, document };
}

async function findAssignment(tx: TenantTransaction, id: string): Promise<AstAssignment> {
  const assignment = await tx.astAssignment.findFirst({ where: { id, deletedAt: null } });
  if (assignment === null) throw recordNotFound('esa asignación');
  return assignment;
}

function sameAssignment(prior: AstAssignment, assetId: string, input: AssignAsset): boolean {
  return prior.assetId === assetId && prior.userId === input.user_id;
}

function assertAssignable(asset: AstAsset, input: AssignAsset, today: string): void {
  if (asset.status !== 'available') {
    throw statusInvalid('Solo se asigna un activo disponible.');
  }
  const limits = { today, notBefore: toCalendarDate(asset.purchaseDate) };
  const problem = dateProblem(input.assigned_on, limits, 'La fecha de entrega');
  if (problem !== null) throw recordInvalid(problem);
}

@Injectable()
export class AssignmentsUseCase {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** A quién se puede asignar: colaboradores activos; listos si ya pueden firmar el comodato. */
  async assignees(principal: Principal): Promise<AssetAssignee[]> {
    return this.database.withTenant(principal, async (tx) => {
      const options: AssetAssignee[] = [];
      for (const person of await activeCollaborators(tx)) {
        const signer = person.partyId === null ? null : await signingPerson(tx, person.partyId);
        const ready = signer !== null && signer.document !== null;
        options.push({ id: person.id, name: nameOf(person), ready });
      }
      return options;
    });
  }

  async assign(actor: AstActor, assetId: string, key: string, input: AssignAsset): Promise<string> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    return this.database.withTenant(scope, async (tx) => {
      const prior = await tx.astAssignment.findFirst({ where: { requestKey: key } });
      if (prior !== null) {
        if (sameAssignment(prior, assetId, input)) return prior.id;
        throw idempotencyKeyReused();
      }
      const asset = await findAsset(tx, assetId);
      const today = bogotaToday(actor.at);
      assertAssignable(asset, input, today);
      const borrower = await borrowerOf(tx, input.user_id);
      const assignment = await tx.astAssignment.create({
        data: {
          tenantId: actor.tenantId,
          assetId,
          userId: input.user_id,
          signerPartyId: borrower.personId,
          assignedOn: dateColumn(input.assigned_on),
          signBy: dateColumn(addDays(today, LOAN_SIGNATURE_DAYS)),
          message: input.message,
          assignedBy: actor.userId ?? input.user_id,
          requestKey: key,
          createdBy: actor.userId,
        },
      });
      const recordCode = await this.fillContract(tx, actor, { asset, assignment, borrower });
      await changeAsset(tx, { id: assetId, status: 'available' }, { status: 'reserved' });
      await recordAstEvent(tx, actor, {
        action: 'asset.assignment.create',
        event: 'ast.assignment.created',
        entityType: ENTITY,
        entityId: assignment.id,
        payload: { asset_id: assetId, code: asset.code, user_id: input.user_id },
        changes: { asset: asset.code, record_code: recordCode, status: 'preparing' },
      });
      return assignment.id;
    });
  }

  /** Llena el CT-ADM-001 con los datos de la asignación; el worker genera su PDF. */
  private async fillContract(
    tx: TenantTransaction,
    actor: AstActor,
    loan: {
      readonly asset: AstAsset;
      readonly assignment: AstAssignment;
      readonly borrower: { readonly name: string; readonly document: string };
    },
  ): Promise<string> {
    const { asset, assignment, borrower } = loan;
    const record = await recordSystemForm(tx, actor, {
      templateCode: LOAN_CONTRACT_CODE,
      entityType: 'ast_assignment',
      entityId: assignment.id,
      data: loanContractData({
        company: await companyIdentity(tx),
        borrower,
        asset: { ...asset, cost: asset.cost.toFixed(2) },
        assignedOn: toCalendarDate(assignment.assignedOn),
      }),
    });
    if (record === null) throw formUnavailable(LOAN_CONTRACT_CODE);
    await tx.astAssignment.update({
      where: { id: assignment.id },
      data: { formRecordId: record.id, recordCode: record.code },
    });
    return record.code;
  }

  /** Anula una asignación que aún no se ha firmado; el activo vuelve a estar disponible. */
  async cancel(actor: AstActor, id: string, version: number, reason: string): Promise<void> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    await this.database.withTenant(scope, async (tx) => {
      const assignment = await findAssignment(tx, id);
      if (assignment.status !== 'preparing' && assignment.status !== 'in_signature') {
        throw statusInvalid('Solo se anula una asignación que aún no se ha firmado.');
      }
      if (assignment.envelopeId !== null) {
        const open = await cancelLoanSignature(tx, actor, assignment.envelopeId, reason);
        if (!open) {
          throw statusInvalid('El comodato ya se firmó o se cerró. Espere un momento y recargue.');
        }
      }
      const { count } = await tx.astAssignment.updateMany({
        where: { id, version, status: assignment.status },
        data: { status: 'cancelled', closedReason: reason },
      });
      if (count === 0) throw versionConflict();
      await changeAsset(
        tx,
        { id: assignment.assetId, status: 'reserved' },
        { status: 'available' },
      );
      await recordAstEvent(tx, actor, {
        action: 'asset.assignment.cancel',
        event: 'ast.assignment.cancelled',
        entityType: ENTITY,
        entityId: id,
        payload: { asset_id: assignment.assetId, user_id: assignment.userId },
        changes: { status: [assignment.status, 'cancelled'], reason },
      });
    });
  }

  /** Devolución de un activo asignado: queda disponible y el comodato, cumplido. */
  async giveBack(actor: AstActor, id: string, version: number, input: ReturnAsset): Promise<void> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    await this.database.withTenant(scope, async (tx) => {
      const assignment = await findAssignment(tx, id);
      if (assignment.status !== 'active') {
        throw statusInvalid('Solo se devuelve un activo con asignación vigente.');
      }
      const today = bogotaToday(actor.at);
      if (input.returned_on > today || input.returned_on < toCalendarDate(assignment.assignedOn)) {
        throw recordInvalid('La devolución no puede ser futura ni anterior a la entrega.');
      }
      const { count } = await tx.astAssignment.updateMany({
        where: { id, version, status: 'active' },
        data: {
          status: 'returned',
          returnedOn: dateColumn(input.returned_on),
          returnNote: input.note,
          returnedBy: actor.userId,
        },
      });
      if (count === 0) throw versionConflict();
      await changeAsset(
        tx,
        { id: assignment.assetId, status: 'assigned' },
        { status: 'available' },
      );
      await recordAstEvent(tx, actor, {
        action: 'asset.assignment.return',
        event: 'ast.assignment.returned',
        entityType: ENTITY,
        entityId: id,
        payload: { asset_id: assignment.assetId, user_id: assignment.userId },
        changes: { status: ['active', 'returned'], returned_on: input.returned_on },
      });
    });
  }
}
