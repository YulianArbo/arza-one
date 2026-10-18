import type { DocFormRecord, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { TransitionNotice, WfContext } from '../../wf/index.js';
import { FORM_RECORD_STATES } from '../domain/form-flows.js';
import { selfApproval, transitionNotAllowed } from './doc-messages.js';
import { auditDoc, type DocActor } from './doc-support.js';
import { formRecordNotFound } from './form-messages.js';

// La aprobación de un registro diligenciado en el motor de flujos (B20, ADR-023): cada paso, venga
// de la ficha del registro o de «Mis tareas», cambia el registro en la misma transacción. Quien lo
// diligenció no lo aprueba ni lo devuelve, ni por delegación. Al terminar, el registro queda
// esperando su PDF, que genera el worker.

async function moveRecord(
  tx: TenantTransaction,
  actor: DocActor,
  record: DocFormRecord,
  step: {
    readonly action: string;
    readonly from: string;
    readonly to: string;
    readonly data: Prisma.DocFormRecordUpdateManyMutationInput;
  },
): Promise<void> {
  const { count } = await tx.docFormRecord.updateMany({
    where: { id: record.id, status: step.from },
    data: { ...step.data, status: step.to },
  });
  if (count === 0) throw transitionNotAllowed();
  await auditDoc(tx, actor, {
    action: `doc.form_record.${step.action}`,
    entityType: 'doc_form_record',
    entityId: record.id,
    changes: { code: record.code, from: step.from, to: step.to },
  });
}

interface Completion {
  readonly status: 'completed';
  readonly completedAt: Date;
  readonly renderStatus: 'pending';
}

/** Lo que cambia al terminar: queda esperando su PDF. */
export function completion(at: Date): Completion {
  return { status: 'completed', completedAt: at, renderStatus: 'pending' };
}

/** Oyente del trámite de los registros diligenciados. */
export async function followFormRecordFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const record = await tx.docFormRecord.findFirst({
    where: { id: notice.entityId, deletedAt: null },
  });
  if (record === null) throw formRecordNotFound();
  const decides = notice.action === 'approve' || notice.action === 'reject';
  const author = record.createdBy;
  if (decides && (context.userId === author || notice.onBehalfOf === author)) throw selfApproval();
  if (notice.toState === FORM_RECORD_STATES.approval) {
    await moveRecord(tx, context, record, {
      action: 'submit',
      from: 'draft',
      to: 'in_approval',
      data: { submittedAt: context.at, returnNote: null },
    });
  } else if (notice.toState === FORM_RECORD_STATES.filling) {
    const note = notice.comment ?? 'Devuelto para corregir.';
    await moveRecord(tx, context, record, {
      action: 'reject',
      from: 'in_approval',
      to: 'draft',
      data: { returnNote: note },
    });
  } else if (notice.toState === FORM_RECORD_STATES.approved) {
    await moveRecord(tx, context, record, {
      action: 'approve',
      from: 'in_approval',
      to: 'completed',
      data: { ...completion(context.at), approvedBy: context.userId, approvedAt: context.at },
    });
  }
}
