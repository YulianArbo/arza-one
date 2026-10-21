import type { DocDispositionProposal, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { TransitionNotice, WfContext } from '../../wf/index.js';
import { DISPOSITION_STATES } from '../domain/doc-flows.js';
import { auditDoc } from './doc-support.js';
import { dispositionNotFound, selfDisposition } from './retention-messages.js';
import { stillExpired } from './disposition-proposals.js';

// El trámite de una propuesta de disposición (B21, ADR-023): cada paso del motor cambia la propuesta
// en la misma transacción. Quien la envió no la aprueba ni la rechaza, ni a nombre de otra persona.
// La aprobada la ejecuta el worker (disposition-execution.ts).

async function record(
  tx: TenantTransaction,
  context: WfContext,
  proposal: DocDispositionProposal,
  step: { action: string; data: Prisma.DocDispositionProposalUpdateInput },
): Promise<void> {
  const updated = await tx.docDispositionProposal.update({
    where: { id: proposal.id },
    data: step.data,
  });
  await auditDoc(tx, context, {
    action: `doc.disposition.${step.action}`,
    entityType: 'doc_disposition_proposal',
    entityId: proposal.id,
    changes: { code: proposal.code, from: proposal.status, to: updated.status },
  });
}

async function decide(
  tx: TenantTransaction,
  context: WfContext,
  proposal: DocDispositionProposal,
  notice: TransitionNotice,
): Promise<void> {
  const sender = proposal.sentBy;
  if (context.userId === sender || notice.onBehalfOf === sender) throw selfDisposition();
  const approved = notice.toState === DISPOSITION_STATES.approved;
  if (approved) await stillExpired(tx, proposal.id, context.at);
  await record(tx, context, proposal, {
    action: approved ? 'approve' : 'reject',
    data: {
      status: approved ? 'approved' : 'rejected',
      decidedBy: context.userId,
      decidedAt: context.at,
      decisionNote: notice.comment,
    },
  });
}

/** Oyente del trámite de las propuestas de disposición. */
export async function followDispositionFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const proposal = await tx.docDispositionProposal.findFirst({
    where: { id: notice.entityId, deletedAt: null },
  });
  if (proposal === null) throw dispositionNotFound();
  if (notice.toState === DISPOSITION_STATES.approval) {
    await record(tx, context, proposal, {
      action: 'send',
      data: { status: 'in_approval', sentBy: context.userId, sentAt: context.at },
    });
    return;
  }
  if (
    notice.toState === DISPOSITION_STATES.approved ||
    notice.toState === DISPOSITION_STATES.rejected
  ) {
    await decide(tx, context, proposal, notice);
  }
}
