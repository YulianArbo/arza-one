import { CHANGE_REQUEST_ACTIONS, changeRequestActionSchema } from '@arza/contracts';

import type { DocChangeRequest } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, nextBusinessCode, orgUnitsById } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { CHANGE_REQUEST_FORM_CODE, DOCUMENT_CHECKLIST_CODE } from '../domain/pilot-forms.js';
import { recordSequenceKey } from '../domain/form-rules.js';
import { auditDoc, type DocActor } from './doc-support.js';
import { checklistRequired } from './form-messages.js';
import { completion } from './form-record-flow.js';

// Formatos que la plataforma conecta con el control documental (B20): el FT-SGC-001 de cada
// Solicitud de Acción Documental, que se llena solo cuando Calidad la decide, y el FT-SGC-002 que
// Calidad diligencia antes de aprobar la revisión de una versión. Los dos aplican cuando el formato
// está publicado en la empresa.

const DECISIONS = { approved: 'Aprobada', rejected: 'Rechazada' } as const;

async function publishedTemplate(tx: TenantTransaction, code: string) {
  return tx.docFormTemplate.findFirst({ where: { code, status: 'published', deletedAt: null } });
}

async function requestData(tx: TenantTransaction, request: DocChangeRequest) {
  const people = await peopleById(tx, [
    request.requestedBy,
    request.decidedBy ?? request.requestedBy,
  ]);
  const name = (id: string | null) => {
    const person = id === null ? undefined : people.get(id);
    return person?.displayName ?? person?.email ?? '';
  };
  const process =
    request.processId === null
      ? undefined
      : (await orgUnitsById(tx, [request.processId])).get(request.processId);
  const document =
    request.documentId === null
      ? null
      : await tx.docDocument.findFirst({
          where: { id: request.documentId },
          select: { code: true, title: true },
        });
  const decision = request.status === 'rejected' ? DECISIONS.rejected : DECISIONS.approved;
  return {
    codigo: request.code,
    accion: CHANGE_REQUEST_ACTIONS[changeRequestActionSchema.parse(request.action)],
    documento: document === null ? request.title : `${document.code} · ${document.title}`,
    tipo: request.docType ?? '',
    proceso: process === undefined ? '' : `${process.code} · ${process.name}`,
    justificacion: request.justification,
    solicito: name(request.requestedBy),
    fecha_solicitud: bogotaToday(request.createdAt),
    decision,
    decidio: name(request.decidedBy),
    fecha_decision: request.decidedAt === null ? '' : bogotaToday(request.decidedAt),
    nota: request.decisionNote ?? '',
  };
}

/** Al decidirse una solicitud, su FT-SGC-001 queda terminado y esperando su PDF. */
export async function recordChangeRequestForm(
  tx: TenantTransaction,
  actor: DocActor,
  request: DocChangeRequest,
): Promise<void> {
  const template = await publishedTemplate(tx, CHANGE_REQUEST_FORM_CODE);
  if (template?.fillMode !== 'system') return;
  const code = await nextBusinessCode(tx, recordSequenceKey(template.code), actor.at, {
    name: `Registros ${template.code}`,
    prefix: template.code,
    padding: 4,
  });
  const record = await tx.docFormRecord.create({
    data: {
      tenantId: actor.tenantId,
      templateId: template.id,
      templateVersion: template.formVersion,
      code,
      data: await requestData(tx, request),
      classification: template.classification,
      entityType: 'doc_change_request',
      entityId: request.id,
      submittedAt: actor.at,
      ...completion(actor.at),
    },
  });
  await auditDoc(tx, actor, {
    action: 'doc.form_record.complete',
    entityType: 'doc_form_record',
    entityId: record.id,
    changes: {
      code,
      template_code: template.code,
      entity_type: 'doc_change_request',
      entity_id: request.id,
    },
  });
}

/** Con el FT-SGC-002 publicado, la revisión de una versión exige su lista de verificación terminada. */
export async function assertChecklistDone(tx: TenantTransaction, versionId: string): Promise<void> {
  if ((await publishedTemplate(tx, DOCUMENT_CHECKLIST_CODE)) === null) return;
  const done = await tx.docFormRecord.count({
    where: {
      entityType: 'doc_version',
      entityId: versionId,
      status: 'completed',
      deletedAt: null,
      template: { code: DOCUMENT_CHECKLIST_CODE },
    },
  });
  if (done === 0) throw checklistRequired();
}
