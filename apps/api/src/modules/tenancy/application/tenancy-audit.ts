import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';

// Auditoría de multiempresa (B48). Lo que hace el operador queda en la auditoría de la empresa
// operadora, con su nombre; la empresa afectada guarda además su propia nota, hecha por el sistema
// y con el identificador del operador, para que su auditoría cuente su historia completa.

export interface OperatorAction {
  readonly principal: Principal;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export interface TenantNote {
  readonly action: string;
  readonly changes: Prisma.InputJsonObject;
}

export async function auditOperator(
  tx: TenantTransaction,
  action: OperatorAction,
  name: string,
  tenantId: string,
  changes: Prisma.InputJsonObject,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: action.principal.tenantId,
    occurredAt: action.at,
    actor: { kind: 'user', id: action.principal.userId },
    action: name,
    entityType: 'tenant',
    entityId: tenantId,
    result: 'success',
    changes,
    meta: action.meta,
  });
}

export async function auditInTenant(
  tx: TenantTransaction,
  tenantId: string,
  action: OperatorAction,
  note: TenantNote,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: action.at,
    actor: { kind: 'system' },
    action: note.action,
    entityType: 'tenant',
    entityId: tenantId,
    result: 'success',
    changes: { ...note.changes, operator_user_id: action.principal.userId },
    meta: action.meta,
  });
}
