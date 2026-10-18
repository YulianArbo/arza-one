import {
  dispositionActionSchema,
  dispositionProposalStatusSchema,
  retentionDispositionSchema,
  type DispositionItem,
  type DispositionProposal,
  type DispositionStep,
} from '@arza/contracts';

import type { DocDispositionProposal } from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { participationOf, taskActorOf, type Participation } from '../../wf/index.js';
import { DISPOSITION_STATES } from '../domain/doc-flows.js';

// Vista de las propuestas de disposición (B21): cuántos documentos se eliminan y se conservan,
// quién la envió y la decidió, en qué paso va y qué puede hacer la persona ahora.

export interface DispositionReader {
  readonly userId: string;
  readonly canManage: boolean;
  readonly canApprove: boolean;
  readonly principal: Principal;
  readonly ability: AppAbility;
}

export function dispositionReaderOf(principal: Principal, ability: AppAbility): DispositionReader {
  return {
    userId: principal.userId,
    canManage: hasPermission(ability, 'doc.retention.manage'),
    canApprove: hasPermission(ability, 'doc.disposition.approve'),
    principal,
    ability,
  };
}

const OPEN = new Set(['review', 'in_approval']);

interface Lookups {
  readonly people: ReadonlyMap<string, string>;
  readonly counts: ReadonlyMap<string, { destroy: number; keep: number }>;
  readonly steps: ReadonlyMap<string, Participation>;
}

async function stepsOf(
  tx: TenantTransaction,
  reader: DispositionReader,
  proposals: readonly DocDispositionProposal[],
  at: Date,
): Promise<Map<string, Participation>> {
  const steps = new Map<string, Participation>();
  const open = proposals.filter((p) => p.workflowInstanceId !== null && OPEN.has(p.status));
  if (open.length === 0) return steps;
  const actor = await taskActorOf(tx, reader.principal, reader.ability, at);
  for (const proposal of open) {
    if (proposal.workflowInstanceId === null) continue;
    const step = await participationOf(tx, proposal.workflowInstanceId, actor);
    if (step !== null) steps.set(proposal.id, step);
  }
  return steps;
}

async function countsOf(tx: TenantTransaction, ids: readonly string[]) {
  const groups = await tx.docDisposition.groupBy({
    by: ['proposalId', 'action'],
    where: { proposalId: { in: [...ids] }, deletedAt: null },
    _count: { _all: true },
  });
  const counts = new Map<string, { destroy: number; keep: number }>();
  for (const group of groups) {
    const entry = counts.get(group.proposalId) ?? { destroy: 0, keep: 0 };
    if (group.action === 'keep') entry.keep += group._count._all;
    else entry.destroy += group._count._all;
    counts.set(group.proposalId, entry);
  }
  return counts;
}

async function lookups(
  tx: TenantTransaction,
  reader: DispositionReader,
  proposals: readonly DocDispositionProposal[],
  at: Date,
): Promise<Lookups> {
  const personIds = proposals.flatMap((p) => [p.sentBy, p.decidedBy].filter((id) => id !== null));
  const people = await peopleById(tx, personIds);
  return {
    people: new Map([...people].map(([id, person]) => [id, person.displayName ?? person.email])),
    counts: await countsOf(
      tx,
      proposals.map((p) => p.id),
    ),
    steps: await stepsOf(tx, reader, proposals, at),
  };
}

function actionsFor(
  proposal: DocDispositionProposal,
  step: Participation | undefined,
  reader: DispositionReader,
): DispositionStep[] {
  if (step === undefined) return [];
  if (step.stateKey === DISPOSITION_STATES.review && step.attendsAction && reader.canManage) {
    return ['send'];
  }
  const sender = proposal.sentBy === reader.userId;
  if (step.stateKey === DISPOSITION_STATES.approval && step.attendsApproval && !sender) {
    return reader.canApprove ? ['approve', 'reject'] : [];
  }
  return [];
}

function person(found: Lookups, id: string | null): DispositionProposal['sent_by'] {
  return id === null ? null : { id, name: found.people.get(id) ?? 'Persona retirada' };
}

function view(
  proposal: DocDispositionProposal,
  found: Lookups,
  reader: DispositionReader,
): DispositionProposal {
  const step = found.steps.get(proposal.id);
  const counts = found.counts.get(proposal.id) ?? { destroy: 0, keep: 0 };
  return {
    id: proposal.id,
    code: proposal.code,
    period: toCalendarDate(proposal.period),
    status: dispositionProposalStatusSchema.parse(proposal.status),
    to_destroy: counts.destroy,
    to_keep: counts.keep,
    created_at: proposal.createdAt.toISOString(),
    sent_by: person(found, proposal.sentBy),
    sent_at: proposal.sentAt?.toISOString() ?? null,
    decided_by: person(found, proposal.decidedBy),
    decided_at: proposal.decidedAt?.toISOString() ?? null,
    decision_note: proposal.decisionNote,
    executed_at: proposal.executedAt?.toISOString() ?? null,
    has_certificate: proposal.certificateFileId !== null,
    workflow_instance_id: proposal.workflowInstanceId,
    step: step === undefined || step.completed ? null : step.stateLabel,
    actions: actionsFor(proposal, step, reader),
    can_edit_items: proposal.status === 'review' && reader.canManage,
    version: proposal.version,
  };
}

export async function proposalViews(
  tx: TenantTransaction,
  reader: DispositionReader,
  proposals: readonly DocDispositionProposal[],
  at: Date,
): Promise<DispositionProposal[]> {
  const found = await lookups(tx, reader, proposals, at);
  return proposals.map((proposal) => view(proposal, found, reader));
}

/** Los documentos de una propuesta, en orden de código. */
export async function itemViews(
  tx: TenantTransaction,
  proposalId: string,
): Promise<DispositionItem[]> {
  const items = await tx.docDisposition.findMany({
    where: { proposalId, deletedAt: null },
    include: {
      document: { select: { id: true, code: true, title: true, docType: true, status: true } },
      retentionRule: { select: { id: true, code: true, name: true, disposition: true } },
    },
    orderBy: { document: { code: 'asc' } },
  });
  return items.map((item) => ({
    id: item.id,
    document: {
      id: item.document.id,
      code: item.document.code,
      title: item.document.title,
      doc_type: item.document.docType,
      status: item.document.status,
    },
    rule: {
      id: item.retentionRule.id,
      code: item.retentionRule.code,
      name: item.retentionRule.name,
      disposition: retentionDispositionSchema.parse(item.retentionRule.disposition),
    },
    due_on: toCalendarDate(item.dueOn),
    action: dispositionActionSchema.parse(item.action),
    keep_reason: item.keepReason,
    executed_at: item.executedAt?.toISOString() ?? null,
    version: item.version,
  }));
}
