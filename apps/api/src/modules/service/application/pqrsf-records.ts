import {
  PQRSF_DEFAULT_TERMS,
  PQRSF_RULES,
  pqrsfApprovalSchema,
  pqrsfChannelSchema,
  pqrsfStatusSchema,
  pqrsfTermDays,
  pqrsfTypeSchema,
  privacyKindSchema,
  type PqrsfDetail,
  type PqrsfDueState,
  type PqrsfSummary,
  type PqrsfType,
  type PrivacyKind,
} from '@arza/contracts';

import type { SvcPqrsf } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  bogotaToday,
  businessDeadline,
  fromCalendarDate,
  pqrsfTermsOn,
  toCalendarDate,
} from '../../core/index.js';
import { personRef, serviceNotFound } from './service-support.js';

// Piezas comunes de las PQRSF (B29, ficha 17.9): el plazo en días hábiles, lo que va en la auditoría
// y en los eventos, cómo va el plazo y la forma en que la ven la bandeja y la ficha.

export const OPEN_STATUSES = ['filed', 'classified', 'in_progress'] as const;

export interface PqrsfDeadline {
  readonly termDays: number;
  readonly dueOn: Date;
  readonly warnOn: Date;
}

/**
 * El plazo que le toca, contado en días hábiles desde el día siguiente al radicado (decisión 2): el
 * de su tipo o, si trata de datos personales, el de la Ley 1581. El aviso de «por vencer» sale
 * cuando faltan dos días hábiles (decisión 11).
 */
export async function pqrsfDeadline(
  tx: TenantTransaction,
  receivedAt: Date,
  type: PqrsfType,
  privacyKind: PrivacyKind | null,
): Promise<PqrsfDeadline> {
  const received = bogotaToday(receivedAt);
  const terms = (await pqrsfTermsOn(tx, received)) ?? PQRSF_DEFAULT_TERMS;
  const termDays = pqrsfTermDays(terms, type, privacyKind);
  const warnDays = Math.max(termDays - PQRSF_RULES.warnBusinessDaysBefore, 0);
  const dueOn = await businessDeadline(tx, received, termDays);
  const warnOn = warnDays === 0 ? received : await businessDeadline(tx, received, warnDays);
  return { termDays, dueOn: fromCalendarDate(dueOn), warnOn: fromCalendarDate(warnOn) };
}

/** Lo que va en la auditoría: sin nombre, correo ni teléfono de quien la presentó. */
export function pqrsfAudit(pqrsf: SvcPqrsf): Record<string, string | number | null> {
  return {
    code: pqrsf.code,
    type: pqrsf.type,
    privacy_kind: pqrsf.privacyKind,
    status: pqrsf.status,
    approval: pqrsf.approval,
    channel: pqrsf.channel,
    due_on: toCalendarDate(pqrsf.dueOn),
    assignee_id: pqrsf.assigneeId,
  };
}

/** Lo que va en el evento: identificadores y códigos, nunca datos personales. */
export function pqrsfPayload(pqrsf: SvcPqrsf): Record<string, string | null> {
  return {
    code: pqrsf.code,
    type: pqrsf.type,
    privacy_kind: pqrsf.privacyKind,
    status: pqrsf.status,
    assignee_id: pqrsf.assigneeId,
    drafted_by: pqrsf.draftedBy,
    party_id: pqrsf.partyId,
  };
}

export function isOpen(pqrsf: Pick<SvcPqrsf, 'status'>): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(pqrsf.status);
}

export function dueStateOf(pqrsf: SvcPqrsf, now: Date): PqrsfDueState {
  if (!isOpen(pqrsf)) return 'stopped';
  const today = bogotaToday(now);
  if (today > toCalendarDate(pqrsf.dueOn)) return 'overdue';
  return today >= toCalendarDate(pqrsf.warnOn) ? 'at_risk' : 'on_time';
}

