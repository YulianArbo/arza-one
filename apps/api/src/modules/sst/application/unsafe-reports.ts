import { Inject, Injectable } from '@nestjs/common';
import type { AttendUnsafeReport, UnsafeReport } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  auditSst,
  refOf,
  sstConflict,
  sstNotFound,
  userRefs,
  type SstActor,
  type Target,
} from './sst-support.js';

// Actos y condiciones inseguras (B37, ficha 17.14): SST los atiende y deja la respuesta; quien
// reportó ve el estado en «Mi espacio».

@Injectable()
export class UnsafeReports {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Primero lo pendiente; luego lo más reciente. */
  async list(principal: Principal): Promise<UnsafeReport[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.sstUnsafeReport.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 300,
      });
      const refs = await userRefs(
        tx,
        rows.map((row) => row.reportedBy),
      );
      const rank = { reported: 0, in_progress: 1, closed: 2 } as Record<string, number>;
      return rows
        .map((row) => ({
          id: row.id,
          code: row.code,
          kind: row.kind as UnsafeReport['kind'],
          description: row.description,
          location: row.location,
          photo_file_id: row.photoFileId,
          reported_by: refOf(refs, row.reportedBy),
          reported_at: row.createdAt.toISOString(),
          status: row.status as UnsafeReport['status'],
          response: row.response,
          version: row.version,
        }))
        .sort((a, b) => (rank[a.status] ?? 0) - (rank[b.status] ?? 0));
    });
  }

  async attend(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: AttendUnsafeReport,
  ): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.sstUnsafeReport.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw sstNotFound('El reporte no existe.');
      if (row.status === 'closed') throw sstConflict('El reporte ya fue atendido.');
      const updated = await tx.sstUnsafeReport.updateMany({
        where: { id: row.id, version: target.version },
        data: { status: input.status, response: input.response, handledBy: actor.userId },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.unsafe_report.attend',
        entityType: 'sst_unsafe_report',
        entityId: row.id,
        changes: { status: { from: row.status, to: input.status } },
      });
    });
  }
}
