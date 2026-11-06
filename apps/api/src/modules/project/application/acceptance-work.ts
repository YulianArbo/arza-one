import type { PrjAcceptance } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { sendAcceptanceSignature, signatureOutcome } from '../../contract/index.js';
import { toCalendarDate } from '../../core/index.js';
import { systemFormPdf } from '../../doc/index.js';
import { endAcceptance, type AcceptanceEnd } from './acceptance-records.js';
import { findProject } from './project-records.js';
import { recordProjectChange, type ProjectActor } from './project-support.js';

// Trabajo de las actas de entrega en el worker (B27). Cada pocos segundos, en cada empresa con actas
// abiertas: la que ya tiene su PDF sale a firma del cliente (módulo de Contratos, firma de nivel 2), y
// la que está en firma se cierra según terminó: firmada (con su copia firmada lista), rechazada,
// vencida (aceptación tácita solo si el contrato la prevé) o anulada. Repetirlo no cambia nada.

export interface AcceptanceWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface AcceptanceWorkResult {
  readonly sent: number;
  readonly answered: number;
}

type Step = 'sent' | 'answered' | null;

function systemActor(tenantId: string, at: Date): ProjectActor {
  return { tenantId, userId: null, meta: null, at };
}

type Context = Awaited<ReturnType<typeof contextOf>>;

/** El PDF del acta está listo: sale a firma del cliente. Si no se pudo generar, se anula. */
async function sendWhenReady(
  tx: TenantTransaction,
  actor: ProjectActor,
  acceptance: PrjAcceptance,
): Promise<Step> {
  const pdf =
    acceptance.formRecordId === null ? null : await systemFormPdf(tx, acceptance.formRecordId);
  if (pdf === null || pdf.status === 'pending') return null;
  const context = await contextOf(tx, acceptance);
  if (pdf.status === 'failed' || pdf.fileId === null || pdf.sha256 === null) {
    await endAcceptance(tx, actor, context, {
      kind: 'cancelled',
      reason:
        'No se pudo generar el PDF del acta. Revise el formato FT-TEC-001 y entregue de nuevo.',
    });
    return 'answered';
  }
  await sendToSign(tx, actor, context, { fileId: pdf.fileId, sha256: pdf.sha256 });
  return 'sent';
}

/** Sale a firma del cliente y queda «en firma» con su proceso. */
async function sendToSign(
  tx: TenantTransaction,
  actor: ProjectActor,
  context: Context,
  pdf: { readonly fileId: string; readonly sha256: string },
): Promise<void> {
  const { acceptance } = context;
  const envelope = await sendAcceptanceSignature(tx, actor, {
    acceptanceId: acceptance.id,
    partyId: context.project.partyId,
    signerId: acceptance.signerPartyId,
    fileId: pdf.fileId,
    sha256: pdf.sha256,
    code: acceptance.recordCode ?? context.project.code,
    title: `Acta de entrega de «${context.deliverable.name}» (${context.project.code})`,
    expiresOn: toCalendarDate(acceptance.respondBy),
    message: acceptance.message,
    sentBy: acceptance.deliveredBy,
  });
  await tx.prjAcceptance.update({
    where: { id: acceptance.id },
    data: { status: 'in_signature', envelopeId: envelope.id, envelopeCode: envelope.code },
  });
  await recordProjectChange(tx, actor, {
    action: 'project.acceptance.send',
    event: 'project.acceptance.sent',
    entityType: 'prj_acceptance',
    entityId: acceptance.id,
    changes: {
      project: context.project.code,
      record_code: acceptance.recordCode,
      envelope_code: envelope.code,
      status: ['preparing', 'in_signature'],
    },
    payload: { project_id: context.project.id, code: context.project.code },
  });
}

async function contextOf(tx: TenantTransaction, acceptance: PrjAcceptance) {
  const [project, deliverable] = await Promise.all([
    findProject(tx, acceptance.projectId),
    tx.prjDeliverable.findFirstOrThrow({ where: { id: acceptance.deliverableId } }),
  ]);
  return { acceptance, project, deliverable };
}

/** Cómo terminó la firma; null mientras sigue esperando al cliente o su copia firmada. */
async function endOf(
  tx: TenantTransaction,
  acceptance: PrjAcceptance,
  tacit: boolean,
): Promise<AcceptanceEnd | null> {
  if (acceptance.envelopeId === null) return null;
  const outcome = await signatureOutcome(tx, acceptance.envelopeId);
  if (outcome === null) return null;
  switch (outcome.status) {
    case 'completed':
      return outcome.signedFileId === null
        ? null
        : { kind: 'accepted', signedFileId: outcome.signedFileId };
    case 'rejected':
      return { kind: 'returned', reason: outcome.closedReason ?? 'El cliente devolvió el acta.' };
    case 'expired':
      return tacit ? { kind: 'tacit' } : { kind: 'unanswered' };
    case 'cancelled':
      return { kind: 'cancelled', reason: outcome.closedReason ?? 'Se anuló la firma del acta.' };
    default:
      return null;
  }
}

async function followOne(
  deps: AcceptanceWorkDependencies,
  tenantId: string,
  id: string,
): Promise<Step> {
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const actor = systemActor(tenantId, deps.clock.now());
    const acceptance = await tx.prjAcceptance.findFirst({ where: { id, deletedAt: null } });
    if (acceptance === null) return null;
    if (acceptance.status === 'preparing') return sendWhenReady(tx, actor, acceptance);
    if (acceptance.status !== 'in_signature') return null;
    const context = await contextOf(tx, acceptance);
    const end = await endOf(tx, acceptance, context.project.tacitAcceptance);
    if (end === null) return null;
    await endAcceptance(tx, actor, context, end);
    return 'answered';
  });
}

async function tenantsWithAcceptances(deps: AcceptanceWorkDependencies): Promise<string[]> {
  const rows = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT prj_tenants_with_acceptances() AS id`,
  );
  return rows.map((row) => row.id);
}

/** Actas abiertas de todas las empresas: envía las listas y cierra las respondidas. */
export async function followAcceptances(
  deps: AcceptanceWorkDependencies,
): Promise<AcceptanceWorkResult> {
  const totals = { sent: 0, answered: 0 };
  for (const tenantId of await tenantsWithAcceptances(deps)) {
    const open = await deps.database.withTenant({ tenantId, userId: null }, (tx) =>
      tx.prjAcceptance.findMany({
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