/** La PQRSF de la empresa; para quien no puede ver PQRSF «no existe». */
export async function findPqrsf(tx: TenantTransaction, id: string): Promise<SvcPqrsf> {
  const pqrsf = await tx.svcPqrsf.findFirst({ where: { id, deletedAt: null } });
  if (pqrsf === null) throw serviceNotFound('La PQRSF');
  return pqrsf;
}

export function pqrsfSummary(
  pqrsf: SvcPqrsf,
  names: ReadonlyMap<string, string>,
  parties: ReadonlyMap<string, string>,
  now: Date,
): PqrsfSummary {
  return {
    id: pqrsf.id,
    code: pqrsf.code,
    type: pqrsfTypeSchema.parse(pqrsf.type),
    privacy_kind: pqrsf.privacyKind === null ? null : privacyKindSchema.parse(pqrsf.privacyKind),
    status: pqrsfStatusSchema.parse(pqrsf.status),
    approval: pqrsfApprovalSchema.parse(pqrsf.approval),
    channel: pqrsfChannelSchema.parse(pqrsf.channel),
    requester_name: pqrsf.requesterName,
    subject: pqrsf.subject,
    party:
      pqrsf.partyId === null
        ? null
        : { id: pqrsf.partyId, name: parties.get(pqrsf.partyId) ?? 'Tercero' },
    assignee: personRef(names, pqrsf.assigneeId),
    received_at: pqrsf.receivedAt.toISOString(),
    due_on: toCalendarDate(pqrsf.dueOn),
    due_state: dueStateOf(pqrsf, now),
  };
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function pqrsfDetail(
  pqrsf: SvcPqrsf,
  summary: PqrsfSummary,
  names: ReadonlyMap<string, string>,
  can: PqrsfDetail['can'],
): PqrsfDetail {
  return {
    ...summary,
    description: pqrsf.description,
    requester_email: pqrsf.requesterEmail,
    requester_phone: pqrsf.requesterPhone,
    term_days: pqrsf.termDays,
    warn_on: toCalendarDate(pqrsf.warnOn),
    response_draft: pqrsf.responseDraft,
    well_founded: pqrsf.wellFounded,
    drafted_by: personRef(names, pqrsf.draftedBy),
    submitted_at: iso(pqrsf.submittedAt),
    return_reason: pqrsf.returnReason,
    response: pqrsf.response,
    approved_by: personRef(names, pqrsf.approvedBy),
    responded_at: iso(pqrsf.respondedAt),
    transferred_at: iso(pqrsf.transferredAt),
    nonconformity_at: iso(pqrsf.nonconformityAt),
    ack_sent_at: iso(pqrsf.ackSentAt),
    response_sent_at: iso(pqrsf.responseSentAt),
    closed_at: iso(pqrsf.closedAt),
    created_by: personRef(names, pqrsf.createdBy),
    version: pqrsf.version,
    can,
  };
}

export function peopleOfPqrsf(pqrsf: SvcPqrsf): (string | null)[] {
  return [pqrsf.assigneeId, pqrsf.draftedBy, pqrsf.approvedBy, pqrsf.createdBy];
}

/** Qué puede hacer la persona con esta PQRSF; la API lo vuelve a comprobar en cada paso. */
export function pqrsfAbilities(
  ability: AppAbility,
  pqrsf: SvcPqrsf,
  userId: string,
): PqrsfDetail['can'] {
  const classify = hasUnconditionalPermission(ability, 'service.pqrsf.classify');
  const respond = hasUnconditionalPermission(ability, 'service.pqrsf.respond');
  const approve = hasUnconditionalPermission(ability, 'service.pqrsf.approve');
  const pending = pqrsf.approval === 'pending';
  return {
    classify: classify && ['filed', 'classified'].includes(pqrsf.status),
    assign: classify && ['classified', 'in_progress'].includes(pqrsf.status),
    draft: respond && ['classified', 'in_progress'].includes(pqrsf.status) && !pending,
    approve: approve && pending && pqrsf.draftedBy !== userId,
    close: classify && pqrsf.status === 'responded',
  };
}
