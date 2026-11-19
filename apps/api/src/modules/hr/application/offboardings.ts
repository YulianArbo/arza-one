import { Inject, Injectable } from '@nestjs/common';
import {
  OFFBOARDING_ITEMS,
  type Offboarding,
  type OffboardingResponsible,
  type StartOffboarding,
} from '@arza/contracts';

import type { HrEmployee, HrOffboarding } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import {
  auditHr,
  hrConflict,
  hrInvalid,
  hrNotFound,
  lockKey,
  requireActiveEmployee,
  type HrActor,
} from './hr-support.js';
import { applyTermination } from './offboarding-termination.js';
import { heldAssets, offboardingView, readyToClear } from './offboarding-views.js';

// Retiro y paz y salvo (B36, ficha 17.13, decisiones 9 y 10). Talento humano registra el motivo y el
// último día; la lista de chequeo se reparte por áreas y cada responsable recibe su aviso. Si el
// último día ya pasó, la cuenta se desactiva en el acto; si no, lo hace el trabajo diario. Con la
// lista completa, sin activos por devolver y la cuenta desactivada, se emite el paz y salvo.

interface OffboardingTarget {
  readonly id: string;
  readonly version: number;
}

async function responsibles(
  tx: TenantTransaction,
  actor: HrActor,
): Promise<Record<OffboardingResponsible, string>> {
  const byRole = async (role: string) =>
    (await activeUsersWithRoles(tx, [role], actor.at))[0] ?? actor.userId;
  return { hr: actor.userId, assets: await byRole('ADMIN_FINANCIERO'), sst: await byRole('SST') };
}

async function assertStartable(tx: TenantTransaction, employee: HrEmployee, lastDay: string) {
  if (lastDay < toCalendarDate(employee.hireDate)) {
    throw hrInvalid('El último día no puede ser anterior a la fecha de ingreso.');
  }
  const open = await tx.hrOffboarding.count({
    where: { employeeId: employee.id, status: { not: 'cancelled' }, deletedAt: null },
  });
  if (open > 0) throw hrConflict('El colaborador ya tiene un retiro registrado.');
}

/** La lista de chequeo con el responsable de cada ítem (decisión 10). */
async function newChecklist(tx: TenantTransaction, actor: HrActor) {
  const owners = await responsibles(tx, actor);
  return Object.entries(OFFBOARDING_ITEMS).map(([item, spec]) => ({
    item,
    responsible_id: owners[spec.responsible],
    done_on: null,
    done_by: null,
    note: null,
  }));
}

async function announceStart(
  tx: TenantTransaction,
  actor: HrActor,
  row: HrOffboarding,
  checklist: Awaited<ReturnType<typeof newChecklist>>,
): Promise<void> {
  await auditHr(tx, actor, {
    action: 'hr.offboarding.start',
    entityType: 'hr_offboarding',
    entityId: row.id,
    changes: { reason: row.reason, last_day: toCalendarDate(row.lastDay), status: 'in_progress' },
  });
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType: 'hr.offboarding.started',
    payload: {
      offboarding_id: row.id,
      last_day: toCalendarDate(row.lastDay),
      tasks: checklist.map(({ item, responsible_id }) => ({ item, responsible_id })),
    },
  });
}

async function storeStarted(
  tx: TenantTransaction,
  actor: HrActor,
  employee: HrEmployee,
  input: StartOffboarding & { readonly key: string },
): Promise<HrOffboarding> {
  const checklist = await newChecklist(tx, actor);
  const row = await tx.hrOffboarding.create({
    data: {
      tenantId: actor.tenantId,
      employeeId: employee.id,
      reason: input.reason,
      lastDay: fromCalendarDate(input.last_day),
      note: input.note,
      checklist,
      requestKey: input.key,
    },
  });
  await announceStart(tx, actor, row, checklist);
  return row;
}

