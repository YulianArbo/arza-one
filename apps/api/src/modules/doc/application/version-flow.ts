import { z } from 'zod';

import type { DocVersion } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday } from '../../core/index.js';
import { startWorkflow, type TransitionNotice, type WfContext } from '../../wf/index.js';
import { VERSION_FLOW, VERSION_STATES } from '../domain/doc-flows.js';
import { pdfNotReady, selfApproval, versionNotFound } from './doc-messages.js';
import { lockDocument, type DocActor } from './doc-support.js';
import { auditStep, moveVersion, publishVersion, type StepContext } from './version-steps.js';

// El trámite de una versión en el motor de flujos (B19, ADR-023): nace con la versión y cada paso
// que da (desde la ficha o desde «Mis tareas») cambia la versión en la misma transacción. Quien
// elabora la versión no la revisa, no la aprueba ni la devuelve, ni por delegación.

const effectiveDateFact = z.iso.date();

/** Inicia el trámite de una versión elaborada en la plataforma y lo deja anotado en ella. */
export async function startVersionFlow(
  tx: TenantTransaction,
  actor: DocActor,
  target: { readonly version: DocVersion; readonly code: string },
): Promise<string> {
  const { version, code } = target;
  const instance = await startWorkflow(tx, actor, {
    key: VERSION_FLOW,
    entityType: VERSION_FLOW,
    entityId: version.id,
    title: `${code} versión ${version.versionLabel}`,
    facts: {},
  });
  await tx.docVersion.update({
    where: { id: version.id },
    data: { workflowInstanceId: instance.id },
  });
  return instance.id;
}

function assertNotAuthor(version: DocVersion, context: WfContext, notice: TransitionNotice) {
  const decides = notice.action === 'approve' || notice.action === 'reject';
  const author = version.createdBy;
  if (decides && (context.userId === author || notice.onBehalfOf === author)) throw selfApproval();
}

function effectiveDate(notice: TransitionNotice, at: Date): string {
  const parsed = effectiveDateFact.safeParse(notice.facts['effective_date']);
  return parsed.success ? parsed.data : bogotaToday(at);
}

async function applyStep(step: StepContext, notice: TransitionNotice): Promise<void> {
  const { fromState, toState } = notice;
  if (toState === VERSION_STATES.review && fromState === VERSION_STATES.drafting) {
    if (step.version.renderStatus !== 'ready') throw pdfNotReady();
    await moveVersion(step, 'submit', { submittedAt: step.actor.at, reviewNote: null });
    await auditStep(step, 'submit');
  } else if (toState === VERSION_STATES.approval) {
    await auditStep(step, 'review');
  } else if (toState === VERSION_STATES.drafting) {
    const note = notice.comment ?? 'Devuelta para corregir.';
    await moveVersion(step, 'reject', { submittedAt: null, reviewNote: note });
    await auditStep(step, 'reject', { note });
  } else if (toState === VERSION_STATES.publication) {
    await moveVersion(step, 'approve', {
      approvedBy: step.actor.userId,
      approvedAt: step.actor.at,
    });
    await auditStep(step, 'approve');
  } else if (toState === VERSION_STATES.published) {
    await publishVersion(step, effectiveDate(notice, step.actor.at));
  }
}

/** Oyente del trámite de las versiones: la versión sigue el paso que dio el trámite. */
export async function followVersionFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const found = await tx.docVersion.findFirst({ where: { id: notice.entityId, deletedAt: null } });
  if (found === null) throw versionNotFound();
  await lockDocument(tx, context.tenantId, found.documentId);
  const version = await tx.docVersion.findUniqueOrThrow({ where: { id: found.id } });
  assertNotAuthor(version, context, notice);
  const document = await tx.docDocument.findUniqueOrThrow({ where: { id: version.documentId } });
  await applyStep({ tx, actor: context, document, version }, notice);
}
