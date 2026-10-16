import { Inject, Injectable } from '@nestjs/common';
import type {
  RoleAssignment,
  UserDetailResponse,
  UserListQuery,
  UserListResponse,
  UserSecurity,
  UserPosition,
  UserSummary,
} from '@arza/contracts';

import type { User } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { hasConfirmedFactor } from '../infrastructure/second-factor-store.js';
import {
  findUserWithRoles,
  listUsers,
  openSessionCount,
  peopleById,
  type UserWithRoles,
} from '../infrastructure/user-directory-store.js';
import { userNotFound } from './access-messages.js';
import { POSITION_DIRECTORY, type PositionDirectory } from './position-directory.js';

function kindOf(user: User): 'internal' | 'portal' {
  return user.kind === 'portal' ? 'portal' : 'internal';
}

function statusOf(user: User): UserSummary['status'] {
  const statuses = ['invited', 'active', 'locked', 'inactive'] as const;
  return statuses.find((status) => status === user.status) ?? 'inactive';
}

export function userSummaryOf(user: UserWithRoles): UserSummary {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    kind: kindOf(user),
    status: statusOf(user),
    last_login_at: user.lastLoginAt?.toISOString() ?? null,
    roles: user.roleAssignments.map((assignment) => ({
      code: assignment.role.code,
      name: assignment.role.name,
      valid_until: assignment.validUntil?.toISOString() ?? null,
    })),
  };
}

/**
 * Los datos de seguridad de una cuenta solo se muestran a quien puede administrarlos: serializar
 * por lista blanca según el rol (numeral 15.5, «exposición de datos en respuestas»).
 */
function seesSecurity(ability: AppAbility): boolean {
  return (
    hasUnconditionalPermission(ability, 'iam.user.lock') ||
    hasUnconditionalPermission(ability, 'iam.user.reset_mfa')
  );
}

/** Consulta de usuarios de la empresa (iam.user.read). */
@Injectable()
export class UserDirectoryQuery {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(POSITION_DIRECTORY) private readonly positions: PositionDirectory,
  ) {}

  async list(principal: Principal, query: UserListQuery): Promise<UserListResponse> {
    const now = this.clock.now();
    const page = await this.database.withTenant(principal, (tx) => listUsers(tx, query, now));
    return { data: page.users.map(userSummaryOf), next_cursor: page.nextCursor };
  }

  async detail(
    principal: Principal,
    ability: AppAbility,
    userId: string,
  ): Promise<UserDetailResponse> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const user = await findUserWithRoles(tx, userId, now);
      if (user === null) throw userNotFound();
      return {
        ...userSummaryOf(user),
        created_at: user.createdAt.toISOString(),
        version: user.version,
        position: await this.positionOf(tx, user),
        assignments: await this.assignmentsOf(tx, user),
        security: seesSecurity(ability) ? await this.securityOf(tx, user, now) : null,
      };
    });
  }

  private async assignmentsOf(
    tx: TenantTransaction,
    user: UserWithRoles,
  ): Promise<RoleAssignment[]> {
    const assigners = user.roleAssignments.flatMap((item) =>
      item.assignedBy === null ? [] : [item.assignedBy],
    );
    const people = await peopleById(tx, assigners);
    return user.roleAssignments.map((item) => {
      const by = item.assignedBy === null ? undefined : people.get(item.assignedBy);
      return {
        id: item.id,
        role: { id: item.role.id, code: item.role.code, name: item.role.name },
        valid_from: item.validFrom.toISOString(),
        valid_until: item.validUntil?.toISOString() ?? null,
        assigned_by:
          by === undefined ? null : { id: by.id, email: by.email, display_name: by.displayName },
      };
    });
  }

  private async positionOf(tx: TenantTransaction, user: User): Promise<UserPosition | null> {
    if (user.positionId === null) return null;
    const position = await this.positions.find(tx, user.positionId);
    return position === null
      ? null
      : { id: position.id, name: position.name, is_active: position.isActive };
  }

  private async securityOf(tx: TenantTransaction, user: User, now: Date): Promise<UserSecurity> {
    return {
      second_factor: await hasConfirmedFactor(tx, user.id),
      mfa_required: user.mfaRequired,
      active_sessions: await openSessionCount(tx, user.id, now),
      locked_until:
        user.lockedUntil !== null && user.lockedUntil > now ? user.lockedUntil.toISOString() : null,
    };
  }
}
