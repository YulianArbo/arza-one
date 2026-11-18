import { FILE_ITEMS, ONBOARDING_TASKS, type OnboardingResponsible } from '@arza/contracts';

import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { addDays, fromCalendarDate, superiorPositionId, toCalendarDate } from '../../core/index.js';
import { activeUsersInPosition, activeUsersWithRoles } from '../../iam/index.js';
import type { HiringActor } from './hiring-errors.js';

/** Lo que la vinculación necesita para repartir la inducción. */
export interface OnboardingStart {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly hireDate: Date;
  readonly positionId: string;
  /** Quien vincula: responde por lo de Talento humano y por lo que no tiene otro responsable. */
  readonly actorId: string;
  readonly at: Date;
}

/** Cada tarea creada, para el aviso a su responsable (evento «employee.hired»). */
export interface OnboardingNotice {
  readonly task_id: string;
  readonly kind: string;
  readonly responsible_id: string | null;
  readonly due_on: string;
}

/** Quién responde por cada clase de tarea: el rol, el jefe inmediato o, si no hay, quien vincula. */
async function responsibles(
  tx: TenantTransaction,
  start: OnboardingStart,
): Promise<Record<OnboardingResponsible, string>> {
  const byRole = async (role: string) =>
    (await activeUsersWithRoles(tx, [role], start.at))[0] ?? start.actorId;
  const superior = await superiorPositionId(tx, start.positionId);
  const managers = superior === null ? [] : await activeUsersInPosition(tx, superior);
  return {
    hr: start.actorId,
    sst: await byRole('SST'),
    assets: await byRole('ADMIN_FINANCIERO'),
    manager: managers[0] ?? start.actorId,
  };
}

/** Tareas de inducción que arrancan el día de ingreso, cada una con su responsable. */
export async function createOnboardingTasks(
  tx: TenantTransaction,
  start: OnboardingStart,
): Promise<OnboardingNotice[]> {
  const first = toCalendarDate(start.hireDate);
  const owners = await responsibles(tx, start);
  const rows = await tx.hrOnboardingTask.createManyAndReturn({
    data: Object.entries(ONBOARDING_TASKS).map(([kind, task]) => ({
      tenantId: start.tenantId,
      employeeId: start.employeeId,
      kind,
      task: task.label,
      responsibleId: owners[task.responsible],
      dueOn: fromCalendarDate(addDays(first, task.due_days)),
    })),
  });
  return rows.map((row) => ({
    task_id: row.id,
    kind: row.kind,
    responsible_id: row.responsibleId,
    due_on: toCalendarDate(row.dueOn),
  }));
}

/** Lista de chequeo del expediente con el contrato firmado ya recibido. */
export async function createFileChecklist(
  tx: TenantTransaction,
  tenantId: string,
  employeeId: string,
  signedFileId: string,
): Promise<void> {
  await tx.hrFileChecklistItem.createMany({
    data: Object.keys(FILE_ITEMS).map((item) => ({
      tenantId,
      employeeId,
      item,
      status: item === 'signed_contract' || item === 'data_authorization' ? 'received' : 'pending',
      documentId: item === 'signed_contract' ? signedFileId : null,
    })),
  });
}

/** Auditoría y evento de outbox de la vinculación. */
export async function announceHiring(
  tx: TenantTransaction,
  actor: HiringActor,
  hired: { readonly employeeId: string; readonly accountId: string },
  tasks: readonly OnboardingNotice[],
): Promise<void> {
  const { tenantId, userId, at, meta } = actor;
  const { employeeId, accountId } = hired;
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: at,
    actor: { kind: 'user', id: userId },
    action: 'hr.employee.hire',
    entityType: 'hr_employee',
    entityId: employeeId,
    result: 'success',
    changes: { status: 'active', account_id: accountId },
    meta,
  });
  await addOutboxEvent(tx, {
    tenantId,
    actorId: userId,
    occurredAt: at,
    eventType: 'employee.hired',
    payload: {
      employee_id: employeeId,
      user_id: accountId,
      onboarding: tasks.map((task) => ({ ...task })),
    },
  });
}
