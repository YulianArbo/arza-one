import { Inject, Injectable } from '@nestjs/common';
import {
  effectiveLimits,
  limitsView,
  TENANT_DELETION_GRACE_DAYS,
  type ChangeTenantPlanRequest,
  type CreatePlatformTenantRequest,
  type PlatformTenant,
  type RequestTenantDeletionRequest,
  type TenantCreatedResponse,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import {
  addDays,
  bogotaToday,
  changeTenantStatus,
  lastExports,
  platformTenants,
  registerTenant,
  setTenantPlan,
  type StatusAction,
  type TenantRecord,
} from '../../core/index.js';
import { storageUsedMb } from '../../doc/index.js';
import {
  accountUsage,
  closeTenantSessions,
  findLoginUser,
  InvitationUseCase,
  systemRoleId,
} from '../../iam/index.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { seedTenantBasics } from '../../../platform/database/seed/tenant-seed.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  assertOperator,
  cardOf,
  isTaxIdTaken,
  isUniqueViolation,
  NO_OVERRIDES,
  type Usage,
} from './tenant-cards.js';
import {
  auditInTenant,
  auditOperator,
  type OperatorAction,
  type TenantNote,
} from './tenancy-audit.js';
import {
  adminEmailTaken,
  platformError,
  taxIdMismatch,
  taxIdTaken,
  tenantNotFound,
} from './tenancy-messages.js';

// Empresas de la plataforma (B48): alta, plan, suspensión y eliminación. Solo el operador de la
// plataforma, desde la empresa que la opera, y siempre sobre la ficha de la empresa, nunca sobre su
// contenido (decisiones 1 y 2). Cada cambio queda en la auditoría de la empresa operadora y en la
// de la empresa afectada.

