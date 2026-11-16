import { HttpStatus } from '@nestjs/common';

import { HIRING_SIGNATURE_DAYS, HR_ERROR_CODES, type HireCandidate } from '@arza/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { addDays, bogotaToday, fromCalendarDate, positionsById } from '../../core/index.js';
import { attachablePdfForSignature } from '../../doc/index.js';
import { candidateParties } from '../../party/index.js';
import { sendEmploymentSignature } from '../../contract/index.js';
import type { HiringActor } from './hiring-errors.js';

function recordInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, HR_ERROR_CODES.recordInvalid, message);
}

function conflict(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, HR_ERROR_CODES.statusInvalid, message);
}

/** Candidatura a vincular, respetando la clave de petición para reintentos idempotentes. */
async function hireableCandidate(
  tx: TenantTransaction,
  actor: HiringActor,
  target: { readonly id: string; readonly version: number; readonly key: string },
) {
  const { tenantId, userId } = actor;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hr.hiring:${tenantId}:${target.id}`}, 0))`;
  const candidate = await tx.hrCandidate.findFirst({
    where: { id: target.id, tenantId, deletedAt: null },
  });
  if (candidate === null) {
    throw new AppError(
      HttpStatus.NOT_FOUND,
      HR_ERROR_CODES.recordNotFound,
      'La candidatura no existe.',
    );
  }
  const replay = await tx.hrEmployee.findUnique({
    where: { tenantId_requestKey: { tenantId, requestKey: target.key } },
  });
  if (replay !== null) {
    if (replay.candidateId !== candidate.id || replay.createdBy !== userId) {
      throw idempotencyKeyReused();
    }
    return { candidate, replayId: replay.id } as const;
  }
  if (candidate.version !== target.version) throw versionConflict();
  const existing = await tx.hrEmployee.findFirst({
    where: {
      tenantId,
      partyId: candidate.partyId,
      deletedAt: null,
      status: { in: ['active', 'pending'] },
    },
  });
  if (existing !== null || candidate.stage !== 'selected') {
    throw conflict('La candidatura debe estar seleccionada y disponible para vinculación.');
  }
  return { candidate, replayId: null } as const;
}

/** Cargo activo, PDF adjunto del contrato y correo de la persona, requisitos para enviar la firma. */
async function hiringInputs(
  tx: TenantTransaction,
  principal: Principal,
  candidate: { readonly partyId: string },
  input: HireCandidate,
  salary: Prisma.Decimal,
) {
  const position = (await positionsById(tx, [input.position_id])).get(input.position_id);
  const pdf = await attachablePdfForSignature(tx, principal, input.contract_file_id);
  if (!position?.isActive || pdf === null || !salary.gt(0)) {
    throw recordInvalid('Revise el cargo, el salario y el PDF adjunto.');
  }
  const person = (await candidateParties(tx, [candidate.partyId])).get(candidate.partyId);
  if (person?.email === null || person?.email === undefined) {
    throw new AppError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      HR_ERROR_CODES.personNotReady,
      'Registre el correo de la persona para enviarle la firma.',
    );
  }
  return { position, pdf, email: person.email } as const;
}

/** Colaborador y contrato laboral en borrador, antes de abrir la firma. */
async function createEmployeeRecord(
  tx: TenantTransaction,
  actor: HiringActor,
  candidate: { readonly id: string; readonly partyId: string },
  position: { readonly id: string },
  input: HireCandidate,
  startsOn: Date,
  requestKey: string,
) {
  return tx.hrEmployee.create({
    data: {
      tenantId: actor.tenantId,
      partyId: candidate.partyId,
      candidateId: candidate.id,
      positionId: position.id,
      hireDate: startsOn,
      contractType: input.contract_type,
      workMode: input.work_mode,
      workEmail: input.work_email,
      requestKey,
    },
  });
}

