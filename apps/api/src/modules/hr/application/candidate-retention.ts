import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { hasAccountForParty } from '../../iam/index.js';
import { eraseRecruitmentIdentity } from '../../party/index.js';
import { canEraseRecruitmentIdentity } from '../../privacy/index.js';

const BATCH_SIZE = 100;

interface RetentionDeps {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

interface RetentionScope {
  readonly tenantId: string;
  readonly today: string;
  readonly at: Date;
}

/** Candidatura vencida con los datos necesarios para anonimizarla. */
interface ClaimableCandidate {
  readonly version: number;
  readonly partyId: string;
  readonly consentId: string;
  readonly talentBank: boolean;
}

/** Aplica el plazo de selección únicamente cuando se puede retirar la identidad con seguridad. */
export async function expireRecruitmentData(deps: RetentionDeps): Promise<number> {
  const at = deps.clock.now();
  const today = bogotaToday(at);
  const tenants = await expiredTenants(deps.database, today);
  let expired = 0;
  for (const tenantId of tenants) {
    expired += await expireTenant(deps.database, { tenantId, today, at });
  }
  return expired;
}

/** Tenants con candidaturas vencidas según la función de base de datos. */
async function expiredTenants(
  database: RetentionDeps['database'],
  today: string,
): Promise<readonly string[]> {
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ tenant_id: string }[]>`
    SELECT hr_tenants_with_expired_candidates(${today}::date)::text AS tenant_id
  `,
  );
  return rows.map((row) => row.tenant_id);
}

/** Recorre por lotes las candidaturas vencidas de un tenant. */
async function expireTenant(
  database: RetentionDeps['database'],
  scope: RetentionScope,
): Promise<number> {
  const context = { tenantId: scope.tenantId, userId: null };
  let after: string | undefined;
  let expired = 0;
  for (;;) {
    const ids = await pendingCandidates(database, context, scope, after);
    for (const id of ids) {
      if (await expireCandidate(database, context, scope, id)) expired += 1;
    }
    after = ids.at(-1);
    if (ids.length < BATCH_SIZE) return expired;
  }
}

/** Identificadores de la siguiente página de candidaturas vencidas. */
async function pendingCandidates(
  database: RetentionDeps['database'],
  context: { readonly tenantId: string; readonly userId: null },
  scope: RetentionScope,
  after: string | undefined,
): Promise<readonly string[]> {
  const rows = await database.withTenant(context, (tx) =>
    tx.hrCandidate.findMany({
      where: {
        tenantId: scope.tenantId,
        stage: 'discarded',
        erasedAt: null,
        retentionUntil: { lte: fromCalendarDate(scope.today) },
        deletedAt: null,
        ...(after === undefined ? {} : { id: { gt: after } }),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    }),
  );
  return rows.map((row) => row.id);
}

/** Intenta anonimizar una candidatura; los datos compartidos la dejan intacta. */
async function expireCandidate(
  database: RetentionDeps['database'],
  context: { readonly tenantId: string; readonly userId: null },
  scope: RetentionScope,
  id: string,
): Promise<boolean> {
  return database
    .withTenant(context, (tx) => eraseCandidate(tx, scope, id))
    .catch((error: unknown) => {
      if (error instanceof SharedRecruitmentIdentity) return false;
      throw error;
    });
}

async function eraseCandidate(
  tx: TenantTransaction,
  scope: RetentionScope,
  id: string,
): Promise<boolean> {
  const candidate = await claimableCandidate(tx, scope, id);
  if (candidate === null) return false;
  const claimed = await tx.hrCandidate.updateMany({
    where: { id, tenantId: scope.tenantId, version: candidate.version, erasedAt: null },
    data: { erasedAt: scope.at, discardReason: 'Datos de selección eliminados' },
  });
  if (claimed.count !== 1) return false;
  await retireIdentity(tx, scope, candidate);
  await clearEvaluations(tx, scope, id);
  await auditErasure(tx, scope, id);
  return true;
}

/** Candidatura vencida cuya identidad puede retirarse sin afectar otros usos. */
async function claimableCandidate(
  tx: TenantTransaction,
  scope: RetentionScope,
  id: string,
): Promise<ClaimableCandidate | null> {
  const candidate = await tx.hrCandidate.findFirst({
    where: {
      id,
      tenantId: scope.tenantId,
      stage: 'discarded',
      erasedAt: null,
      deletedAt: null,
      retentionUntil: { lte: fromCalendarDate(scope.today) },
    },
  });
  if (candidate === null) return null;
  if (candidate.resumeFileId !== null) return null;
  if (await partyInUse(tx, scope.tenantId, candidate.partyId, id)) return null;
  return candidate;
}

/** Indica si la persona aún se usa en otra candidatura, como colaborador o con cuenta. */
async function partyInUse(
  tx: TenantTransaction,
  tenantId: string,
  partyId: string,
  candidateId: string,
): Promise<boolean> {
  const otherUse = await tx.hrCandidate.count({
    where: { tenantId, partyId, NOT: { id: candidateId } },
  });
  const employees = await tx.hrEmployee.count({ where: { tenantId, partyId } });
  if (otherUse > 0 || employees > 0) return true;
  return hasAccountForParty(tx, partyId);
}

/** Retira la identidad de la persona; si no es posible, revierte la marca de anonimización. */
async function retireIdentity(
  tx: TenantTransaction,
  scope: RetentionScope,
  candidate: { readonly partyId: string; readonly consentId: string; readonly talentBank: boolean },
): Promise<void> {
  const consent = await canEraseRecruitmentIdentity(tx, {
    id: candidate.consentId,
    partyId: candidate.partyId,
    talentBank: candidate.talentBank,
  });
  const erased =
    consent && (await eraseRecruitmentIdentity(tx, scope.tenantId, candidate.partyId, scope.at));
  if (!erased) {
    // Revertir evita marcar como anonimizado un registro que aún tiene su identidad.
    throw new SharedRecruitmentIdentity();
  }
}

/** Las notas de evaluación dejan de ser datos personales de la candidatura. */
async function clearEvaluations(
  tx: TenantTransaction,
  scope: RetentionScope,
  id: string,
): Promise<void> {
  await tx.hrSelectionEvaluation.updateMany({
    where: { tenantId: scope.tenantId, candidateId: id },
    data: { note: null, evaluatorId: null, deletedAt: scope.at },
  });
}

async function auditErasure(
  tx: TenantTransaction,
  scope: RetentionScope,
  id: string,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: scope.tenantId,
    occurredAt: scope.at,
    actor: { kind: 'system' },
    action: 'hr.candidate.erase',
    entityType: 'hr_candidate',
    entityId: id,
    result: 'success',
    changes: { erased: true },
    meta: null,
  });
}

class SharedRecruitmentIdentity extends Error {}
