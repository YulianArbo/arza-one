import type { CrmQuote, Prisma } from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  requestTransition,
  startWorkflow,
  taskActorOf,
  type TransitionNotice,
  type WfContext,
} from '../../wf/index.js';
import { QUOTE_FLOW, QUOTE_FLOW_STATES } from '../domain/crm-flows.js';
import { selfApproval } from './crm-messages.js';
import { recordCrmChange, type CrmActor } from './crm-support.js';
import { findQuote, quoteAudit } from './quote-records.js';

// La decisión de la Dirección sobre una cotización en aprobación (B23). Se toma desde la ficha de
// la cotización o desde Mis tareas; las dos llegan aquí, en la misma transacción que el trámite.
// Quien elaboró la cotización no la aprueba ni la devuelve, ni por delegación.

/** Quien pide el paso: su sesión y sus permisos, para atender la tarea de la Dirección. */
export interface QuoteRequester {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

/** Datos del evento para avisar a quien la elaboró: nunca datos personales. */
export function quoteEventPayload(quote: CrmQuote): {
  author_id: string | null;
  code: string;
  version_number: number;
} {
  return { author_id: quote.createdBy, code: quote.code, version_number: quote.versionNumber };
}

export function assertNotAuthor(
  quote: CrmQuote,
  userId: string | null,
  onBehalfOf: string | null,
): void {
  const author = quote.createdBy;
  if (author !== null && (userId === author || onBehalfOf === author)) throw selfApproval();
}

/** Mueve la cotización si sigue en aprobación; devuelve falso si otro paso ya la movió. */
async function moveFromApproval(
  tx: TenantTransaction,
  quote: CrmQuote,
  data: Prisma.CrmQuoteUncheckedUpdateManyInput,
): Promise<boolean> {
  const { count } = await tx.crmQuote.updateMany({
    where: { id: quote.id, status: 'in_approval', deletedAt: null },
    data,
  });
  return count > 0;
}

/** Aprobada: el worker prepara su PDF y ya se puede enviar. */
export async function approveQuote(
  tx: TenantTransaction,
  actor: CrmActor,
  quote: CrmQuote,
  note: string | null,
): Promise<void> {
  const moved = await moveFromApproval(tx, quote, {
    status: 'approved',
    pdfStatus: 'pending',
    decidedBy: actor.userId,
    decidedAt: actor.at,
    decisionNote: note,
  });
  if (!moved) return;
  await recordCrmChange(tx, actor, {
    action: 'crm.quote.approve',
    event: 'crm.quote.approved',
    entityType: 'crm_quote',
    entityId: quote.id,
    changes: { ...quoteAudit(quote), status: ['in_approval', 'approved'], note },
    payload: quoteEventPayload(quote),
  });
}

/** Devuelta: vuelve a borrador con el comentario de la Dirección. */
export async function returnQuote(
  tx: TenantTransaction,
  actor: CrmActor,
  quote: CrmQuote,
  comment: string,
): Promise<void> {
  const moved = await moveFromApproval(tx, quote, {
    status: 'draft',
    submittedAt: null,
    discountCap: null,
    requiresApproval: false,
    decidedBy: actor.userId,
    decidedAt: actor.at,
    decisionNote: comment,
  });
  if (!moved) return;
  await recordCrmChange(tx, actor, {
    action: 'crm.quote.return',
    event: 'crm.quote.returned',
    entityType: 'crm_quote',
    entityId: quote.id,
    changes: { ...quoteAudit(quote), status: ['in_approval', 'draft'], comment },
    payload: quoteEventPayload(quote),
  });
}

/** Oyente del trámite: si la Dirección decide desde Mis tareas, la cotización cambia con ella. */
export async function followQuoteFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const quote = await findQuote(tx, notice.entityId);
  // Desde la ficha la cotización ya cambió antes de cerrar la tarea: no hay nada más que hacer.
  if (quote.status !== 'in_approval') return;
  assertNotAuthor(quote, context.userId, notice.onBehalfOf);
  if (notice.toState === QUOTE_FLOW_STATES.approved) {
    await approveQuote(tx, context, quote, notice.comment);
  } else if (notice.toState === QUOTE_FLOW_STATES.returned) {
    await returnQuote(tx, context, quote, notice.comment ?? 'Devuelta para corregir.');
  }
}

/** La Dirección recibe en Mis tareas «Aprobar la cotización …». */
export async function startQuoteApproval(
  tx: TenantTransaction,
  actor: CrmActor,
  quote: Pick<CrmQuote, 'id' | 'code' | 'versionNumber'>,
): Promise<void> {
  const instance = await startWorkflow(tx, actor, {
    key: QUOTE_FLOW,
    entityType: QUOTE_FLOW,
    entityId: quote.id,
    title: `Aprobar la cotización ${quote.code} v${String(quote.versionNumber)}`,
    facts: {},
  });
  await tx.crmQuote.update({ where: { id: quote.id }, data: { workflowInstanceId: instance.id } });
}

/** Cierra la tarea de la Dirección con la misma decisión, si la cotización la tenía. */
export async function closeApprovalTask(
  tx: TenantTransaction,
  actor: CrmActor,
  requester: QuoteRequester,
  instanceId: string | null,
  step: { readonly action: string; readonly comment: string | null },
): Promise<void> {
  if (instanceId === null) return;
  const taskActor = await taskActorOf(tx, requester.principal, requester.ability, actor.at);
  await requestTransition(tx, actor, {
    instanceId,
    action: step.action,
    comment: step.comment,
    facts: {},
    actor: taskActor,
    hasPermission: (code) => hasPermission(requester.ability, code),
  });
}
