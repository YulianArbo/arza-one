import type { AstAssignment } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { loanSignatureOutcome, sendLoanSignature } from '../../contract/index.js';
import { toCalendarDate } from '../../core/index.js';
import { systemFormPdf } from '../../doc/index.js';
import { activeCollaborators } from '../../iam/index.js';
import { changeAsset, findAsset, recordAstEvent, type AstActor } from './asset-support.js';

// Trabajo de los comodatos en el worker (B34). Cada pocos segundos, en cada empresa con
// asignaciones abiertas: la que ya tiene su PDF sale a firma del colaborador (módulo de Contratos,
// firma de nivel 2), y la que está en firma se cierra según terminó: firmada (la asignación queda
// vigente y el activo «asignado») o rechazada, vencida o anulada (el activo vuelve a estar
// disponible). Repetirlo no cambia nada.

export interface LoanWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface LoanWorkResult {
  readonly sent: number;
  readonly answered: number;
}

type Step = 'sent' | 'answered' | null;

const ENTITY = 'ast_assignment';

/** La asignación se cierra sin firma y el activo vuelve a estar disponible. */
async function cancelAssignment(
  tx: TenantTransaction,
  actor: AstActor,
  assignment: AstAssignment,
  reason: string,
): Promise<void> {
  await tx.astAssignment.update({
    where: { id: assignment.id },
    data: { status: 'cancelled', closedReason: reason },
  });
  await changeAsset(tx, { id: assignment.assetId, status: 'reserved' }, { status: 'available' });
  await recordAstEvent(tx, actor, {
    action: 'asset.assignment.cancel',
    event: 'ast.assignment.cancelled',
    entityType: ENTITY,
    entityId: assignment.id,
    payload: { asset_id: assignment.assetId, user_id: assignment.userId },
    changes: { status: [assignment.status, 'cancelled'], reason },
  });
}

/** El comodato firmado ya está listo: la asignación queda vigente y el activo, asignado. */
async function activate(
  tx: TenantTransaction,
  actor: AstActor,
  assignment: AstAssignment,
  signedFileId: string,
): Promise<void> {
  // Primero la asignación: la base de datos no deja «asignado» un activo sin comodato firmado.
  await tx.astAssignment.update({
    where: { id: assignment.id },
    data: { status: 'active', contractDocumentId: signedFileId, activatedAt: actor.at },
  });
  await changeAsset(tx, { id: assignment.assetId, status: 'reserved' }, { status: 'assigned' });
  await recordAstEvent(tx, actor, {
    action: 'asset.assignment.activate',
    event: 'ast.assignment.activated',
    entityType: ENTITY,
    entityId: assignment.id,
    payload: { asset_id: assignment.assetId, user_id: assignment.userId },
    changes: { status: ['in_signature', 'active'], envelope_code: assignment.envelopeCode },
  });
}

function unsendableReason(inactive: boolean): string {
  return inactive
    ? 'La cuenta del colaborador ya no está activa.'
    : 'No se pudo generar el PDF del comodato. Revise el formato CT-ADM-001 y asigne de nuevo.';
}

/** El PDF del comodato está listo: sale a firma. Si no se pudo generar, la asignación se anula. */
async function sendWhenReady(
  tx: TenantTransaction,
  actor: AstActor,
  assignment: AstAssignment,
): Promise<Step> {
  const pdf =
    assignment.formRecordId === null ? null : await systemFormPdf(tx, assignment.formRecordId);
  if (pdf === null || pdf.status === 'pending') return null;
  const [collaborator] = await activeCollaborators(tx, [assignment.userId]);
  if (pdf.fileId === null || pdf.sha256 === null || collaborator === undefined) {
    await cancelAssignment(tx, actor, assignment, unsendableReason(collaborator === undefined));
    return 'answered';
  }
  const asset = await findAsset(tx, assignment.assetId);
  const envelope = await sendLoanSignature(tx, actor, {
    assignmentId: assignment.id,
    personId: assignment.signerPartyId,
    email: collaborator.email,
    fileId: pdf.fileId,
    sha256: pdf.sha256,
    code: assignment.recordCode ?? asset.code,
    title: `Contrato de comodato de «${asset.name}» (${asset.code})`,
    expiresOn: toCalendarDate(assignment.signBy),
    message: assignment.message,
    sentBy: assignment.assignedBy,
  });
  await tx.astAssignment.update({
    where: { id: assignment.id },
    data: { status: 'in_signature', envelopeId: envelope.id, envelopeCode: envelope.code },
  });
  await recordAstEvent(tx, actor, {
    action: 'asset.assignment.send',
    event: 'ast.assignment.sent',
    entityType: ENTITY,
    entityId: assignment.id,
    payload: { asset_id: assignment.assetId, user_id: assignment.userId },
    changes: { status: ['preparing', 'in_signature'], envelope_code: envelope.code },
  });
  return 'sent';
}

const CLOSED_WITHOUT_SIGNATURE: Readonly<Record<string, string>> = {
  rejected: 'El colaborador rechazó el comodato.',
  expired: 'Venció el plazo para firmar el comodato.',
  cancelled: 'Se anuló la firma del comodato.',
};

/** Cierra la asignación según terminó la firma; null mientras sigue esperando. */
async function closeWhenAnswered(
  tx: TenantTransaction,
  actor: AstActor,
  assignment: AstAssignment,
): Promise<Step> {
  if (assignment.envelopeId === null) return null;
  const outcome = await loanSignatureOutcome(tx, assignment.envelopeId);
  if (outcome === null) return null;
  if (outcome.status === 'completed') {
    if (outcome.signedFileId === null) return null;
    await activate(tx, actor, assignment, outcome.signedFileId);
    return 'answered';
  }
  const fallback = CLOSED_WITHOUT_SIGNATURE[outcome.status];
  if (fallback === undefined) return null;
  await cancelAssignment(tx, actor, assignment, outcome.closedReason ?? fallback);
  return 'answered';
}

async function followOne(deps: LoanWorkDependencies, tenantId: string, id: string): Promise<Step> {
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const actor: AstActor = { tenantId, userId: null, meta: null, at: deps.clock.now() };
    const assignment = await tx.astAssignment.findFirst({ where: { id, deletedAt: null } });
    if (assignment === null) return null;
    if (assignment.status === 'preparing') return sendWhenReady(tx, actor, assignment);
    if (assignment.status === 'in_signature') return closeWhenAnswered(tx, actor, assignment);
    return null;
  });
}

async function tenantsWithLoans(deps: LoanWorkDependencies): Promise<string[]> {
  const rows = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT ast_tenants_with_assignments() AS id`,
  );
  return rows.map((row) => row.id);
}

/** Comodatos abiertos de todas las empresas: envía los listos y cierra los respondidos. */
export async function followLoans(deps: LoanWorkDependencies): Promise<LoanWorkResult> {
  const totals = { sent: 0, answered: 0 };
  for (const tenantId of await tenantsWithLoans(deps)) {
    const open = await deps.database.withTenant({ tenantId, userId: null }, (tx) =>
      tx.astAssignment.findMany({
        where: { status: { in: ['preparing', 'in_signature'] }, deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 50,
      }),
    );
    for (const { id } of open) {
      const step = await followOne(deps, tenantId, id);
      if (step !== null) totals[step] += 1;
    }
  }
  return totals;
}
