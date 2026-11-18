import type { Prisma } from '../../../generated/prisma/client.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { ContractActor } from './contract-support.js';
import { envelopeNotFound, signatureStatusInvalid } from './signature-messages.js';
import { closeCompanyTask, closeEnvelope } from './signature-progress.js';
import { findEnvelope } from './signature-records.js';
import { recordSignature } from './signature-signing.js';
import { EMPLOYMENT_SOURCE } from './signature-sources.js';

export async function cancelEmploymentSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  target: { readonly envelopeId: string; readonly contractId: string; readonly reason: string },
): Promise<void> {
  const envelope = await findEnvelope(tx, target.envelopeId);
  if (envelope.source !== EMPLOYMENT_SOURCE || envelope.sourceId !== target.contractId)
    throw envelopeNotFound();
  if (envelope.status === 'completed')
    throw signatureStatusInvalid('El contrato laboral ya fue firmado.');
  if (envelope.status === 'sent')
    await closeEnvelope(tx, actor, envelope, { status: 'cancelled', reason: target.reason });
}

export async function sealedEmploymentContract(
  tx: TenantTransaction,
  target: { readonly envelopeId: string; readonly contractId: string },
): Promise<{ fileId: string; signedAt: Date } | null> {
  const envelope = await tx.sigEnvelope.findFirst({
    where: {
      id: target.envelopeId,
      source: EMPLOYMENT_SOURCE,
      sourceId: target.contractId,
      status: 'completed',
      sealStatus: 'ready',
      deletedAt: null,
    },
    select: { signedFileId: true, completedAt: true },
  });
  if (envelope === null) return null;
  if (envelope.signedFileId === null || envelope.completedAt === null) return null;
  return { fileId: envelope.signedFileId, signedAt: envelope.completedAt };
}

const EMPLOYMENT_SNAPSHOT_SELECT = {
  status: true,
  sealStatus: true,
  documentFileId: true,
  signedFileId: true,
  completedAt: true,
  closedReason: true,
  signers: {
    where: { deletedAt: null },
    orderBy: { signOrder: 'asc' },
    select: { name: true, role: true, status: true, userId: true },
  },
} as const satisfies Prisma.SigEnvelopeSelect;

/** Estado de la firma del contrato laboral tal como lo muestra la ficha del colaborador. */
export type EmploymentSignatureSnapshot = Prisma.SigEnvelopeGetPayload<{
  select: typeof EMPLOYMENT_SNAPSHOT_SELECT;
}>;

export async function employmentSignatureSnapshot(
  tx: TenantTransaction,
  target: { readonly envelopeId: string; readonly contractId: string },
): Promise<EmploymentSignatureSnapshot | null> {
  return tx.sigEnvelope.findFirst({
    where: {
      id: target.envelopeId,
      source: EMPLOYMENT_SOURCE,
      sourceId: target.contractId,
      deletedAt: null,
    },
    select: EMPLOYMENT_SNAPSHOT_SELECT,
  });
}

/** Firma por Dirección con la sesión de la persona designada y verificación reciente. */
export async function signEmploymentAsCompany(
  tx: TenantTransaction,
  actor: ContractActor,
  principal: Principal,
  target: { readonly envelopeId: string; readonly contractId: string },
): Promise<void> {
  if (
    !principal.signInComplete ||
    !principal.recentlyVerified ||
    actor.userId !== principal.userId ||
    actor.tenantId !== principal.tenantId
  ) {
    throw permissionDenied();
  }
  const envelope = await findEnvelope(tx, target.envelopeId);
  if (envelope.source !== EMPLOYMENT_SOURCE || envelope.sourceId !== target.contractId) {
    throw envelopeNotFound();
  }
  const signer = envelope.signers.find(
    (candidate) => candidate.kind === 'company' && candidate.userId === actor.userId,
  );
  if (signer === undefined) throw envelopeNotFound();
  await recordSignature(tx, actor, envelope, signer, 'session_mfa');
  await closeCompanyTask(tx, actor, envelope);
}
