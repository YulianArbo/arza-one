import { SYSTEM_ROLES } from '@arza/contracts';

import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  syncPermissionCatalog,
  syncSystemRole,
  type CatalogSync,
  type RoleSyncResult,
} from '../infrastructure/access-catalog.js';

// Datos semilla de acceso (capítulo 12.1): el catálogo del anexo G y los roles del sistema de cada
// empresa. Los usa `pnpm db:seed` y, en las pruebas, cada empresa nueva.

async function recordRoleChange(
  tx: TenantTransaction,
  tenantId: string,
  result: RoleSyncResult,
  now: Date,
): Promise<void> {
  const touched = Object.keys(result.fields).length > 0;
  if (!touched && result.added + result.changed + result.removed === 0) return;
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: now,
    actor: { kind: 'system' },
    action: 'iam.role.sync',
    entityType: 'iam_role',
    entityId: result.roleId,
    result: 'success',
    changes: {
      ...result.fields,
      permissions_added: result.added,
      permissions_changed: result.changed,
      permissions_removed: result.removed,
    },
    meta: null,
  });
}

/** El catálogo es común a todas las empresas; su carga queda en la auditoría de la primera. */
async function recordCatalogSync(
  tx: TenantTransaction,
  tenantId: string,
  sync: CatalogSync,
  now: Date,
): Promise<void> {
  const { added, updated, retired } = sync.counts;
  if (!sync.attempted && added + updated + retired === 0) return;
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: now,
    actor: { kind: 'system' },
    action: 'iam.permission.sync',
    entityType: 'iam_permission',
    entityId: null,
    result: 'success',
    changes: { added, updated, retired },
    meta: null,
  });
}

/**
 * Carga el catálogo y deja los roles del sistema de cada empresa como dice la matriz. Cada rol va
 * en su propia transacción, corta; la carga se puede repetir y corrige lo que falte.
 */
export async function seedAccessControl(
  database: DatabaseService,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  const [first] = tenantIds;
  if (first === undefined) return;
  const now = clock.now();
  const permissionIds = await database.withTenant({ tenantId: first, userId: null }, async (tx) => {
    const sync = await syncPermissionCatalog(tx, now);
    await recordCatalogSync(tx, first, sync, now);
    return sync.ids;
  });
  for (const tenantId of tenantIds) {
    for (const role of SYSTEM_ROLES) {
      await database.withTenant({ tenantId, userId: null }, async (tx) => {
        const result = await syncSystemRole(tx, { tenantId, role }, permissionIds, now);
        await recordRoleChange(tx, tenantId, result, now);
      });
    }
  }
}
