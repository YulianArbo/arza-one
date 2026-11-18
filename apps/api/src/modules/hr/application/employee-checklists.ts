import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  HR_ERROR_CODES,
  type CompleteOnboardingTask,
  type FileItem,
  type UpdateFileEntry,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';

interface ChecklistActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
}

interface FileEntryTarget {
  readonly employeeId: string;
  readonly item: FileItem;
  readonly version: number;
}

interface FileEntryRow {
  readonly version: number;
  readonly status: string;
  readonly documentId: string | null;
}

interface TaskTarget {
  readonly employeeId: string;
  readonly taskId: string;
  readonly version: number;
}

interface TaskRow {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly doneOn: Date | null;
}

function fileScope(tenantId: string, target: FileEntryTarget) {
  return {
    tenantId,
    employeeId: target.employeeId,
    item: target.item,
    deletedAt: null,
    employee: { deletedAt: null },
  };
}

function taskScope(tenantId: string, target: TaskTarget) {
  return {
    tenantId,
    id: target.taskId,
    employeeId: target.employeeId,
    deletedAt: null,
    employee: { deletedAt: null },
  };
}

async function requireFileItem(
  tx: TenantTransaction,
  scope: ReturnType<typeof fileScope>,
): Promise<FileEntryRow> {
  const item = await tx.hrFileChecklistItem.findFirst({ where: scope });
  if (item === null) {
    throw new AppError(
      HttpStatus.NOT_FOUND,
      HR_ERROR_CODES.recordNotFound,
      'El ítem del expediente no existe.',
    );
  }
  return item;
}

/** Los soportes de la vinculación no se editan a mano. */
function assertEditableItem(item: FileItem): void {
  if (item === 'signed_contract' || item === 'data_authorization') {
    throw new AppError(
      HttpStatus.CONFLICT,
      HR_ERROR_CODES.statusInvalid,
      'Este ítem se actualiza con los documentos de la vinculación.',
    );
  }
}

/** El soporte adjunto debe estar disponible y ser distinto del actual. */
async function assertSupportAvailable(
  tx: TenantTransaction,
  principal: Principal,
  input: UpdateFileEntry,
  item: FileEntryRow,
): Promise<void> {
  const fileId = input.file_id;
  if (fileId === null || fileId === item.documentId) return;
  if (await isAttachableFile(tx, principal, fileId)) return;
  throw new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HR_ERROR_CODES.recordInvalid,
    'El soporte adjunto no está disponible.',
  );
}

async function storeFileEntry(
  tx: TenantTransaction,
  actor: ChecklistActor,
  scope: ReturnType<typeof fileScope>,
  target: FileEntryTarget,
  item: FileEntryRow,
  input: UpdateFileEntry,
): Promise<void> {
  const updated = await tx.hrFileChecklistItem.updateMany({
    where: { ...scope, version: target.version },
    data: { status: input.status, documentId: input.file_id, note: input.note },
  });
  if (updated.count !== 1) throw versionConflict();
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: 'hr.file.update',
    entityType: 'hr_employee',
    entityId: target.employeeId,
    result: 'success',
    changes: {
      item: target.item,
      status: { from: item.status, to: input.status },
      support_changed: item.documentId !== input.file_id,
    },
    meta: actor.meta,
  });
}

async function requireTask(
  tx: TenantTransaction,
  scope: ReturnType<typeof taskScope>,
): Promise<TaskRow> {
  const task = await tx.hrOnboardingTask.findFirst({ where: scope });
  if (task === null) {
    throw new AppError(
      HttpStatus.NOT_FOUND,
      HR_ERROR_CODES.recordNotFound,
      'La tarea de inducción no existe.',
    );
  }
  return task;
}

function assertPendingTask(task: TaskRow): void {
  if (task.doneOn === null) return;
  throw new AppError(HttpStatus.CONFLICT, HR_ERROR_CODES.statusInvalid, 'La tarea ya se completó.');
}

function assertRealizedDate(doneOn: string, at: Date): void {
  if (doneOn <= bogotaToday(at)) return;
  throw new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    HR_ERROR_CODES.recordInvalid,
    'La fecha de realización no puede ser futura.',
  );
}

async function storeTaskCompletion(
  tx: TenantTransaction,
  actor: ChecklistActor,
  scope: ReturnType<typeof taskScope>,
  target: TaskTarget,
  task: TaskRow,
  input: CompleteOnboardingTask,
): Promise<void> {
  const updated = await tx.hrOnboardingTask.updateMany({
    where: { ...scope, version: target.version, doneOn: null },
    data: { doneOn: fromCalendarDate(input.done_on), doneBy: actor.userId, note: input.note },
  });
  if (updated.count !== 1) throw versionConflict();
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: 'hr.onboarding.complete',
    entityType: 'hr_employee',
    entityId: target.employeeId,
    result: 'success',
    changes: { task_id: task.id, kind: task.kind, done_on: input.done_on },
    meta: actor.meta,
  });
}

@Injectable()
export class EmployeeChecklists {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async updateFile(
    principal: Principal,
    meta: RequestMeta,
    target: FileEntryTarget,
    input: UpdateFileEntry,
  ): Promise<void> {
    const actor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const scope = fileScope(actor.tenantId, target);
      const item = await requireFileItem(tx, scope);
      if (item.version !== target.version) throw versionConflict();
      assertEditableItem(target.item);
      await assertSupportAvailable(tx, principal, input, item);
      await storeFileEntry(tx, actor, scope, target, item, input);
    });
  }

  async completeTask(
    principal: Principal,
    meta: RequestMeta,
    target: TaskTarget,
    input: CompleteOnboardingTask,
  ): Promise<void> {
    const actor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const scope = taskScope(actor.tenantId, target);
      const task = await requireTask(tx, scope);
      if (task.version !== target.version) throw versionConflict();
      assertPendingTask(task);
      assertRealizedDate(input.done_on, actor.at);
      await storeTaskCompletion(tx, actor, scope, target, task, input);
    });
  }
}
