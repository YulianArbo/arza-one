import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  syncPermissionCatalog,
  syncSystemRoles,
  type RoleSyncResult,
} from '../infrastructure/access-catalog.js';

// Datos semilla de acceso (capítulo 12.1): el catálogo del anexo G y los roles del sistema de cada
// empresa. Los usa `pnpm db:seed` y, en las pruebas, cada empresa nueva.

async function recordRoleChanges(
  tx: TenantTransaction,
  tenantId: string,
  results: readonly RoleSyncResult[],
  now: Date,
): Promise<void> {
  for (const result of results) {
    if (result.added + result.changed + result.removed === 0) continue;
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: now,
      actor: { kind: 'system' },
      action: 'iam.role.sync',
      entityType: 'iam_role',
      entityId: result.roleId,
      result: 'success',
      changes: {
        permissions_added: result.added,
        permissions_changed: result.changed,
        permissions_removed: result.removed,
      },
      meta: null,
    });
  }
}

/** Carga el catálogo y deja los roles del sistema de cada empresa como dice la matriz. */
export async function seedAccessControl(
  database: DatabaseService,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  const now = clock.now();
  for (const tenantId of tenantIds) {
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      const permissionIds = await syncPermissionCatalog(tx, now);
      const results = await syncSystemRoles(tx, tenantId, permissionIds, now);
      await recordRoleChanges(tx, tenantId, results, now);
    });
  }
}
