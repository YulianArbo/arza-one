import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, nextBusinessCode } from '../../core/index.js';
import { startWorkflow } from '../../wf/index.js';
import { DISPOSITION_FLOW } from '../domain/doc-flows.js';
import { auditDoc, type DocActor } from './doc-support.js';
import { retentionChanged } from './retention-messages.js';
import { expiredDocuments, retentionFacts, type ExpiredDocument } from './retention-support.js';

// La propuesta mensual de disposición final (B21, numeral 12.4): los documentos cuya regla dice
// eliminar y ya venció. Una por mes y por empresa; la crea el worker cada día (si aún no existe la
// del mes y hay documentos vencidos) o Calidad con «Generar la propuesta del mes». Nada se elimina
// aquí: la propuesta empieza su trámite y le llega a Calidad.

const PROPOSAL_SEQUENCE = 'doc.disposition';
const PROPOSALS = { name: 'Propuestas de disposición final', prefix: 'DIS', padding: 4 } as const;

export interface ProposalOutcome {
  readonly proposalId: string | null;
  readonly created: boolean;
}

/** El mes de la propuesta: el primer día del mes de hoy en Bogotá. */
function periodOf(today: string): string {
  return `${today.slice(0, 8)}01`;
}

async function createProposal(
  tx: TenantTransaction,
  actor: DocActor,
  input: { readonly code: string; readonly period: Date; readonly expired: ExpiredDocument[] },
): Promise<{ readonly id: string }> {
  const proposal = await tx.docDispositionProposal.create({
    data: { tenantId: actor.tenantId, code: input.code, period: input.period },
  });
  await tx.docDisposition.createMany({
    data: input.expired.map((item) => ({
      tenantId: actor.tenantId,
      proposalId: proposal.id,
      documentId: item.documentId,
      retentionRuleId: item.ruleId,
      dueOn: new Date(`${item.dueOn}T00:00:00Z`),
    })),
  });
  return proposal;
}

/** Crea la propuesta del mes si no existe y hay documentos con la retención vencida. */
export async function proposeForTenant(
  tx: TenantTransaction,
  actor: DocActor,
): Promise<ProposalOutcome> {
  const today = bogotaToday(actor.at);
  const period = new Date(`${periodOf(today)}T00:00:00Z`);
  const existing = await tx.docDispositionProposal.findFirst({ where: { period } });
  if (existing !== null) return { proposalId: existing.id, created: false };
  const expired = await expiredDocuments(tx, today);
  if (expired.length === 0) return { proposalId: null, created: false };
  const code = await nextBusinessCode(tx, PROPOSAL_SEQUENCE, actor.at, PROPOSALS);
  const proposal = await createProposal(tx, actor, { code, period, expired });
  const instance = await startWorkflow(tx, actor, {
    key: DISPOSITION_FLOW,
    entityType: DISPOSITION_FLOW,
    entityId: proposal.id,
    title: `${code} · Disposición final de ${String(expired.length)} documentos`,
    facts: { documents: expired.length },
  });
  await tx.docDispositionProposal.update({
    where: { id: proposal.id },
    data: { workflowInstanceId: instance.id },
  });
  await auditDoc(tx, actor, {
    action: 'doc.disposition.propose',
    entityType: 'doc_disposition_proposal',
    entityId: proposal.id,
    changes: { code, period: periodOf(today), documents: expired.length },
  });
  return { proposalId: proposal.id, created: true };
}

/**
 * Antes de aprobar: cada documento que se va a eliminar sigue con su regla de eliminar vencida
 * (la regla o el documento pudieron cambiar después de la propuesta).
 */
export async function stillExpired(
  tx: TenantTransaction,
  proposalId: string,
  at: Date,
): Promise<void> {
  const today = bogotaToday(at);
  const items = await tx.docDisposition.findMany({
    where: { proposalId, action: 'destroy', deletedAt: null },
    include: { document: { select: { code: true } } },
  });
  const facts = await retentionFacts(
    tx,
    items.map((item) => item.documentId),
  );
  const ruleIds = [...facts.values()].flatMap((fact) =>
    fact.ruleId === null ? [] : [fact.ruleId],
  );
  const destroying = new Set(
    (
      await tx.docRetentionRule.findMany({
        where: { id: { in: ruleIds }, disposition: 'destroy' },
        select: { id: true },
      })
    ).map((rule) => rule.id),
  );
  const changed = items.filter((item) => {
    const fact = facts.get(item.documentId);
    const due = fact?.dueOn ?? null;
    return due === null || due > today || !destroying.has(fact?.ruleId ?? '');
  });
  if (changed.length > 0) throw retentionChanged(changed.map((item) => item.document.code));
}

export interface MonthlyProposalDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

/** Trabajo diario del worker: la propuesta del mes de cada empresa que tenga vencidos. */
export async function proposeMonthlyDispositions(
  deps: MonthlyProposalDependencies,
): Promise<number> {
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT doc_tenants_with_published_documents() AS id`,
  );
  let created = 0;
  for (const { id: tenantId } of tenants) {
    const actor = { tenantId, userId: null, meta: null, at: deps.clock.now() };
    const outcome = await deps.database.withTenant({ tenantId, userId: null }, (tx) =>
      proposeForTenant(tx, actor),
    );
    if (outcome.created) created += 1;
  }
  return created;
}
