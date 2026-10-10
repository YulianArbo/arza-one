import type { AuditEvent as AuditEventView } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { listAuditEvents } from '../infrastructure/audit-store.js';
import { auditEventViews } from './audit-views.js';

// Historial de un conjunto de registros para la línea de tiempo de otros módulos, como la ficha
// del tercero (ficha 17.3). Quien llama decide qué registros puede ver la persona.

export interface EntityHistoryPage {
  readonly events: AuditEventView[];
  readonly nextCursor: string | null;
}

/** Eventos de esos registros, del más reciente al más antiguo, por páginas. */
export async function entityHistory(
  tx: TenantTransaction,
  entityIds: readonly string[],
  page: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<EntityHistoryPage> {
  const where = { entityId: { in: [...entityIds] } };
  const { rows, nextCursor } = await listAuditEvents(tx, where, page);
  return { events: await auditEventViews(tx, rows), nextCursor };
}
