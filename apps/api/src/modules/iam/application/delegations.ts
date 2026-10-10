import { Inject, Injectable } from '@nestjs/common';
import {
  isApprovalPermission,
  isPermissionCode,
  type CreateDelegationRequest,
  type Delegation as DelegationView,
  type PermissionCode,
} from '@arza/contracts';

import type { Delegation, User } from '../../../generated/prisma/client.js';
import {
  canOnRecord,
  hasUnconditionalPermission,
  type AppAbility,
} from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  delegationProblem,
  delegationStatus,
  type DelegationDraft,
} from '../domain/access-policy.js';
import { activeGrants } from '../infrastructure/access-store.js';
import { delegationInvalid, delegationNotFound } from './access-messages.js';
import { recordPermissionChange } from './permission-change.js';

type DelegationWithPeople = Delegation & { fromUser: User; toUser: User };

const WITH_PEOPLE = { fromUser: true, toUser: true } as const;

function personOf(user: User): DelegationView['from_user'] {
  return { id: user.id, email: user.email, display_name: user.displayName };
}

function scopeOf(delegation: Delegation): PermissionCode[] {
  const scope = Array.isArray(delegation.scope) ? delegation.scope : [];
  return scope.flatMap((code) =>
    typeof code === 'string' && isPermissionCode(code) ? [code] : [],
  );
}

function viewOf(delegation: DelegationWithPeople, now: Date): DelegationView {
  return {
    id: delegation.id,
    from_user: personOf(delegation.fromUser),
    to_user: personOf(delegation.toUser),
    starts_at: delegation.startsAt.toISOString(),
    ends_at: delegation.endsAt.toISOString(),
    permissions: scopeOf(delegation),
    reason: delegation.reason,
    status: delegationStatus(delegation, now),
    created_at: delegation.createdAt.toISOString(),
  };
}

/** Quien delega es usted, salvo que el administrador registre la de otra persona. */
function draftOf(
  principal: Principal,
  input: CreateDelegationRequest,
  toUserId: string,
): DelegationDraft {
  return {
    actorId: principal.userId,
    fromUserId: input.from_user_id ?? principal.userId,
    toUserId,
    startsAt: new Date(input.starts_at),
    endsAt: new Date(input.ends_at),
  };
}

function isActiveInternal(user: User | null): user is User {
  return user !== null && user.kind === 'internal' && user.status === 'active';
}

/**
 * Delegación temporal de aprobaciones (ficha 17.2, iam.delegation.manage). Cada persona delega
 * sus propias aprobaciones («solo lo propio»); el administrador de plataforma puede registrarlas
 * para cualquiera, pero nunca a su favor. Solo se delegan aprobaciones que quien delega tiene
 * hoy. El motor de flujos (B15) las usa para las tareas de aprobación.
 */
@Injectable()
export class DelegationsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Todas si tiene el permiso completo; si no, las que hizo o recibió. */
  async list(principal: Principal, ability: AppAbility): Promise<DelegationView[]> {
    const now = this.clock.now();
    const everything = hasUnconditionalPermission(ability, 'iam.delegation.manage');
    const mine = [{ fromUserId: principal.userId }, { toUserId: principal.userId }];
    const rows = await this.database.withTenant(principal, (tx) =>
      tx.delegation.findMany({
        where: { deletedAt: null, ...(everything ? {} : { OR: mine }) },
        include: WITH_PEOPLE,
        orderBy: { startsAt: 'desc' },
      }),
    );
    return rows.map((row) => viewOf(row, now));
  }

  async create(
    principal: Principal,
    ability: AppAbility,
    input: CreateDelegationRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const now = this.clock.now();
    const fromUserId = input.from_user_id ?? principal.userId;
    if (!canOnRecord(ability, 'iam.delegation.manage', { from_user_id: fromUserId })) {
      throw permissionDenied();
    }
    return this.database.withTenant(principal, async (tx) => {
      const draft = draftOf(principal, input, await this.delegateId(tx, input));
      const problem = delegationProblem(draft, now);
      if (problem !== null) throw delegationInvalid(problem);
      await this.assertPeople(tx, draft.fromUserId, draft.toUserId);
      await this.assertHeld(tx, draft.fromUserId, input.permissions, now);
      const created = await tx.delegation.create({
        data: {
          tenantId: principal.tenantId,
          fromUserId: draft.fromUserId,
          toUserId: draft.toUserId,
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
          scope: [...input.permissions],
          reason: input.reason,
        },
      });
      const event = { id: created.id, action: 'iam.delegation.create', now, meta };
      await this.record(tx, principal, event, {
        from_user_id: draft.fromUserId,
        to_user_id: draft.toUserId,
        starts_at: draft.startsAt.toISOString(),
        ends_at: draft.endsAt.toISOString(),
        permissions: [...input.permissions],
      });
      return created.id;
    });
  }

  /** Retira una delegación vigente o programada. La de otra persona responde 404. */
  async revoke(
    principal: Principal,
    ability: AppAbility,
    delegationId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const delegation = await tx.delegation.findFirst({
        where: { id: delegationId, deletedAt: null, revokedAt: null, endsAt: { gt: now } },
      });
      const allowed =
        delegation !== null &&
        canOnRecord(ability, 'iam.delegation.manage', { from_user_id: delegation.fromUserId });
      if (!allowed) throw delegationNotFound();
      await tx.delegation.update({
        where: { id: delegation.id },
        data: { revokedAt: now, revokedBy: principal.userId },
      });
      await this.record(
        tx,
        principal,
        { id: delegation.id, action: 'iam.delegation.revoke', now, meta },
        {
          from_user_id: delegation.fromUserId,
          to_user_id: delegation.toUserId,
        },
      );
    });
  }

  /** Quien recibe, por identificador o por correo (quien no ve la lista de usuarios). */
  private async delegateId(tx: TenantTransaction, input: CreateDelegationRequest): Promise<string> {
    if (input.to_user_id !== undefined) return input.to_user_id;
    const user = await tx.user.findFirst({
      where: { email: input.to_email ?? '', deletedAt: null },
      select: { id: true },
    });
    if (user === null) throw delegationInvalid('person');
    return user.id;
  }

  private async assertPeople(tx: TenantTransaction, fromUserId: string, toUserId: string) {
    const [from, to] = await Promise.all([
      tx.user.findFirst({ where: { id: fromUserId, deletedAt: null } }),
      tx.user.findFirst({ where: { id: toUserId, deletedAt: null } }),
    ]);
    if (!isActiveInternal(from) || !isActiveInternal(to)) throw delegationInvalid('person');
  }

  /** Solo aprobaciones, y solo las que quien delega tiene hoy. */
  private async assertHeld(
    tx: TenantTransaction,
    fromUserId: string,
    permissions: readonly PermissionCode[],
    now: Date,
  ): Promise<void> {
    const held = new Set((await activeGrants(tx, fromUserId, now)).map((grant) => grant.code));
    const valid = permissions.every((code) => isApprovalPermission(code) && held.has(code));
    if (!valid) throw delegationInvalid('not_held');
  }

  private async record(
    tx: TenantTransaction,
    principal: Principal,
    event: {
      readonly id: string;
      readonly action: string;
      readonly now: Date;
      readonly meta: RequestMeta;
    },
    changes: Readonly<Record<string, string | readonly string[]>>,
  ): Promise<void> {
    await recordPermissionChange(tx, {
      tenantId: principal.tenantId,
      actorId: principal.userId,
      action: event.action,
      entityType: 'iam_delegation',
      entityId: event.id,
      changes,
      occurredAt: event.now,
      meta: event.meta,
    });
  }
}