@Injectable()
export class Offboardings {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async start(
    principal: Principal,
    meta: RequestMeta,
    key: string,
    input: StartOffboarding,
  ): Promise<string> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      await lockKey(tx, `hr.offboarding:${actor.tenantId}:${key}`);
      const existing = await tx.hrOffboarding.findUnique({
        where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: key } },
      });
      if (existing !== null) {
        if (existing.employeeId !== input.employee_id) throw idempotencyKeyReused();
        return existing.id;
      }
      const employee = await requireActiveEmployee(tx, input.employee_id);
      await lockKey(tx, `hr.offboarding.employee:${employee.id}`);
      await assertStartable(tx, employee, input.last_day);
      const row = await storeStarted(tx, actor, employee, { ...input, key });
      if (input.last_day < bogotaToday(actor.at)) {
        await applyTermination(tx, actor, row, employee);
      }
      return row.id;
    });
  }

  /** Anula un retiro mientras la cuenta sigue activa. */
  async cancel(
    principal: Principal,
    meta: RequestMeta,
    target: OffboardingTarget,
    reason: string,
  ): Promise<void> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await requireOffboarding(tx, target);
      if (row.accountDeactivatedAt !== null) {
        throw hrConflict('La cuenta ya se desactivó: el retiro no se puede anular.');
      }
      await storeStatus(tx, actor, row, { status: 'cancelled', cancelReason: reason });
    });
  }

  /** Emite el paz y salvo con todo completo. */
  async clear(principal: Principal, meta: RequestMeta, target: OffboardingTarget): Promise<void> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await requireOffboarding(tx, target);
      const employee = await tx.hrEmployee.findFirst({ where: { id: row.employeeId } });
      const assets = await heldAssets(tx, employee?.userId ?? null);
      if (!readyToClear(row, assets)) {
        throw hrConflict(
          'Falta completar la lista de chequeo, devolver los activos o que termine el último día.',
        );
      }
      await storeStatus(tx, actor, row, {
        status: 'cleared',
        clearedOn: fromCalendarDate(bogotaToday(actor.at)),
        clearedBy: actor.userId,
      });
    });
  }

  async list(principal: Principal): Promise<Offboarding[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.hrOffboarding.findMany({
        where: { deletedAt: null },
        orderBy: [{ lastDay: 'desc' }, { id: 'asc' }],
        take: 200,
      });
      const users = await tx.hrEmployee.findMany({
        where: { id: { in: rows.map(({ employeeId }) => employeeId) } },
        select: { id: true, userId: true },
      });
      const userOf = new Map(users.map(({ id, userId }) => [id, userId]));
      const views: Offboarding[] = [];
      for (const row of rows)
        views.push(await offboardingView(tx, row, userOf.get(row.employeeId) ?? null));
      return views;
    });
  }
}

export async function requireOffboarding(
  tx: TenantTransaction,
  target: OffboardingTarget,
): Promise<HrOffboarding> {
  const row = await tx.hrOffboarding.findFirst({ where: { id: target.id, deletedAt: null } });
  if (row === null) throw hrNotFound('El retiro no existe.');
  if (row.version !== target.version) throw versionConflict();
  if (row.status !== 'in_progress') throw hrConflict('El retiro ya se cerró o se anuló.');
  return row;
}

async function storeStatus(
  tx: TenantTransaction,
  actor: HrActor,
  row: HrOffboarding,
  data: { readonly status: 'cancelled' | 'cleared' } & Record<string, unknown>,
): Promise<void> {
  const updated = await tx.hrOffboarding.updateMany({
    where: { id: row.id, version: row.version, status: 'in_progress' },
    data,
  });
  if (updated.count !== 1) throw versionConflict();
  await auditHr(tx, actor, {
    action: data.status === 'cleared' ? 'hr.offboarding.clear' : 'hr.offboarding.cancel',
    entityType: 'hr_offboarding',
    entityId: row.id,
    changes: { status: { from: 'in_progress', to: data.status } },
  });
}
