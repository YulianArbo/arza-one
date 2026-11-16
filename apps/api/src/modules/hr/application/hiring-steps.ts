import { HttpStatus } from '@nestjs/common';

import { HR_ERROR_CODES } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import {
  cancelEmploymentSignature,
  sealedEmploymentContract,
  signEmploymentAsCompany,
} from '../../contract/index.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import type { InvitationUseCase } from '../../iam/index.js';
import { candidateParties } from '../../party/index.js';
import { createFileChecklist, createOnboardingTasks } from './hiring-onboarding.js';
import {
  personNotReady,
  recordNotFound,
  statusInvalid,
  type HiringActor,
} from './hiring-errors.js';

export type { HiringActor };

async function auditCancellation(
  tx: TenantTransaction,
  actor: HiringActor,
  employeeId: string,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: 'hr.hiring.cancel',
    entityType: 'hr_employee',
    entityId: employeeId,
    result: 'success',
    changes: { status: 'cancelled' },
    meta: actor.meta,
  });
}

/** Cancela la vinculación pendiente y su contrato en firma, dejando auditoría. */
export async function cancelPendingHiring(
  tx: TenantTransaction,
  actor: HiringActor,
  target: { readonly id: string; readonly version: number },
  reason: string,
): Promise<void> {
  const { tenantId, userId, at, meta } = actor;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr.activate:${tenantId}:${target.id}`}, 0))`;
  const employee = await tx.hrEmployee.findFirst({
    where: { id: target.id, tenantId, deletedAt: null },
  });
  if (employee === null) throw recordNotFound();
  if (employee.version !== target.version) throw versionConflict();
  if (employee.status !== 'pending') throw statusInvalid('La vinculación ya se resolvió.');
  const contract = await tx.hrContract.findFirst({
    where: { tenantId, employeeId: employee.id, status: 'in_signature', deletedAt: null },
  });
  const envelopeId = contract?.envelopeId ?? null;
  if (contract === null || envelopeId === null) {
    throw statusInvalid('El contrato laboral no está en firma.');
  }
  await cancelEmploymentSignature(
    tx,
    { tenantId, userId, at, meta },
    { contractId: contract.id, envelopeId, reason },
  );
  await tx.hrContract.update({
    where: { id: contract.id },
    data: { status: 'cancelled', closedReason: reason },
  });
  await tx.hrEmployee.update({
    where: { id: employee.id },
    data: { status: 'cancelled', closedReason: reason },
  });
  await auditCancellation(tx, actor, employee.id);
}

/** Devuelve la cuenta ya creada si la petición se repite con la misma versión esperada. */
function replayActivation(
  employee: {
    readonly status: string;
    readonly userId: string | null;
    readonly activatedBy: string | null;
    readonly version: number;
  },
  actor: HiringActor,
  version: number,
): string | null {
  if (
    employee.status === 'active' &&
    employee.userId !== null &&
    employee.activatedBy === actor.userId &&
    employee.version === version + 1
  ) {
    return employee.userId;
  }
  return null;
}

/** Colaborador pendiente, con las validaciones de versión y estado previas a la activación. */
async function pendingEmployee(
  tx: TenantTransaction,
  actor: HiringActor,
  employeeId: string,
  version: number,
) {
  const employee = await tx.hrEmployee.findFirst({
    where: { id: employeeId, tenantId: actor.tenantId, deletedAt: null },
  });
  if (employee === null) throw recordNotFound();
  const replayed = replayActivation(employee, actor, version);
  if (replayed !== null) return { employee, accountId: replayed } as const;
  if (employee.version !== version) throw versionConflict();
  if (employee.status !== 'pending' || employee.candidateId === null) {
    throw statusInvalid('El colaborador no está pendiente de vinculación.');
  }
  return { employee, accountId: null } as const;
}

/** Contrato firmado que habilita la activación del colaborador. */
async function signedContract(tx: TenantTransaction, tenantId: string, employeeId: string) {
  const contract = await tx.hrContract.findFirst({
    where: { tenantId, employeeId, status: 'in_signature', deletedAt: null },
  });
  const envelopeId = contract?.envelopeId ?? null;
  const signed =
    contract === null || envelopeId === null
      ? null
      : await sealedEmploymentContract(tx, { contractId: contract.id, envelopeId });
  if (contract === null || signed === null) {
    throw statusInvalid('El contrato firmado aún no está disponible.');
  }
  return { contract, signed } as const;
}

