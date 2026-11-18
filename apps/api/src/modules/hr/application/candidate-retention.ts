import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { disposeAttachedFile, type FileStorage } from '../../doc/index.js';
import { hasAccountForParty } from '../../iam/index.js';
import { dropCandidateRole, eraseRecruitmentIdentity } from '../../party/index.js';
import { canEraseRecruitmentIdentity } from '../../privacy/index.js';

// Eliminación de los datos de candidatos no seleccionados (B35, ficha 17.13): llegada la fecha de
// eliminación (doce meses después del descarte, o la que aplazó Talento humano para el banco de
// hojas de vida), cada noche se borran la hoja de vida, las notas de evaluación y los datos de la
// persona. Si la persona también es cliente, proveedor, colaborador o tiene otra candidatura, su
// ficha de Terceros se conserva y solo pierde el papel de candidato (decisión B). Queda el rastro
// anónimo de la candidatura: vacante, origen, etapas y fechas.

const BATCH_SIZE = 100;

interface RetentionDeps {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'delete'>;
}

interface RetentionScope {
  readonly tenantId: string;
  readonly today: string;
  readonly at: Date;
}

interface ExpiredCandidate {
  readonly id: string;
  readonly version: number;
  readonly partyId: string;
  readonly consentId: string;
  readonly resumeFileId: string | null;
}

/** Qué pasó con la persona en Terceros. */
type IdentityOutcome = 'anonymized' | 'role_removed' | 'kept';

/** Elimina los datos de las candidaturas vencidas de todas las empresas; devuelve cuántas. */
export async function expireRecruitmentData(deps: RetentionDeps): Promise<number> {
  const at = deps.clock.now();
  const today = bogotaToday(at);
  let expired = 0;
  for (const tenantId of await expiredTenants(deps.database, today)) {
    expired += await expireTenant(deps, { tenantId, today, at });
  }
  return expired;
}

/** Empresas con candidaturas vencidas según la función de base de datos. */
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

/** Recorre por lotes las candidaturas vencidas de una empresa. */
async function expireTenant(deps: RetentionDeps, scope: RetentionScope): Promise<number> {
  let after: string | undefined;
  let expired = 0;
  for (;;) {
    const ids = await pendingCandidates(deps.database, scope, after);
    for (const id of ids) {
      if (await expireCandidate(deps, scope, id)) expired += 1;
    }
    after = ids.at(-1);
    if (ids.length < BATCH_SIZE) return expired;
  }
}

function expiredWhere(scope: RetentionScope) {
  return {
    tenantId: scope.tenantId,
    stage: 'discarded',
    erasedAt: null,
    retentionUntil: { lte: fromCalendarDate(scope.today) },
    deletedAt: null,
  };
}

/** Identificadores de la siguiente página de candidaturas vencidas. */
async function pendingCandidates(
  database: RetentionDeps['database'],
  scope: RetentionScope,
  after: string | undefined,
): Promise<readonly string[]> {
  const rows = await database.withTenant({ tenantId: scope.tenantId, userId: null }, (tx) =>
    tx.hrCandidate.findMany({
      where: { ...expiredWhere(scope), ...(after === undefined ? {} : { id: { gt: after } }) },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    }),
  );
  return rows.map((row) => row.id);
}

/** Elimina una candidatura en su transacción y, ya confirmada, borra su archivo del almacenamiento. */
async function expireCandidate(
  deps: RetentionDeps,
  scope: RetentionScope,
  id: string,
): Promise<boolean> {
  const result = await deps.database.withTenant({ tenantId: scope.tenantId, userId: null }, (tx) =>
    eraseCandidate(tx, scope, id),
  );
  if (result === null) return false;
  if (result.storageKey !== null) await deps.storage.delete(result.storageKey);
  return true;
}

async function eraseCandidate(
  tx: TenantTransaction,
  scope: RetentionScope,
  id: string,
): Promise<{ readonly storageKey: string | null } | null> {
  const candidate: ExpiredCandidate | null = await tx.hrCandidate.findFirst({
    where: { id, ...expiredWhere(scope) },
  });
  if (candidate === null) return null;
  const claimed = await tx.hrCandidate.updateMany({
    where: { id, version: candidate.version, erasedAt: null },
    data: {
      erasedAt: scope.at,
      resumeFileId: null,
      discardReason: 'Datos de selección eliminados',
    },
  });
  if (claimed.count !== 1) return null;
  const storageKey = await retireResume(tx, scope, candidate.resumeFileId);
  const identity = await settleIdentity(tx, scope, candidate);
  await clearEvaluations(tx, scope, id);
  await auditErasure(tx, scope, id, { resume: candidate.resumeFileId !== null, identity });
  return { storageKey };
}

/** La hoja de vida se retira, salvo que ya haga parte de la historia laboral de un colaborador. */
async function retireResume(
  tx: TenantTransaction,
  scope: RetentionScope,
  fileId: string | null,
): Promise<string | null> {
  if (fileId === null) return null;
  const inFile = await tx.hrFileChecklistItem.count({
    where: { tenantId: scope.tenantId, documentId: fileId, deletedAt: null },
  });
  return inFile > 0 ? null : disposeAttachedFile(tx, fileId, scope.at);
}

/** Anonimiza la persona si solo existía para esta candidatura; si no, conserva su ficha. */
async function settleIdentity(
  tx: TenantTransaction,
  scope: RetentionScope,
  candidate: ExpiredCandidate,
): Promise<IdentityOutcome> {
  const { tenantId, at } = scope;
  const otherCandidacies = await tx.hrCandidate.count({
    where: { tenantId, partyId: candidate.partyId, erasedAt: null, NOT: { id: candidate.id } },
  });
  if (otherCandidacies > 0) return 'kept';
  const usedElsewhere =
    (await tx.hrEmployee.count({ where: { tenantId, partyId: candidate.partyId } })) > 0 ||
    (await hasAccountForParty(tx, candidate.partyId));
  const consentAllows = await canEraseRecruitmentIdentity(tx, {
    id: candidate.consentId,
    partyId: candidate.partyId,
  });
  if (!usedElsewhere && consentAllows) {
    if (await eraseRecruitmentIdentity(tx, tenantId, candidate.partyId, at)) return 'anonymized';
  }
  await dropCandidateRole(tx, tenantId, candidate.partyId, at);
  return 'role_removed';
}

/** Las notas de evaluación dejan de ser datos personales de la candidatura. */
async function clearEvaluations(
  tx: TenantTransaction,
  scope: RetentionScope,
  id: string,
): Promise<void> {
  await tx.hrSelectionEvaluation.updateMany({
    where: { tenantId: scope.tenantId, candidateId: id, deletedAt: null },
    data: { note: null, evaluatorId: null, deletedAt: scope.at },
  });
}

async function auditErasure(
  tx: TenantTransaction,
  scope: RetentionScope,
  id: string,
  outcome: { readonly resume: boolean; readonly identity: IdentityOutcome },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: scope.tenantId,
    occurredAt: scope.at,
    actor: { kind: 'system' },
    action: 'hr.candidate.erase',
    entityType: 'hr_candidate',
    entityId: id,
    result: 'success',
    changes: { erased: true, resume_removed: outcome.resume, identity: outcome.identity },
    meta: null,
  });
}
