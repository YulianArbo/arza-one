import { HttpStatus } from '@nestjs/common';
import { AUDIT_ERROR_CODES, AUDIT_EXPORT_MAX_ROWS } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';

// Consultar, exportar y verificar la auditoría también queda auditado (ficha 17.20).

export interface AuditAccess {
  readonly principal: Principal;
  readonly meta: RequestMeta;
  readonly now: Date;
}

const PAGING = new Set(['limit', 'cursor']);

/** Solo los filtros que se usaron, sin la paginación. */
export function usedFilters(query: object): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(query).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && !PAGING.has(entry[0]),
    ),
  );
}

export async function recordAuditAccess(
  tx: TenantTransaction,
  access: AuditAccess,
  event: {
    readonly action: string;
    readonly entityType: string;
    readonly entityId?: string;
    readonly changes: Prisma.InputJsonObject;
  },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: access.principal.tenantId,
    occurredAt: access.now,
    actor: { kind: 'user', id: access.principal.userId },
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    result: 'success',
    changes: event.changes,
    meta: access.meta,
  });
}

export function exportTooLarge(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    AUDIT_ERROR_CODES.exportTooLarge,
    `La exportación tendría más de ${AUDIT_EXPORT_MAX_ROWS.toLocaleString('es-CO')} eventos. ` +
      'Acote el periodo o agregue filtros.',
  );
}
