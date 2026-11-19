import { Inject, Injectable } from '@nestjs/common';
import type { RequestOvertime } from '@arza/contracts';

import type { HrEmployee } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import {
  auditHr,
  employeeOfUser,
  hrInvalid,
  lockKey,
  managerOf,
  requireActiveEmployee,
  requireOwnEmployee,
  type HrActor,
  type HrViewer,
} from './hr-support.js';
import { assertWithinLimits } from './overtime-views.js';

// Solicitud de horas extras (B36, ficha 17.13, decisión 5): se piden antes de trabajarlas, nunca
// para un día que ya pasó, y respetan los topes por día y por semana. Las pide el colaborador desde
// «Mi espacio» o Talento humano a nombre de otro; las autoriza su jefe inmediato.

/** El colaborador de la solicitud: el propio, o el indicado si quien pide es Talento humano. */
async function targetEmployee(
  tx: TenantTransaction,
  viewer: HrViewer,
  employeeId: string | undefined,
): Promise<HrEmployee> {
  const userId = viewer.principal.userId;
  if (employeeId === undefined) return requireOwnEmployee(tx, userId);
  const own = await employeeOfUser(tx, userId);
  if (own?.id === employeeId) return own;
  if (!hasUnconditionalPermission(viewer.ability, 'hr.employee.manage')) throw permissionDenied();
  return requireActiveEmployee(tx, employeeId);
}

async function replayed(
  tx: TenantTransaction,
  tenantId: string,
  requestKey: string,
  input: RequestOvertime,
): Promise<string | null> {
  await lockKey(tx, `hr.overtime:${tenantId}:${requestKey}`);
  const existing = await tx.hrOvertime.findUnique({
    where: { tenantId_requestKey: { tenantId, requestKey } },
  });
  if (existing === null) return null;
  const same =
    toCalendarDate(existing.workDate) === input.work_date &&
    existing.kind === input.kind &&
    Number(existing.hours) === input.hours;
  if (!same) throw idempotencyKeyReused();
  return existing.id;
}

async function announceRequest(
  tx: TenantTransaction,
  actor: HrActor,
  overtimeId: string,
  approverId: string | null,
): Promise<void> {
  const recipients =
    approverId === null
      ? await activeUsersWithRoles(tx, ['TALENTO_HUMANO'], actor.at)
      : [approverId];
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType: 'hr.overtime.requested',
    payload: { overtime_id: overtimeId, decision: 'requested', recipients },
  });
}

@Injectable()
export class OvertimeRequests {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async request(
    viewer: HrViewer,
    meta: RequestMeta,
    requestKey: string,
    input: RequestOvertime,
  ): Promise<string> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    if (input.work_date < bogotaToday(actor.at)) {
      throw hrInvalid('Las horas extras se autorizan antes de trabajarlas: elija hoy o después.');
    }
    return this.database.withTenant(viewer.principal, async (tx) => {
      const previous = await replayed(tx, actor.tenantId, requestKey, input);
      if (previous !== null) return previous;
      const employee = await targetEmployee(tx, viewer, input.employee_id);
      await lockKey(tx, `hr.overtime.employee:${employee.id}`);
      await assertWithinLimits(tx, {
        employeeId: employee.id,
        workDate: input.work_date,
        hours: input.hours,
        exceptId: null,
      });
      return storeOvertime(tx, actor, { employee, input, requestKey });
    });
  }
}

async function storeOvertime(
  tx: TenantTransaction,
  actor: HrActor,
  request: {
    readonly employee: HrEmployee;
    readonly input: RequestOvertime;
    readonly requestKey: string;
  },
): Promise<string> {
  const { employee, input, requestKey } = request;
  const approverId = await managerOf(tx, employee);
  const row = await tx.hrOvertime.create({
    data: {
      tenantId: actor.tenantId,
      employeeId: employee.id,
      workDate: fromCalendarDate(input.work_date),
      kind: input.kind,
      hours: input.hours,
      reason: input.reason,
      approverId,
      requestedBy: actor.userId,
      requestKey,
    },
  });
  await auditHr(tx, actor, {
    action: 'hr.overtime.request',
    entityType: 'hr_overtime',
    entityId: row.id,
    changes: { kind: input.kind, hours: input.hours, status: 'requested' },
  });
  await announceRequest(tx, actor, row.id, approverId);
  return row.id;
}
