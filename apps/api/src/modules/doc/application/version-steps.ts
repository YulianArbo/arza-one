import type { DocDocument, DocVersion, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate } from '../../core/index.js';
import { VERSION_TRANSITIONS, type VersionStep } from '../domain/document-rules.js';
import { requestReading } from './reading-requests.js';
import { executeChangeRequest } from './change-request-rows.js';
import { transitionNotAllowed } from './doc-messages.js';
import { auditDoc, type DocActor } from './doc-support.js';

// Los pasos del ciclo de una versión sobre sus filas (B18, ficha 17.4). Desde B19 los da el
// seguimiento del trámite (version-flow.ts), venga el paso de la ficha o de «Mis tareas».

export interface StepContext {
  readonly tx: TenantTransaction;
  readonly actor: DocActor;
  readonly document: DocDocument;
  readonly version: DocVersion;
}

export async function moveVersion(
  context: StepContext,
  step: VersionStep,
  data: Prisma.DocVersionUpdateManyMutationInput,
): Promise<void> {
  const { from, to } = VERSION_TRANSITIONS[step];
  const { count } = await context.tx.docVersion.updateMany({
    where: { id: context.version.id, status: from },
    data: { ...data, status: to },
  });
  if (count === 0) throw transitionNotAllowed();
}

export async function auditStep(
  context: StepContext,
  action: VersionStep | 'review',
  changes: Prisma.InputJsonObject = {},
): Promise<void> {
  const move = action === 'review' ? {} : VERSION_TRANSITIONS[action];
  await auditDoc(context.tx, context.actor, {
    action: `doc.version.${action}`,
    entityType: 'doc_version',
    entityId: context.version.id,
    changes: {
      code: context.document.code,
      label: context.version.versionLabel,
      ...move,
      ...changes,
    },
  });
}

/**
 * La vigente anterior pasa a obsoleta, el documento toma los datos de la nueva, se pide la
 * lectura a los cargos destinatarios y, si la versión vino de una solicitud, esta queda ejecutada.
 */
export async function publishVersion(context: StepContext, effectiveDate: string): Promise<void> {
  const { tx, actor, document, version } = context;
  const previous = await tx.docVersion.findFirst({
    where: { documentId: document.id, status: 'current', deletedAt: null },
  });
  if (previous !== null) {
    await tx.docVersion.update({
      where: { id: previous.id },
      data: { status: 'obsolete', obsoletedAt: actor.at },
    });
  }
  await moveVersion(context, 'publish', {
    publishedAt: actor.at,
    effectiveDate: fromCalendarDate(effectiveDate),
  });
  const published = await tx.docDocument.update({
    where: { id: document.id },
    data: {
      status: 'current',
      currentVersionId: version.id,
      title: version.title,
      classification: version.classification,
      ownerPositionId: version.ownerPositionId,
    },
  });
  await auditStep(context, 'publish', {
    effective_date: effectiveDate,
    replaced_label: previous?.versionLabel ?? null,
  });
  await requestReading(tx, actor, { document: published, version });
  if (version.changeRequestId !== null) {
    await executeChangeRequest(tx, actor, version.changeRequestId);
  }
}
