import { Decimal } from 'decimal.js';

import type {
  PrjAcceptance,
  PrjDeliverable,
  PrjMilestone,
  PrjProject,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { contractsForProjects } from '../../contract/index.js';
import { billableAmount } from '../domain/control-rules.js';
import { recordProjectChange, type ProjectActor } from './project-support.js';

// Cómo termina un acta de entrega (B27, ficha 17.8): aceptada y firmada por el cliente, aceptada
// tácitamente (solo si el contrato lo prevé), devuelta con su motivo o sin respuesta. Al aceptarse
// el último entregable de un hito, el hito queda «Listo para facturar» con su valor y Finanzas
// recibe el aviso; el evento project.milestone.billable es el que usará Facturación (B31).

export type AcceptanceEnd =
  | { readonly kind: 'accepted'; readonly signedFileId: string }
  | { readonly kind: 'tacit' }
  | { readonly kind: 'returned'; readonly reason: string }
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'cancelled'; readonly reason: string };

const DELIVERABLE_AFTER: Readonly<Record<AcceptanceEnd['kind'], string>> = {
  accepted: 'accepted',
  tacit: 'accepted',
  returned: 'returned',
  // Sin respuesta, el entregable sigue entregado: el líder lo reenvía o llama al cliente.
  unanswered: 'delivered',
  // El acta no se pudo generar o se anuló: el entregable vuelve a preparación.
  cancelled: 'preparing',
};

const EVENTS: Readonly<Record<AcceptanceEnd['kind'], string>> = {
  accepted: 'project.acceptance.accepted',
  tacit: 'project.acceptance.tacit',
  returned: 'project.acceptance.returned',
  unanswered: 'project.acceptance.unanswered',
  cancelled: 'project.acceptance.cancelled',
};

function acceptanceData(end: AcceptanceEnd, at: Date) {
  const accepted = end.kind === 'accepted' || end.kind === 'tacit';
  return {
    status: end.kind,
    answeredAt: at,
    acceptedAt: accepted ? at : null,
    signedFileId: end.kind === 'accepted' ? end.signedFileId : null,
    clientNote: end.kind === 'returned' ? end.reason : null,
  };
}

interface AcceptanceTarget {
  readonly acceptance: PrjAcceptance;
  readonly deliverable: PrjDeliverable;
  readonly project: PrjProject;
}

function endAudit(target: AcceptanceTarget, end: AcceptanceEnd) {
  const { acceptance, deliverable, project } = target;
  return {
    project: project.code,
    deliverable: deliverable.name,
    record_code: acceptance.recordCode,
    envelope_code: acceptance.envelopeCode,
    status: [acceptance.status, end.kind],
    ...(end.kind === 'tacit' ? { tacit_clause: project.tacitClause } : {}),
    ...(end.kind === 'returned' || end.kind === 'cancelled' ? { reason: end.reason } : {}),
  };
}

/** Deja el acta y su entregable como terminó la respuesta del cliente. */
export async function endAcceptance(
  tx: TenantTransaction,
  actor: ProjectActor,
  target: AcceptanceTarget,
  end: AcceptanceEnd,
): Promise<void> {
  const { acceptance, deliverable, project } = target;
  const { count } = await tx.prjAcceptance.updateMany({
    where: { id: acceptance.id, status: acceptance.status },
    data: acceptanceData(end, actor.at),
  });
  if (count === 0) return;
  const status = DELIVERABLE_AFTER[end.kind];
  const accepted = status === 'accepted';
  await tx.prjDeliverable.update({
    where: { id: deliverable.id },
    data: { status, acceptedAt: accepted ? actor.at : null },
  });
  await recordProjectChange(tx, actor, {
    action: `project.acceptance.${end.kind}`,
    event: EVENTS[end.kind],
    entityType: 'prj_acceptance',
    entityId: acceptance.id,
    changes: endAudit(target, end),
    payload: {
      project_id: project.id,
      code: project.code,
      manager_id: project.managerId,
      deliverable_id: deliverable.id,
    },
  });
  if (accepted && deliverable.milestoneId !== null) {
    await markMilestoneBillable(tx, actor, project, deliverable.milestoneId);
  }
}

/** Sobre qué valor se factura: el del contrato o, sin él, el presupuesto en pesos. */
export async function billingBase(tx: TenantTransaction, project: PrjProject): Promise<Decimal> {
  if (project.contractId !== null) {
    const contract = (await contractsForProjects(tx, [project.contractId])).get(project.contractId);
    if (contract !== undefined && contract.value !== null) return new Decimal(contract.value);
  }
  return new Decimal(project.budgetAmount?.toString() ?? 0);
}

/** Si el cliente aceptó todos los entregables del hito, el hito queda listo para facturar. */
async function markMilestoneBillable(
  tx: TenantTransaction,
  actor: ProjectActor,
  project: PrjProject,
  milestoneId: string,
): Promise<void> {
  const pending = await tx.prjDeliverable.count({
    where: { milestoneId, deletedAt: null, status: { not: 'accepted' } },
  });
  const milestone = await tx.prjMilestone.findFirst({
    where: { id: milestoneId, deletedAt: null, status: 'pending' },
  });
  if (pending > 0 || milestone === null) return;
  const amount = billableAmount(await billingBase(tx, project), milestone.billingPct.toString());
  await tx.prjMilestone.update({
    where: { id: milestone.id },
    data: {
      status: 'billable',
      doneAt: actor.at,
      billableAt: actor.at,
      billableAmount: amount.toFixed(2),
    },
  });
  await recordBillable(tx, actor, project, { milestone, amount: amount.toFixed(2) });
}

async function recordBillable(
  tx: TenantTransaction,
  actor: ProjectActor,
  project: PrjProject,
  billed: { readonly milestone: PrjMilestone; readonly amount: string },
): Promise<void> {
  const { milestone, amount } = billed;
  await recordProjectChange(tx, actor, {
    action: 'project.milestone.billable',
    event: 'project.milestone.billable',
    entityType: 'prj_milestone',
    entityId: milestone.id,
    changes: {
      project: project.code,
      name: milestone.name,
      billing_pct: milestone.billingPct.toFixed(2),
      amount,
      status: ['pending', 'billable'],
    },
    payload: {
      project_id: project.id,
      code: project.code,
      contract_id: project.contractId,
      party_id: project.partyId,
      milestone_id: milestone.id,
      billing_pct: milestone.billingPct.toFixed(2),
      amount,
    },
  });
}
