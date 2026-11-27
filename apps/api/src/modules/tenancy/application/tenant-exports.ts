import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import type { TenantExport } from '@arza/contracts';

import {
  companyIdentity,
  exportInProgress,
  findTenantExport,
  listTenantExports,
  queueTenantExport,
  toCalendarDate,
  type TenantExportRow,
} from '../../core/index.js';
import { FileStorage } from '../../doc/index.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { exportInProgressError, exportNotFound, exportNotReady } from './tenancy-messages.js';
import { isUniqueViolation } from './tenant-cards.js';

// Exportación completa de la empresa (B48, decisiones 3 a 5): la pide y la descarga solo la
// Dirección, con su identidad confirmada hace poco. El worker la genera; la descarga queda en la
// auditoría con el número de filas, y eso dispara la alerta de exportación masiva (B44).

function exportView(row: TenantExportRow): TenantExport {
  return {
    id: row.id,
    status: row.status as TenantExport['status'],
    requested_at: row.requestedAt.toISOString(),
    ready_at: row.readyAt?.toISOString() ?? null,
    expires_at: row.expiresAt?.toISOString() ?? null,
    size_bytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    tables: row.tablesCount,
    rows: row.rowsCount === null ? null : Number(row.rowsCount),
    files: row.filesCount,
    manifest_sha256: row.manifestSha256,
  };
}

export interface ExportDownload {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly content: Readable;
}

@Injectable()
export class TenantExportsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  async list(principal: Principal): Promise<TenantExport[]> {
    const rows = await this.database.withTenant(principal, listTenantExports);
    return rows.map(exportView);
  }

  async request(principal: Principal, meta: RequestMeta): Promise<string> {
    const at = this.clock.now();
    return this.database
      .withTenant(principal, async (tx) => {
        if (await exportInProgress(tx)) throw exportInProgressError();
        const id = await queueTenantExport(tx, {
          tenantId: principal.tenantId,
          requestedBy: principal.userId,
          at,
        });
        await recordAuditEvent(tx, {
          tenantId: principal.tenantId,
          occurredAt: at,
          actor: { kind: 'user', id: principal.userId },
          action: 'core.tenant.export_request',
          entityType: 'tenant_export',
          entityId: id,
          result: 'success',
          changes: {},
          meta,
        });
        return id;
      })
      .catch((error: unknown) => {
        // Dos pedidos al mismo tiempo: la base de datos deja uno solo en curso.
        throw isUniqueViolation(error) ? exportInProgressError() : error;
      });
  }

  async download(principal: Principal, id: string, meta: RequestMeta): Promise<ExportDownload> {
    const at = this.clock.now();
    const { row, taxId } = await this.database.withTenant(principal, async (tx) => {
      const found = await findTenantExport(tx, id);
      if (found === null) throw exportNotFound();
      if (found.status !== 'ready' || found.storageKey === null) throw exportNotReady();
      if (found.expiresAt !== null && found.expiresAt <= at) throw exportNotReady();
      await recordAuditEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: at,
        actor: { kind: 'user', id: principal.userId },
        action: 'core.tenant.export_download',
        entityType: 'tenant_export',
        entityId: found.id,
        result: 'success',
        changes: { rows: Number(found.rowsCount ?? 0), files: found.filesCount ?? 0 },
        meta,
      });
      return { row: found, taxId: (await companyIdentity(tx)).taxId };
    });
    const storageKey = row.storageKey ?? '';
    const day = toCalendarDate(row.readyAt ?? at);
    return {
      fileName: `exportacion-${taxId}-${day}.zip`,
      sizeBytes: Number(row.sizeBytes ?? 0),
      content: await this.storage.stream(storageKey),
    };
  }
}
