import { HttpStatus } from '@nestjs/common';
import { QMS_ERROR_CODES } from '@arza/contracts';

import type { QmsAudit } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { processesOfPosition } from '../../core/index.js';
import { positionOfUser } from '../../iam/index.js';
import type { QmsViewer } from './nonconformities.js';

// Reglas de las auditorías internas (B39). Un auditor no audita su propio proceso: el proceso donde
// está su cargo (o uno superior) ni el que su cargo dirige (ficha 17.15, decisión 2). Cada auditor
// ejecuta solo las auditorías que le asignaron; Calidad, todas (decisión 1).

export function auditorOwnProcess(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    QMS_ERROR_CODES.auditorOwnProcess,
    'Un auditor no puede auditar su propio proceso. Asigne a una persona de otro proceso.',
  );
}

/** El auditor no pertenece al proceso ni lo dirige. */
export async function assertIndependentAuditor(
  tx: TenantTransaction,
  auditorId: string,
  processId: string,
): Promise<void> {
  const positionId = await positionOfUser(tx, auditorId);
  if (positionId === null) return;
  const processes = await processesOfPosition(tx, positionId);
  if (processes.includes(processId)) throw auditorOwnProcess();
}

/** Calidad puede todo; los demás, solo las auditorías que les asignaron. */
export function canWorkAudit(viewer: QmsViewer, audit: Pick<QmsAudit, 'auditorId'>): boolean {
  return (
    hasUnconditionalPermission(viewer.ability, 'qms.audit.execute') ||
    audit.auditorId === viewer.principal.userId
  );
}

export function assertAuditWorker(viewer: QmsViewer, audit: Pick<QmsAudit, 'auditorId'>): void {
  if (!canWorkAudit(viewer, audit)) throw permissionDenied();
}

/** Quien lee todo Calidad o el auditor de esa auditoría. */
export function assertAuditReader(viewer: QmsViewer, audit: Pick<QmsAudit, 'auditorId'>): void {
  if (hasUnconditionalPermission(viewer.ability, 'qms.read')) return;
  assertAuditWorker(viewer, audit);
}
