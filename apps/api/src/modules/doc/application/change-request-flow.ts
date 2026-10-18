import type { DocChangeRequest, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import type { TransitionNotice, WfContext } from '../../wf/index.js';
import { CHANGE_REQUEST_STATES } from '../domain/doc-flows.js';
import { auditDoc } from './doc-support.js';
import { changeRequestNotFound, selfDecision } from './request-messages.js';
import { recordChangeRequestForm } from './system-records.js';

// El trámite de una Solicitud de Acción Documental (B19, ADR-023): cada paso del motor cambia la
// solicitud en la misma transacción. Quien la pidió no la decide, ni a nombre de otra persona; al
// decidirse, le llega un aviso y queda su FT-SGC-001 (B20).

type Outcome = 'approved' | 'rejected';

function outcomeOf(state: string): Outcome | null {
  if (state === CHANGE_REQUEST_STATES.approved) return 'approved';
  if (state === CHANGE_REQUEST_STATES.rejected) return 'rejected';
  return null;
}

async function record(
  tx: TenantTransaction,
  context: WfContext,
  request: DocChangeRequest,
  step: { action: string; data: Prisma.DocChangeRequestUpdateInput },
): Promise<DocChangeRequest> {
  const updated = await tx.docChangeRequest.update({ where: { id: request.id }, data: step.data });
  await auditDoc(tx, context, {
    action: `doc.change_request.${step.action}`,
    entityType: 'doc_change_request',
    entityId: request.id,
    changes: { code: request.code, from: request.status, to: updated.status },
  });
  return updated;
}

async function decide(
  tx: TenantTransaction,
  context: WfContext,
  request: DocChangeRequest,
  decision: { outcome: Outcome; comment: string | null },
): Promise<void> {
  const decided = await record(tx, context, request, {
    action: decision.outcome === 'approved' ? 'approve' : 'reject',
    data: {
      status: decision.outcome,
      decidedBy: context.userId,
      decidedAt: context.at,
      decisionNote: decision.comment,
    },
  });
  await addOutboxEvent(tx, {
    tenantId: context.tenantId,
    eventType: 'doc.request.decided',
    actorId: context.userId,
    occurredAt: context.at,
    payload: {
      request_id: decided.id,
      code: decided.code,
      requester_id: decided.requestedBy,
      outcome: decision.outcome,
    },
  });
  await recordChangeRequestForm(tx, context, decided);
}

/** Oyente del trámite de las solicitudes. */
export async function followChangeRequestFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const request = await tx.docChangeRequest.findFirst({
    where: { id: notice.entityId, deletedAt: null },
  });
  if (request === null) throw changeRequestNotFound();
  if (notice.toState === CHANGE_REQUEST_STATES.analysis) {
    await record(tx, context, request, { action: 'analyze', data: { status: 'in_analysis' } });
    return;
  }
  const outcome = outcomeOf(notice.toState);
  if (outcome === null) return;
  const requester = request.requestedBy;
  if (context.userId === requester || notice.onBehalfOf === requester) throw selfDecision();
  await decide(tx, context, request, { outcome, comment: notice.comment });
}