async function createContractRecord(
  tx: TenantTransaction,
  actor: HiringActor,
  employeeId: string,
  input: HireCandidate,
  salary: Prisma.Decimal,
  signBy: string,
  startsOn: Date,
  requestKey: string,
) {
  return tx.hrContract.create({
    data: {
      tenantId: actor.tenantId,
      employeeId,
      type: input.contract_type,
      startsOn,
      endsOn: input.ends_on === null ? null : fromCalendarDate(input.ends_on),
      salaryBand: input.salary_band,
      salary,
      signBy: fromCalendarDate(signBy),
      companySignerId: input.company_signer_id,
      message: input.message,
      sentBy: actor.userId,
      requestKey,
    },
  });
}

async function createEmploymentRecords(
  tx: TenantTransaction,
  actor: HiringActor,
  candidate: { readonly id: string; readonly partyId: string },
  position: { readonly id: string },
  input: HireCandidate,
  salary: Prisma.Decimal,
  signBy: string,
  startsOn: Date,
  requestKey: string,
) {
  const employee = await createEmployeeRecord(
    tx,
    actor,
    candidate,
    position,
    input,
    startsOn,
    requestKey,
  );
  const contract = await createContractRecord(
    tx,
    actor,
    employee.id,
    input,
    salary,
    signBy,
    startsOn,
    requestKey,
  );
  return { employee, contract } as const;
}

/** Abre el sobre de firma y deja el contrato en firma con su código de sobre. */
async function openSignature(
  tx: TenantTransaction,
  actor: HiringActor,
  contract: { readonly id: string },
  candidate: { readonly partyId: string },
  email: string,
  pdf: { readonly id: string; readonly sha256: string },
  signBy: string,
  input: HireCandidate,
): Promise<void> {
  const { tenantId, userId, at, meta } = actor;
  const envelope = await sendEmploymentSignature(
    tx,
    { tenantId, userId, at, meta },
    {
      contractId: contract.id,
      personId: candidate.partyId,
      email,
      companySignerId: input.company_signer_id,
      pdf,
      expiresOn: signBy,
      message: input.message,
    },
  );
  await tx.hrContract.update({
    where: { id: contract.id },
    data: { status: 'in_signature', envelopeId: envelope.id, envelopeCode: envelope.code },
  });
}

/** Auditoría del envío a firma del contrato laboral. */
async function auditPreparation(
  tx: TenantTransaction,
  actor: HiringActor,
  employeeId: string,
  contractId: string,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: 'hr.hiring.prepare',
    entityType: 'hr_contract',
    entityId: contractId,
    result: 'success',
    changes: { status: 'in_signature', employee_id: employeeId },
    meta: actor.meta,
  });
}

/** Prepara vinculación: colaborador, contrato y sobre de firma con el PDF adjunto. */
export async function prepareHiring(
  tx: TenantTransaction,
  principal: Principal,
  actor: HiringActor,
  target: { readonly id: string; readonly version: number; readonly key: string },
  input: HireCandidate,
): Promise<string> {
  const { tenantId, at } = actor;
  const { candidate, replayId } = await hireableCandidate(tx, actor, target);
  if (replayId !== null) return replayId;
  const salary = new Prisma.Decimal(input.salary);
  const { position, pdf, email } = await hiringInputs(tx, principal, candidate, input, salary);
  const signBy = addDays(bogotaToday(at), HIRING_SIGNATURE_DAYS);
  const startsOn = fromCalendarDate(input.hire_date);
  const { employee, contract } = await createEmploymentRecords(
    tx,
    actor,
    candidate,
    position,
    input,
    salary,
    signBy,
    startsOn,
    target.key,
  );
  await openSignature(tx, actor, contract, candidate, email, pdf, signBy, input);
  const updated = await tx.hrCandidate.updateMany({
    where: {
      tenantId,
      id: candidate.id,
      version: target.version,
      stage: 'selected',
      deletedAt: null,
    },
    data: { updatedAt: at },
  });
  if (updated.count !== 1) throw versionConflict();
  await auditPreparation(tx, actor, employee.id, contract.id);
  return employee.id;
}
