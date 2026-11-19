import { Inject, Injectable } from '@nestjs/common';
import {
  OFFBOARDING_ITEMS,
  type CompleteMyTask,
  type CompleteOffboardingItem,
  type MyTask,
  type OffboardingItem,
} from '@arza/contracts';

import type { HrOffboarding } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import {
  auditHr,
  employeeRefsById,
  hrConflict,
  hrInvalid,
  hrNotFound,
  type HrActor,
  type HrViewer,
} from './hr-support.js';
import { requireOffboarding } from './offboardings.js';
import { checklistOf, heldAssets } from './offboarding-views.js';

// Tareas a cargo de cada persona (B36, decisión 12): las de inducción de un colaborador nuevo y los
// ítems del retiro de otro. Las marca hechas el responsable desde «Mi espacio»; Talento humano
// también puede. La devolución de activos solo se da por hecha cuando ya no queda ninguno.

interface ItemTarget {
  readonly id: string;
  readonly version: number;
  readonly item: OffboardingItem;
}

function assertPast(doneOn: string, at: Date): void {
  if (doneOn > bogotaToday(at)) throw hrInvalid('La fecha de realización no puede ser futura.');
}

async function onboardingTasks(tx: TenantTransaction, userId: string): Promise<MyTask[]> {
  const rows = await tx.hrOnboardingTask.findMany({
    where: { responsibleId: userId, doneOn: null, deletedAt: null, employee: { deletedAt: null } },
    orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
  });
  const names = await employeeRefsById(
    tx,
    rows.map(({ employeeId }) => employeeId),
  );
  return rows.map((row) => ({
    id: row.id,
    kind: 'onboarding',
    item: null,
    title: row.task,
    employee: names.get(row.employeeId) ?? { id: row.employeeId, name: 'Colaborador' },
    due_on: toCalendarDate(row.dueOn),
    version: row.version,
  }));
}

async function offboardingTasks(tx: TenantTransaction, userId: string): Promise<MyTask[]> {
  const rows = await tx.hrOffboarding.findMany({
    where: { status: 'in_progress', deletedAt: null },
    orderBy: [{ lastDay: 'asc' }, { id: 'asc' }],
  });
  const names = await employeeRefsById(
    tx,
    rows.map(({ employeeId }) => employeeId),
  );
  return rows.flatMap((row) =>
    checklistOf(row)
      .filter((entry) => entry.responsible_id === userId && entry.done_on === null)
      .map((entry) => ({
        id: row.id,
        kind: 'offboarding' as const,
        item: entry.item,
        title: OFFBOARDING_ITEMS[entry.item].label,
        employee: names.get(row.employeeId) ?? { id: row.employeeId, name: 'Colaborador' },
        due_on: toCalendarDate(row.lastDay),
        version: row.version,
      })),
  );
}

async function assertItemDoable(
  tx: TenantTransaction,
  viewer: HrViewer,
  row: HrOffboarding,
  item: OffboardingItem,
): Promise<void> {
  const entry = checklistOf(row).find((candidate) => candidate.item === item);
  if (entry === undefined) throw hrNotFound('El ítem del retiro no existe.');
  const isHr = hasUnconditionalPermission(viewer.ability, 'hr.offboarding.manage');
  if (!isHr && entry.responsible_id !== viewer.principal.userId) {
    throw hrNotFound('El ítem del retiro no existe.');
  }
  if (entry.done_on !== null) throw hrConflict('El ítem ya está hecho.');
  if (item !== 'assets_return') return;
  const employee = await tx.hrEmployee.findFirst({ where: { id: row.employeeId } });
  if ((await heldAssets(tx, employee?.userId ?? null)).length > 0) {
    throw hrConflict('Aún hay activos por devolver: regístrelos como devueltos en Activos.');
  }
}

@Injectable()
export class MyTasks {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(viewer: HrViewer): Promise<MyTask[]> {
    return this.database.withTenant(viewer.principal, async (tx) => [
      ...(await onboardingTasks(tx, viewer.principal.userId)),
      ...(await offboardingTasks(tx, viewer.principal.userId)),
    ]);
  }

  /** El responsable marca hecha su tarea de inducción. */
  async completeOnboarding(
    viewer: HrViewer,
    meta: RequestMeta,
    target: { readonly id: string; readonly version: number },
    input: CompleteMyTask,
  ): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    assertPast(input.done_on, actor.at);
    await this.database.withTenant(viewer.principal, async (tx) => {
      const task = await tx.hrOnboardingTask.findFirst({
        where: { id: target.id, responsibleId: actor.userId, deletedAt: null },
      });
      if (task === null) throw hrNotFound('La tarea de inducción no existe.');
      if (task.doneOn !== null) throw hrConflict('La tarea ya se completó.');
      const updated = await tx.hrOnboardingTask.updateMany({
        where: { id: task.id, version: target.version, doneOn: null },
        data: { doneOn: fromCalendarDate(input.done_on), doneBy: actor.userId, note: input.note },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditHr(tx, actor, {
        action: 'hr.onboarding.complete',
        entityType: 'hr_employee',
        entityId: task.employeeId,
        changes: { task_id: task.id, kind: task.kind, done_on: input.done_on, by: 'responsible' },
      });
    });
  }

  /** El responsable (o Talento humano) marca hecho un ítem del retiro. */
  async completeOffboarding(
    viewer: HrViewer,
    meta: RequestMeta,
    target: ItemTarget,
    input: CompleteOffboardingItem,
  ): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    assertPast(input.done_on, actor.at);
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await requireOffboarding(tx, target);
      await assertItemDoable(tx, viewer, row, target.item);
      if (
        input.file_id !== null &&
        !(await isAttachableFile(tx, viewer.principal, input.file_id))
      ) {
        throw hrInvalid('El soporte adjunto no está disponible.');
      }
      await storeItem(tx, actor, row, { item: target.item, input });
    });
  }
}

async function storeItem(
  tx: TenantTransaction,
  actor: HrActor,
  row: HrOffboarding,
  done: { readonly item: OffboardingItem; readonly input: CompleteOffboardingItem },
): Promise<void> {
  const checklist = checklistOf(row).map((entry) =>
    entry.item === done.item
      ? { ...entry, done_on: done.input.done_on, done_by: actor.userId, note: done.input.note }
      : entry,
  );
  const interview = done.item === 'exit_interview' ? done.input.file_id : null;
  const updated = await tx.hrOffboarding.updateMany({
    where: { id: row.id, version: row.version, status: 'in_progress' },
    data: { checklist, ...(interview === null ? {} : { exitInterviewRecordId: interview }) },
  });
  if (updated.count !== 1) throw versionConflict();
  await auditHr(tx, actor, {
    action: 'hr.offboarding.item',
    entityType: 'hr_offboarding',
    entityId: row.id,
    changes: {
      item: done.item,
      done_on: done.input.done_on,
      with_support: done.input.file_id !== null,
    },
  });
}
