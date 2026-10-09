import { Inject, Injectable } from '@nestjs/common';
import {
  PERMISSION_GROUPS,
  permissionDefinition,
  type CreateRoleRequest,
  type GrantedPermission,
  type PermissionCatalogResponse,
  type RoleDetailResponse,
  type RoleSummary,
  type UpdateRoleRequest,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { roleCodeFromName } from '../domain/access-policy.js';
import {
  findRoleWithCounts,
  holdsRole,
  listRoles,
  replaceRolePermissions,
  roleNameInUse,
  rolePermissions,
  type RoleWithCounts,
} from '../infrastructure/role-store.js';
import {
  permissionScopeInvalid,
  roleNameTaken,
  roleNotFound,
  selfPermissionChange,
  systemRoleReadonly,
  versionConflict,
} from './access-messages.js';
import { recordPermissionChange } from './permission-change.js';

function summaryOf(role: RoleWithCounts): RoleSummary {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    is_system: role.isSystem,
    audience: role.audience === 'portal' ? 'portal' : 'internal',
    permission_count: role.permissionCount,
    assigned_users: role.assignedUsers,
    version: role.version,
  };
}

/**
 * Cada permiso cabe en el rol: los del portal solo en roles del portal y al revés, y «solo lo
 * propio» solo donde el catálogo lo permite.
 */
function assertPermissionsFit(audience: string, permissions: readonly GrantedPermission[]): void {
  for (const { code, scope } of permissions) {
    const definition = permissionDefinition(code);
    const portal = definition.group === 'portal';
    if (portal !== (audience === 'portal')) throw permissionScopeInvalid();
    if (scope === 'own' && definition.ownField === null) throw permissionScopeInvalid();
  }
}

const CATALOG: PermissionCatalogResponse = {
  groups: PERMISSION_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    module: group.module,
    permissions: group.entries.map((entry) => ({
      code: entry[0],
      description: entry[2],
      ownable: entry.length === 4,
    })),
  })),
};

/**
 * Roles (B10): los del sistema se ven pero no se editan; los ajustes se hacen en roles
 * personalizados (ficha 17.2). Nadie edita un rol que tiene, porque sería cambiar sus propios
 * permisos. Cada cambio deja auditoría y alerta de seguridad.
 */
@Injectable()
export class RoleAdminUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  catalog(): PermissionCatalogResponse {
    return CATALOG;
  }

  async list(principal: Principal): Promise<RoleSummary[]> {
    const now = this.clock.now();
    const roles = await this.database.withTenant(principal, (tx) => listRoles(tx, now));
    return roles.map(summaryOf);
  }

  async detail(principal: Principal, roleId: string): Promise<RoleDetailResponse> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => this.detailIn(tx, roleId, now));
  }

  async create(principal: Principal, input: CreateRoleRequest, meta: RequestMeta): Promise<string> {
    assertPermissionsFit(input.audience, input.permissions);
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const code = roleCodeFromName(input.name);
      const taken = await tx.role.findFirst({ where: { code }, select: { id: true } });
      if (taken !== null || (await roleNameInUse(tx, input.name, null))) throw roleNameTaken();
      const role = await tx.role.create({
        data: {
          tenantId: principal.tenantId,
          code,
          name: input.name,
          description: input.description,
          audience: input.audience,
          isSystem: false,
        },
      });
      await replaceRolePermissions(tx, role, input.permissions, now);
      await this.recordChange(
        tx,
        principal,
        { roleId: role.id, action: 'iam.role.create', now, meta },
        {
          code,
          audience: input.audience,
          permissions: input.permissions.map((item) => `${item.code}:${item.scope}`),
        },
      );
      return role.id;
    });
  }

  async update(
    principal: Principal,
    target: { readonly roleId: string; readonly version: number },
    input: UpdateRoleRequest,
    meta: RequestMeta,
  ): Promise<RoleDetailResponse> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const role = await this.editableRole(tx, principal, target, now);
      if (input.permissions !== undefined) assertPermissionsFit(role.audience, input.permissions);
      const name = input.name ?? role.name;
      if (input.name !== undefined && (await roleNameInUse(tx, name, role.id))) {
        throw roleNameTaken();
      }
      const before = await rolePermissions(tx, role.id);
      const description = input.description === undefined ? role.description : input.description;
      const { count } = await tx.role.updateMany({
        where: { id: role.id, version: target.version },
        data: { name, description },
      });
      if (count === 0) throw versionConflict();
      if (input.permissions !== undefined) {
        await replaceRolePermissions(tx, role, input.permissions, now);
      }
      const renamed = input.name === undefined ? {} : { name: { from: role.name, to: name } };
      const event = { roleId: role.id, action: 'iam.role.update', now, meta };
      const diff = permissionDiff(before, await rolePermissions(tx, role.id));
      await this.recordChange(tx, principal, event, { ...renamed, ...diff });
      return this.detailIn(tx, role.id, now);
    });
  }

  /** Un rol que esta persona puede editar ahora: personalizado, ajeno y en la versión vista. */
  private async editableRole(
    tx: TenantTransaction,
    principal: Principal,
    target: { readonly roleId: string; readonly version: number },
    now: Date,
  ): Promise<RoleWithCounts> {
    const role = await findRoleWithCounts(tx, target.roleId, now);
    if (role === null) throw roleNotFound();
    if (role.isSystem) throw systemRoleReadonly();
    if (await holdsRole(tx, principal.userId, role.id, now)) throw selfPermissionChange();
    if (role.version !== target.version) throw versionConflict();
    return role;
  }

  private async detailIn(
    tx: TenantTransaction,
    roleId: string,
    now: Date,
  ): Promise<RoleDetailResponse> {
    const role = await findRoleWithCounts(tx, roleId, now);
    if (role === null) throw roleNotFound();
    return { ...summaryOf(role), permissions: await rolePermissions(tx, role.id) };
  }

  private async recordChange(
    tx: TenantTransaction,
    principal: Principal,
    event: {
      readonly roleId: string;
      readonly action: string;
      readonly now: Date;
      readonly meta: RequestMeta;
    },
    changes: Prisma.InputJsonObject,
  ): Promise<void> {
    await recordPermissionChange(tx, {
      tenantId: principal.tenantId,
      actorId: principal.userId,
      action: event.action,
      entityType: 'iam_role',
      entityId: event.roleId,
      changes,
      occurredAt: event.now,
      meta: event.meta,
    });
  }
}

/** Qué permisos entraron y salieron, como «código:alcance». */
function permissionDiff(
  before: readonly GrantedPermission[],
  after: readonly GrantedPermission[],
): { added?: string[]; removed?: string[] } {
  const key = (item: GrantedPermission) => `${item.code}:${item.scope}`;
  const was = new Set(before.map(key));
  const now = new Set(after.map(key));
  const added = [...now].filter((item) => !was.has(item));
  const removed = [...was].filter((item) => !now.has(item));
  return {
    ...(added.length > 0 ? { added } : {}),
    ...(removed.length > 0 ? { removed } : {}),
  };
}
