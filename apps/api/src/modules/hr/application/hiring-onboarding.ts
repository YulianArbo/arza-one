import { FILE_ITEMS, ONBOARDING_TASKS } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, fromCalendarDate, toCalendarDate } from '../../core/index.js';

/** Tareas de inducción que arrancan el día de ingreso. */
export async function createOnboardingTasks(
  tx: TenantTransaction,
  tenantId: string,
  employeeId: string,
  hireDate: Date,
): Promise<void> {
  const start = toCalendarDate(hireDate);
  await tx.hrOnboardingTask.createMany({
    data: Object.entries(ONBOARDING_TASKS).map(([kind, task]) => ({
      tenantId,
      employeeId,
      kind,
      task: task.label,
      dueOn: fromCalendarDate(addDays(start, task.due_days)),
    })),
  });
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