@Injectable()
export class PlatformTenantsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(InvitationUseCase) private readonly invitations: InvitationUseCase,
  ) {}

  async list(principal: Principal): Promise<PlatformTenant[]> {
    assertOperator(principal);
    const { records, exports } = await this.database
      .withTenant(principal, async (tx) => ({
        records: await platformTenants(tx),
        exports: await lastExports(tx),
      }))
      .catch((error: unknown) => {
        throw platformError(error);
      });
    const cards: PlatformTenant[] = [];
    for (const record of records) {
      const usage = record.status === 'closed' ? null : await this.usageOf(record.id);
      cards.push(cardOf(record, usage, exports.get(record.id) ?? null));
    }
    return cards;
  }

  async create(
    principal: Principal,
    input: CreatePlatformTenantRequest,
    meta: RequestMeta,
  ): Promise<TenantCreatedResponse> {
    assertOperator(principal);
    if ((await findLoginUser(this.database, input.admin.email)) !== null) throw adminEmailTaken();
    const id = uuidv7();
    const limits = effectiveLimits(input.plan, NO_OVERRIDES);
    const action: OperatorAction = { principal, meta, at: this.clock.now() };
    await this.database
      .withTenant(principal, async (tx) => {
        await registerTenant(tx, {
          id,
          legalName: input.legal_name,
          tradeName: input.trade_name,
          taxId: input.tax_id,
          plan: input.plan,
          limits,
        });
        await auditOperator(tx, action, 'platform.tenant.create', id, {
          legal_name: input.legal_name,
          tax_id: input.tax_id,
          plan: input.plan,
        });
      })
      .catch((error: unknown) => {
        throw isUniqueViolation(error) || isTaxIdTaken(error) ? taxIdTaken() : platformError(error);
      });
    await seedTenantBasics(this.database, [id], this.clock);
    await this.note(id, action, { action: 'core.tenant.create', changes: { plan: input.plan } });
    const adminUserId = await this.inviteAdmin(id, input, meta);
    return { id, admin_user_id: adminUserId };
  }

  async changePlan(
    principal: Principal,
    id: string,
    version: number,
    input: ChangeTenantPlanRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const before = await this.record(principal, id);
    const limits = effectiveLimits(input.plan, {
      maxInternalUsers: input.max_internal_users,
      maxPortalUsers: input.max_portal_users,
      storageMb: input.storage_mb,
      aiAssistant: input.ai_assistant,
    });
    const action: OperatorAction = { principal, meta, at: this.clock.now() };
    const changes = {
      plan: { from: before.plan, to: input.plan },
      limits: { from: limitsView(before.limits), to: limitsView(limits) },
    };
    await this.database
      .withTenant(principal, async (tx) => {
        const changed = await setTenantPlan(tx, { id, version, plan: input.plan }, limits);
        if (!changed) throw versionConflict();
        await auditOperator(tx, action, 'platform.tenant.plan_change', id, changes);
      })
      .catch((error: unknown) => {
        throw platformError(error);
      });
    await this.note(id, action, { action: 'core.tenant.plan_change', changes });
  }

  async suspend(
    principal: Principal,
    id: string,
    version: number,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.changeStatus(principal, meta, {
      id,
      version,
      action: 'suspend',
      reason,
      dueOn: null,
      exportId: null,
    });
    await this.database.withTenant({ tenantId: id, userId: null }, async (tx) => {
      const closed = await closeTenantSessions(tx, this.clock.now());
      const action: OperatorAction = { principal, meta, at: this.clock.now() };
      await auditInTenant(tx, id, action, {
        action: 'core.tenant.suspend',
        changes: { reason, sessions_closed: closed },
      });
    });
  }

  async reactivate(
    principal: Principal,
    id: string,
    version: number,
    meta: RequestMeta,
  ): Promise<void> {
    const change = { id, version, action: 'reactivate' as const, reason: null };
    await this.changeStatus(principal, meta, { ...change, dueOn: null, exportId: null });
    const action: OperatorAction = { principal, meta, at: this.clock.now() };
    await this.note(id, action, { action: 'core.tenant.reactivate', changes: {} });
  }

  async requestDeletion(
    principal: Principal,
    id: string,
    version: number,
    input: RequestTenantDeletionRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const record = await this.record(principal, id);
    if (input.confirm_tax_id !== record.taxId) throw taxIdMismatch();
    const exportId = await this.database.withTenant(
      principal,
      async (tx) => (await lastExports(tx)).get(id)?.id ?? null,
    );
    const dueOn = addDays(bogotaToday(this.clock.now()), TENANT_DELETION_GRACE_DAYS);
    await this.changeStatus(principal, meta, {
      id,
      version,
      action: 'request_deletion',
      reason: input.reason,
      dueOn,
      exportId,
    });
    const action: OperatorAction = { principal, meta, at: this.clock.now() };
    await this.note(id, action, {
      action: 'core.tenant.deletion_request',
      changes: { due_on: dueOn, export_id: exportId },
    });
    return dueOn;
  }

  async cancelDeletion(
    principal: Principal,
    id: string,
    version: number,
    meta: RequestMeta,
  ): Promise<void> {
    const change = { id, version, action: 'cancel_deletion' as const, reason: null };
    await this.changeStatus(principal, meta, { ...change, dueOn: null, exportId: null });
    const action: OperatorAction = { principal, meta, at: this.clock.now() };
    await this.note(id, action, { action: 'core.tenant.deletion_cancel', changes: {} });
  }

  private async changeStatus(
    principal: Principal,
    meta: RequestMeta,
    change: {
      readonly id: string;
      readonly version: number;
      readonly action: StatusAction;
      readonly reason: string | null;
      readonly dueOn: string | null;
      readonly exportId: string | null;
    },
  ): Promise<void> {
    assertOperator(principal);
    const action: OperatorAction = { principal, meta, at: this.clock.now() };
    await this.database
      .withTenant(principal, async (tx) => {
        if (!(await changeTenantStatus(tx, change))) throw versionConflict();
        await auditOperator(tx, action, `platform.tenant.${change.action}`, change.id, {
          reason: change.reason,
          due_on: change.dueOn,
          export_id: change.exportId,
        });
      })
      .catch((error: unknown) => {
        throw platformError(error);
      });
  }

  private async record(principal: Principal, id: string): Promise<TenantRecord> {
    assertOperator(principal);
    const records = await this.database
      .withTenant(principal, platformTenants)
      .catch((error: unknown) => {
        throw platformError(error);
      });
    const found = records.find((record) => record.id === id);
    if (found === undefined) throw tenantNotFound();
    return found;
  }

  private async usageOf(tenantId: string): Promise<Usage> {
    return this.database.withTenant({ tenantId, userId: null }, async (tx) => {
      const accounts = await accountUsage(tx);
      return {
        internal_users: accounts.internal,
        portal_users: accounts.portal,
        storage_mb: await storageUsedMb(tx),
      };
    });
  }

  /** Deja el cambio también en la auditoría de la empresa afectada. */
  private async note(tenantId: string, action: OperatorAction, note: TenantNote): Promise<void> {
    await this.database.withTenant({ tenantId, userId: null }, (tx) =>
      auditInTenant(tx, tenantId, action, note),
    );
  }

  /** Primer administrador de la empresa: la invitación le llega por correo (72 horas). */
  private async inviteAdmin(
    tenantId: string,
    input: CreatePlatformTenantRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const roleId = await this.database.withTenant({ tenantId, userId: null }, (tx) =>
      systemRoleId(tx, 'ADMIN_PLATAFORMA'),
    );
    const invited = await this.invitations.invite({
      tenantId,
      email: input.admin.email,
      kind: 'internal',
      displayName: input.admin.display_name,
      actorId: null,
      roleIds: roleId === null ? [] : [roleId],
      meta,
    });
    return invited.userId;
  }
}
