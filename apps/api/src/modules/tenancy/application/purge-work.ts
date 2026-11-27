import {
  bogotaToday,
  markFilesPurged,
  platformTenants,
  purgeTenantData,
  tenantsDueForPurge,
  type TenantRecord,
} from '../../core/index.js';
import type { FileStorage } from '../../doc/index.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { OPERATOR_TENANT_ID } from '../../../platform/database/operator-tenant.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';

// Eliminación definitiva (B48, decisión 6, ADR-028). Cada día el worker busca las empresas
// suspendidas cuyo plazo de 30 días venció y borra todos sus datos en una sola transacción, en el
// contexto de la empresa operadora, donde queda la auditoría. Después borra sus archivos. Si los
// archivos fallan, la empresa queda cerrada y la siguiente pasada lo intenta de nuevo.

export interface PurgeWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant' | 'withTenantFor'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'deletePrefix'>;
}

export interface PurgeWorkResult {
  readonly purged: number;
  readonly filesPurged: number;
}

/** Tiempo máximo de la transacción que borra los datos de una empresa. */
const PURGE_TIMEOUT_MS = 10 * 60 * 1000;

const OPERATOR = { tenantId: OPERATOR_TENANT_ID, userId: null };

async function auditPurge(
  tx: TenantTransaction,
  at: Date,
  entry: { action: string; tenantId: string; changes: Record<string, number | string> },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: OPERATOR_TENANT_ID,
    occurredAt: at,
    actor: { kind: 'system' },
    action: entry.action,
    entityType: 'tenant',
    entityId: entry.tenantId,
    result: 'success',
    changes: entry.changes,
    meta: null,
  });
}

async function purgeData(deps: PurgeWorkDependencies, target: TenantRecord, today: string) {
  const at = deps.clock.now();
  const tenantId = target.id;
  await deps.database.withTenantFor(
    OPERATOR,
    async (tx) => {
      const counts = await purgeTenantData(tx, tenantId, today);
      const rows = Object.values(counts).reduce((total, count) => total + count, 0);
      await auditPurge(tx, at, {
        action: 'platform.tenant.purge',
        tenantId,
        changes: {
          tax_id: target.taxId,
          legal_name: target.legalName,
          tables: Object.keys(counts).length,
          rows_deleted: rows,
        },
      });
      await addOutboxEvent(tx, {
        tenantId: OPERATOR_TENANT_ID,
        eventType: 'tenant.closed',
        actorId: null,
        occurredAt: at,
        payload: { tenant_id: tenantId },
      });
    },
    PURGE_TIMEOUT_MS,
  );
}

async function purgeFiles(deps: PurgeWorkDependencies, tenantId: string): Promise<void> {
  const deleted =
    (await deps.storage.deletePrefix(`${tenantId}/`)) +
    (await deps.storage.deletePrefix(`exports/${tenantId}/`));
  await deps.database.withTenant(OPERATOR, async (tx) => {
    await markFilesPurged(tx, tenantId);
    await auditPurge(tx, deps.clock.now(), {
      action: 'platform.tenant.files_purge',
      tenantId,
      changes: { files_deleted: deleted },
    });
  });
}

/** Una pasada: borra las empresas vencidas y luego sus archivos. */
export async function runTenantPurgeWork(deps: PurgeWorkDependencies): Promise<PurgeWorkResult> {
  const today = bogotaToday(deps.clock.now());
  const due = await deps.database.withoutTenant((tx) => tenantsDueForPurge(tx, today));
  const records = await deps.database.withTenant(OPERATOR, async (tx) => {
    const all = await platformTenants(tx);
    return new Map(all.map((record) => [record.id, record]));
  });
  const result = { purged: 0, filesPurged: 0 };
  for (const tenantId of due) {
    const record = records.get(tenantId);
    if (record?.status === 'suspended') {
      await purgeData(deps, record, today);
      result.purged += 1;
    }
    await purgeFiles(deps, tenantId);
    result.filesPurged += 1;
  }
  return result;
}
