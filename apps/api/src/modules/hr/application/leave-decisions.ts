import { Inject, Injectable } from '@nestjs/common';
import type { LeaveRequest, LeaveStatus } from '@arza/contracts';

import type { HrLeaveRequest } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  auditHr,
  employeeOfUser,
  hrConflict,
  hrNotFound,
  type HrActor,
  type HrViewer,
} from './hr-support.js';
import { addLeaveNovelties, announceLeave } from './leave-effects.js';
import { canDecideLeave, leaveViews } from './leave-views.js';

// Decisión y consulta de las ausencias (B36, decisión 2): aprueba o rechaza el jefe inmediato
// designado al radicar, o quien tiene el permiso de aprobar sobre todos (Talento humano y la
// Dirección); nadie decide lo suyo. Al aprobar, la novedad llega al mes de nómina. Mientras está
// radicada, el colaborador la puede retirar.

interface LeaveTarget {
  readonly id: string;
  readonly version: number;
}

type Decision =
  | { readonly approve: true; readonly note: string | null }
  | {
      readonly approve: false;
      readonly note: string;
    };

async function requireLeave(tx: TenantTransaction, id: string): Promise<HrLeaveRequest> {
  const leave = await tx.hrLeaveRequest.findFirst({ where: { id, deletedAt: null } });
  if (leave === null) throw hrNotFound('La solicitud de ausencia no existe.');
  return leave;
}

function assertRequested(leave: HrLeaveRequest, target: LeaveTarget): void {
  if (leave.version !== target.version) throw versionConflict();
  if (leave.status !== 'requested') throw hrConflict('La solicitud ya no está radicada.');
}

async function storeDecision(
  tx: TenantTransaction,
  actor: HrActor,
  leave: HrLeaveRequest,
  decision: Decision,
): Promise<HrLeaveRequest> {
  const status: LeaveStatus = decision.approve ? 'approved' : 'rejected';
  const updated = await tx.hrLeaveRequest.updateMany({
    where: { id: leave.id, version: leave.version, status: 'requested' },
    data: { status, decidedBy: actor.userId, decidedAt: actor.at, decisionNote: decision.note },
  });
  if (updated.count !== 1) throw versionConflict();
  await auditHr(tx, actor, {
    action: decision.approve ? 'hr.leave.approve' : 'hr.leave.reject',
    entityType: 'hr_leave_request',
    entityId: leave.id,
    changes: { status: { from: 'requested', to: status }, type: leave.type, days: leave.days },
  });
  return { ...leave, status };
}

@Injectable()
export class LeaveDecisions {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async decide(
    viewer: HrViewer,
    meta: RequestMeta,
    target: LeaveTarget,
    decision: Decision,
  ): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    await this.database.withTenant(viewer.principal, async (tx) => {
      const leave = await requireLeave(tx, target.id);
      if (!canDecideLeave(viewer, leave)) throw permissionDenied();
      assertRequested(leave, target);
      const decided = await storeDecision(tx, actor, leave, decision);
      if (decision.approve) await addLeaveNovelties(tx, actor.tenantId, decided);
      const employee = await tx.hrEmployee.findFirst({
        where: { id: leave.employeeId },
        select: { userId: true },
      });
      await announceLeave(tx, actor, {
        leaveId: leave.id,
        employeeUserId: employee?.userId ?? null,
        kind: decision.approve ? 'approved' : 'rejected',
      });
    });
  }

  /** El colaborador retira su solicitud mientras sigue radicada. */
  async cancel(viewer: HrViewer, meta: RequestMeta, target: LeaveTarget): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    await this.database.withTenant(viewer.principal, async (tx) => {
      const leave = await requireLeave(tx, target.id);
      const own = await employeeOfUser(tx, actor.userId);
      if (own?.id !== leave.employeeId) throw hrNotFound('La solicitud de ausencia no existe.');
      assertRequested(leave, target);
      const updated = await tx.hrLeaveRequest.updateMany({
        where: { id: leave.id, version: leave.version, status: 'requested' },
        data: { status: 'cancelled' },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditHr(tx, actor, {
        action: 'hr.leave.cancel',
        entityType: 'hr_leave_request',
        entityId: leave.id,
        changes: { status: { from: 'requested', to: 'cancelled' } },
      });
    });
  }

  /** Las ausencias propias. */
  async mine(viewer: HrViewer): Promise<LeaveRequest[]> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      const own = await employeeOfUser(tx, viewer.principal.userId);
      if (own === null) return [];
      const rows = await tx.hrLeaveRequest.findMany({
        where: { employeeId: own.id, deletedAt: null },
        orderBy: [{ startsOn: 'desc' }, { id: 'asc' }],
      });
      return leaveViews(tx, viewer, rows);
    });
  }

  /** Las que le toca decidir como jefe inmediato designado. */
  async team(viewer: HrViewer): Promise<LeaveRequest[]> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      const rows = await tx.hrLeaveRequest.findMany({
        where: { approverId: viewer.principal.userId, deletedAt: null },
        orderBy: [{ startsOn: 'desc' }, { id: 'asc' }],
      });
      return leaveViews(tx, viewer, rows);
    });
  }

  /** Todas las de la empresa, para Talento humano y la Dirección. */
  async all(viewer: HrViewer, status: LeaveStatus | undefined): Promise<LeaveRequest[]> {
    if (!hasUnconditionalPermission(viewer.ability, 'hr.leave.approve')) throw permissionDenied();
    return this.database.withTenant(viewer.principal, async (tx) => {
      const rows = await tx.hrLeaveRequest.findMany({
        where: { deletedAt: null, ...(status === undefined ? {} : { status }) },
        orderBy: [{ startsOn: 'desc' }, { id: 'asc' }],
        take: 500,
      });
      return leaveViews(tx, viewer, rows);
    });
  }
}