/** Cierra contrato, colaborador y candidatura con actualización condicional por versión. */
async function closeEmploymentRecords(
  tx: TenantTransaction,
  actor: HiringActor,
  employee: { readonly id: string; readonly candidateId: string },
  contractId: string,
  accountId: string,
  signed: { readonly fileId: string; readonly signedAt: Date },
  version: number,
): Promise<void> {
  const { tenantId, userId, at } = actor;
  await tx.hrContract.update({
    where: { id: contractId },
    data: {
      status: 'signed',
      documentId: signed.fileId,
      signedOn: fromCalendarDate(bogotaToday(signed.signedAt)),
    },
  });
  const active = await tx.hrEmployee.updateMany({
    where: { id: employee.id, tenantId, version, status: 'pending', deletedAt: null },
    data: { status: 'active', userId: accountId, activatedBy: userId, activatedAt: at },
  });
  if (active.count !== 1) throw versionConflict();
  const hired = await tx.hrCandidate.updateMany({
    where: { id: employee.candidateId, tenantId, stage: 'selected', deletedAt: null },
    data: { stage: 'hired' },
  });
  if (hired.count !== 1) throw versionConflict();
}

/** Auditoría y evento de outbox de la vinculación. */
async function announceHiring(
  tx: TenantTransaction,
  actor: HiringActor,
  employeeId: string,
  accountId: string,
): Promise<void> {
  const { tenantId, userId, at, meta } = actor;
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: at,
    actor: { kind: 'user', id: userId },
    action: 'hr.employee.hire',
    entityType: 'hr_employee',
    entityId: employeeId,
    result: 'success',
    changes: { status: 'active', account_id: accountId },
    meta,
  });
  await addOutboxEvent(tx, {
    tenantId,
    actorId: userId,
    occurredAt: at,
    eventType: 'employee.hired',
    payload: { employee_id: employeeId, user_id: accountId },
  });
}

/** Cierra la activación: contrato, colaborador, candidatura, inducción, expediente y aviso. */
async function finalizeActivation(
  tx: TenantTransaction,
  actor: HiringActor,
  employee: {
    readonly id: string;
    readonly candidateId: string;
    readonly hireDate: Date;
  },
  contractId: string,
  accountId: string,
  signed: { readonly fileId: string; readonly signedAt: Date },
  version: number,
): Promise<void> {
  await closeEmploymentRecords(tx, actor, employee, contractId, accountId, signed, version);
  await createOnboardingTasks(tx, actor.tenantId, employee.id, employee.hireDate);
  await createFileChecklist(tx, actor.tenantId, employee.id, signed.fileId);
  await announceHiring(tx, actor, employee.id, accountId);
}

/** Activa el colaborador: cuenta de acceso, contrato firmado, inducción y expediente. */
export async function activatePendingEmployee(
  tx: TenantTransaction,
  principal: Principal,
  invitations: InvitationUseCase,
  actor: HiringActor,
  employeeId: string,
  version: number,
): Promise<string> {
  const { tenantId, meta } = actor;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr.activate:${tenantId}:${employeeId}`}, 0))`;
  const { employee, accountId } = await pendingEmployee(tx, actor, employeeId, version);
  if (accountId !== null) return accountId;
  const candidateId = employee.candidateId;
  if (candidateId === null) throw statusInvalid('El colaborador no está pendiente de vinculación.');
  const { contract, signed } = await signedContract(tx, tenantId, employeeId);
  const person = (await candidateParties(tx, [employee.partyId])).get(employee.partyId);
  if (person === undefined) throw personNotReady('La persona no está disponible.');
  const id = await invitations.createEmployeeInvitation(tx, principal, meta, {
    email: employee.workEmail,
    displayName: `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim(),
    partyId: employee.partyId,
    positionId: employee.positionId,
  });
  await finalizeActivation(
    tx,
    actor,
    { id: employee.id, candidateId, hireDate: employee.hireDate },
    contract.id,
    id,
    signed,
    version,
  );
  return id;
}

/** Firma de Dirección sobre el contrato laboral de un colaborador pendiente. */
export async function signPendingContract(
  tx: TenantTransaction,
  principal: Principal,
  actor: HiringActor,
  employeeId: string,
  accepted: boolean,
): Promise<void> {
  if (!accepted) {
    throw new AppError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      HR_ERROR_CODES.recordInvalid,
      'Debe aceptar la declaración de firma del contrato laboral.',
    );
  }
  const { tenantId, userId, at, meta } = actor;
  const contract = await tx.hrContract.findFirst({
    where: {
      tenantId,
      employeeId,
      companySignerId: userId,
      status: 'in_signature',
      deletedAt: null,
    },
  });
  const envelopeId = contract?.envelopeId ?? null;
  if (contract === null || envelopeId === null) {
    throw new AppError(
      HttpStatus.NOT_FOUND,
      HR_ERROR_CODES.recordNotFound,
      'El contrato laboral no está disponible.',
    );
  }
  await signEmploymentAsCompany(tx, { tenantId, userId, at, meta }, principal, {
    contractId: contract.id,
    envelopeId,
  });
}
