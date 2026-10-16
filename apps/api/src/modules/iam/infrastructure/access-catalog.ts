import {
  PERMISSIONS,
  splitPermission,
  systemRoleGrants,
  type PermissionDefinition,
  type SystemRoleDefinition,
} from '@arza/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { OWN_CONDITION, isOwnCondition } from './access-store.js';

// Carga del catálogo del anexo G y de los roles del sistema (numerales 15.2 y 15.3) como dato
// semilla. Es idempotente: crea lo que falta, corrige lo que cambió en packages/contracts y no
// toca los roles personalizados.

interface CatalogRow {
  readonly resource: string;
  readonly action: string;
  readonly groupKey: string;
  readonly level: string;
  readonly ownable: boolean;
  readonly description: string;
  readonly deletedAt: Date | null;
}

function catalogRow(permission: PermissionDefinition): CatalogRow {
  const { subject, action } = splitPermission(permission.code);
  return {
    resource: subject,
    action,
    groupKey: permission.group,
    level: permission.level,
    ownable: permission.ownField !== null,
    description: permission.description,
    deletedAt: null,
  };
}

const CATALOG_FIELDS = [
  'resource',
  'action',
  'groupKey',
  'level',
  'ownable',
  'description',
  'deletedAt',
] as const satisfies readonly (keyof CatalogRow)[];

function sameRow(saved: CatalogRow, wanted: CatalogRow): boolean {
  return CATALOG_FIELDS.every((field) => saved[field] === wanted[field]);
}

/**
 * Deja iam_permissions igual al catálogo y escribe solo lo que cambió. Un permiso que sale del
 * catálogo queda borrado. Si dos cargas corren a la vez (una por empresa), la segunda no repite
 * los permisos que la primera ya creó.
 */
export interface CatalogSync {
  /** Identificador de cada permiso, por su código. */
  readonly ids: Map<string, string>;
  /** Cuántos permisos se agregaron, corrigieron y retiraron (0, 0, 0 si ya estaba al día). */
  readonly counts: { readonly added: number; readonly updated: number; readonly retired: number };
  /**
   * Intentó agregar permisos. Aunque otra carga simultánea los haya agregado primero (added en 0),
   * el intento ya escribió en la transacción y debe quedar en la auditoría.
   */
  readonly attempted: boolean;
}

export async function syncPermissionCatalog(
  tx: TenantTransaction,
  now: Date,
): Promise<CatalogSync> {
  const before = new Map((await tx.permission.findMany()).map((row) => [row.code, row]));
  const missing = PERMISSIONS.filter((permission) => !before.has(permission.code));
  const { count: added } = await tx.permission.createMany({
    data: missing.map((permission) => ({ code: permission.code, ...catalogRow(permission) })),
    skipDuplicates: true,
  });
  let updated = 0;
  for (const permission of PERMISSIONS) {
    const existing = before.get(permission.code);
    const row = catalogRow(permission);
    if (existing !== undefined && !sameRow(existing, row)) {
      await tx.permission.update({ where: { id: existing.id }, data: row });
      updated += 1;
    }
  }
  const codes = PERMISSIONS.map((permission) => permission.code);
  const { count: retired } = await tx.permission.updateMany({
    where: { code: { notIn: codes }, deletedAt: null },
    data: { deletedAt: now },
  });
  const saved = await tx.permission.findMany({ where: { code: { in: codes } } });
  return {
    ids: new Map(saved.map((row) => [row.code, row.id])),
    counts: { added, updated, retired },
    attempted: missing.length > 0,
  };
}

export interface RoleSyncResult {
  readonly roleId: string;
  /** Lo que cambió del rol mismo: { created: true } o su nombre, descripción o público. */
  readonly fields: Prisma.InputJsonObject;
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
}

/** Crea el rol o corrige su nombre, descripción y público; si ya está bien, no escribe nada. */
async function upsertSystemRole(
  tx: TenantTransaction,
  tenantId: string,
  role: SystemRoleDefinition,
): Promise<{ readonly id: string; readonly fields: Prisma.InputJsonObject }> {
  const values = { name: role.name, description: role.description, audience: role.audience };
  const existing = await tx.role.findUnique({
    where: { tenantId_code: { tenantId, code: role.code } },
  });
  if (existing === null) {
    const created = await tx.role.create({
      data: { tenantId, code: role.code, isSystem: true, ...values },
      select: { id: true },
    });
    return { id: created.id, fields: { created: true } };
  }
  const before = {
    name: existing.name,
    description: existing.description,
    audience: existing.audience,
  };
  const fields = changesBetween(before, values);
  if (Object.keys(fields).length > 0) {
    await tx.role.update({ where: { id: existing.id }, data: values });
  }
  return { id: existing.id, fields };
}

/** Deja los permisos de un rol del sistema como dice la matriz. */
interface RoleContext {
  readonly tenantId: string;
  readonly roleId: string;
  readonly role: SystemRoleDefinition;
  readonly now: Date;
}

async function syncRolePermissions(
  tx: TenantTransaction,
  context: RoleContext,
  permissionIds: ReadonlyMap<string, string>,
): Promise<Omit<RoleSyncResult, 'roleId' | 'fields'>> {
  const { tenantId, roleId } = context;
  const current = await tx.rolePermission.findMany({ where: { roleId } });
  const byPermission = new Map(current.map((row) => [row.permissionId, row]));
  const wanted = new Set<string>();
  const created: Prisma.RolePermissionCreateManyInput[] = [];
  let changed = 0;
  for (const grant of systemRoleGrants(context.role.code)) {
    const permissionId = permissionIds.get(grant.code);
    if (permissionId === undefined) continue;
    wanted.add(permissionId);
    const existing = byPermission.get(permissionId);
    const conditions = grant.own ? OWN_CONDITION : Prisma.DbNull;
    if (existing === undefined) {
      created.push({ tenantId, roleId, permissionId, conditions });
    } else if (existing.deletedAt !== null || isOwnCondition(existing.conditions) !== grant.own) {
      await tx.rolePermission.update({
        where: { id: existing.id },
        data: { deletedAt: null, conditions },
      });
      changed += 1;
    }
  }
  await tx.rolePermission.createMany({ data: created });
  const stale = current.filter((row) => row.deletedAt === null && !wanted.has(row.permissionId));
  for (const row of stale) {
    await tx.rolePermission.update({ where: { id: row.id }, data: { deletedAt: context.now } });
  }
  return { added: created.length, changed, removed: stale.length };
}

/** Crea o corrige un rol del sistema de una empresa con los permisos de la matriz. */
export async function syncSystemRole(
  tx: TenantTransaction,
  target: { readonly tenantId: string; readonly role: SystemRoleDefinition },
  permissionIds: ReadonlyMap<string, string>,
  now: Date,
): Promise<RoleSyncResult> {
  const { tenantId, role } = target;
  const { id: roleId, fields } = await upsertSystemRole(tx, tenantId, role);
  const counts = await syncRolePermissions(tx, { tenantId, roleId, role, now }, permissionIds);
  return { roleId, fields, ...counts };
}
