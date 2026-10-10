import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_EXPORT_MAX_ROWS, type AuditExportRequest } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { toCsv } from '../domain/audit-csv.js';
import { auditEventsForExport, auditWhere } from '../infrastructure/audit-store.js';
import { exportTooLarge, recordAuditAccess, usedFilters } from './audit-record.js';
import { auditEventViews } from './audit-views.js';

const HEADER = [
  'posicion',
  'fecha_utc',
  'tipo_actor',
  'actor_id',
  'actor_correo',
  'accion',
  'tipo_registro',
  'registro_id',
  'resultado',
  'cambios',
  'ip',
  'correlacion',
  'hash',
] as const;

export interface AuditCsv {
  readonly fileName: string;
  readonly content: string;
}

/**
 * Exportación de la auditoría (audit.event.export, numeral 13.2). Queda en aud_exports y en la
 * propia auditoría. shortcut: se descarga en el acto con un máximo de AUDIT_EXPORT_MAX_ROWS; pasar
 * a segundo plano con archivo guardado cuando exista el servicio de archivos (B14).
 */
@Injectable()
export class AuditExportUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async export(
    principal: Principal,
    filter: AuditExportRequest,
    meta: RequestMeta,
  ): Promise<AuditCsv> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const events = await auditEventsForExport(tx, auditWhere(filter), AUDIT_EXPORT_MAX_ROWS);
      if (events.length > AUDIT_EXPORT_MAX_ROWS) throw exportTooLarge();
      const scope = usedFilters(filter);
      const record = await tx.auditExport.create({
        data: {
          tenantId: principal.tenantId,
          requestedBy: principal.userId,
          scope,
          rowCount: events.length,
          exportedAt: now,
        },
      });
      await recordAuditAccess(
        tx,
        { principal, meta, now },
        {
          action: 'audit.event.export',
          entityType: 'aud_exports',
          entityId: record.id,
          changes: { scope, row_count: events.length },
        },
      );
      return { fileName: fileNameAt(now), content: await this.csvOf(tx, events) };
    });
  }

  private async csvOf(
    tx: TenantTransaction,
    events: Parameters<typeof auditEventViews>[1],
  ): Promise<string> {
    const views = await auditEventViews(tx, events);
    const rows = views.map((event) => [
      event.seq,
      event.occurred_at,
      event.actor.kind,
      event.actor.id,
      event.actor.email,
      event.action,
      event.entity_type,
      event.entity_id,
      event.result,
      JSON.stringify(event.changes),
      event.ip,
      event.correlation_id,
      event.hash,
    ]);
    return toCsv(HEADER, rows);
  }
}

/** auditoria-2026-10-09T1530Z.csv: la hora va en UTC, como en el archivo. */
function fileNameAt(now: Date): string {
  const stamp = now.toISOString().slice(0, 16).replaceAll(':', '');
  return `auditoria-${stamp}Z.csv`;
}
