import { Inject, Injectable } from '@nestjs/common';
import {
  SST_INCIDENT_STATUS,
  UNSAFE_REPORT_STATUS,
  type OwnReport,
  type QuickReport,
  type QuickReportResponse,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  bogotaToday,
  businessDeadline,
  fromCalendarDate,
  nextBusinessCode,
} from '../../core/index.js';
import { employeeIdOfUser } from '../../hr/index.js';
import {
  assertFile,
  auditSst,
  emitSst,
  lockKey,
  sstInvalid,
  sstLeaders,
  type SstActor,
} from './sst-support.js';

// Reporte desde el celular (B37, decisión 10; ficha 17.14: «en menos de un minuto»). Tres datos:
// qué pasa, dónde y una foto opcional. Los actos y condiciones inseguras van a su lista; los
// incidentes y accidentes abren su flujo. Un accidente queda con la fecha límite del reporte a la
// ARL (dos días hábiles) y SST recibe la alerta de inmediato. El reporte no es anónimo, pero solo
// lo ve SST.

const REPORTS = { name: 'Reportes de actos y condiciones inseguras', prefix: 'RPT', padding: 4 };
const INCIDENTS = { name: 'Incidentes y accidentes de trabajo', prefix: 'SST', padding: 4 };
/** Un margen para la diferencia de reloj del celular. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

interface Created {
  readonly id: string;
  readonly code: string;
}

function incidentData(input: QuickReport, occurredAt: Date) {
  return {
    occurredAt,
    location: input.location,
    description: input.description,
    photoFileId: input.photo_file_id,
    affected: input.affected,
  };
}

async function existing(
  tx: TenantTransaction,
  actor: SstActor,
  key: string,
  kind: string,
): Promise<QuickReportResponse | null> {
  const where = { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: key } };
  const report = await tx.sstUnsafeReport.findUnique({ where });
  const incident = report === null ? await tx.sstIncident.findUnique({ where }) : null;
  const found = report ?? incident;
  if (found === null) return null;
  if (found.reportedBy !== actor.userId || found.kind !== kind) throw idempotencyKeyReused();
  return {
    id: found.id,
    code: found.code,
    goes_to: report === null ? 'incident' : 'unsafe_report',
  };
}

@Injectable()
export class QuickReports {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async report(
    principal: Principal,
    meta: RequestMeta,
    key: string,
    input: QuickReport,
  ): Promise<QuickReportResponse> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    const occurredAt = input.occurred_at === null ? actor.at : new Date(input.occurred_at);
    if (occurredAt.getTime() > actor.at.getTime() + CLOCK_SKEW_MS) {
      throw sstInvalid('La fecha del hecho no puede ser futura.');
    }
    return this.database.withTenant(principal, async (tx) => {
      await lockKey(tx, `sst.report:${actor.tenantId}:${key}`);
      const before = await existing(tx, actor, key, input.kind);
      if (before !== null) return before;
      await assertFile(tx, principal, input.photo_file_id);
      const isIncident = input.kind === 'incident' || input.kind === 'accident';
      const created = isIncident
        ? await this.storeIncident(tx, actor, { key, input, occurredAt })
        : await this.storeUnsafe(tx, actor, key, input);
      await emitSst(tx, actor, 'sst.report.received', {
        report_id: created.id,
        kind: input.kind,
        location: input.location,
        recipients: await sstLeaders(tx, actor.at),
      });
      return { ...created, goes_to: isIncident ? 'incident' : 'unsafe_report' };
    });
  }

  private async storeUnsafe(
    tx: TenantTransaction,
    actor: SstActor,
    key: string,
    input: QuickReport,
  ): Promise<Created> {
    const code = await nextBusinessCode(tx, 'sst.report', actor.at, REPORTS);
    const row = await tx.sstUnsafeReport.create({
      data: {
        tenantId: actor.tenantId,
        code,
        kind: input.kind,
        description: input.description,
        location: input.location,
        photoFileId: input.photo_file_id,
        reportedBy: actor.userId,
        requestKey: key,
      },
    });
    await auditSst(tx, actor, {
      action: 'sst.unsafe_report.create',
      entityType: 'sst_unsafe_report',
      entityId: row.id,
      changes: { code, kind: input.kind, with_photo: input.photo_file_id !== null },
    });
    return { id: row.id, code };
  }

  private async storeIncident(
    tx: TenantTransaction,
    actor: SstActor,
    report: { readonly key: string; readonly input: QuickReport; readonly occurredAt: Date },
  ): Promise<Created> {
    const { input, occurredAt } = report;
    const code = await nextBusinessCode(tx, 'sst.incident', actor.at, INCIDENTS);
    const accident = input.kind === 'accident';
    const arlDueOn = accident ? await businessDeadline(tx, bogotaToday(occurredAt), 2) : null;
    const affectedEmployeeId =
      input.affected === 'self' ? await employeeIdOfUser(tx, actor.userId) : null;
    const row = await tx.sstIncident.create({
      data: {
        ...incidentData(input, occurredAt),
        tenantId: actor.tenantId,
        code,
        kind: accident ? 'accident' : 'incident',
        affectedEmployeeId,
        reportedBy: actor.userId,
        arlDueOn: arlDueOn === null ? null : fromCalendarDate(arlDueOn),
        requestKey: report.key,
      },
    });
    await auditSst(tx, actor, {
      action: 'sst.incident.report',
      entityType: 'sst_incident',
      entityId: row.id,
      changes: { code, kind: row.kind, arl_due_on: arlDueOn },
    });
    if (arlDueOn !== null) {
      await emitSst(tx, actor, 'sst.arl.due', {
        incident_id: row.id,
        code,
        due_on: arlDueOn,
        recipients: await sstLeaders(tx, actor.at),
      });
    }
    return { id: row.id, code };
  }

  /** Lo que la persona reportó, con el estado y sin el análisis. */
  async mine(principal: Principal): Promise<OwnReport[]> {
    return this.database.withTenant(principal, async (tx) => ownReports(tx, principal.userId));
  }
}

/** Los reportes de la persona, del más reciente al más antiguo. */
export async function ownReports(tx: TenantTransaction, userId: string): Promise<OwnReport[]> {
  const where = { reportedBy: userId, deletedAt: null };
  const order = [{ createdAt: 'desc' as const }, { id: 'asc' as const }];
  const reports = await tx.sstUnsafeReport.findMany({ where, orderBy: order, take: 50 });
  const incidents = await tx.sstIncident.findMany({ where, orderBy: order, take: 50 });
  const own: OwnReport[] = [
    ...reports.map((row) => ({
      id: row.id,
      code: row.code,
      kind: row.kind as OwnReport['kind'],
      location: row.location,
      reported_at: row.createdAt.toISOString(),
      status: UNSAFE_REPORT_STATUS[row.status as keyof typeof UNSAFE_REPORT_STATUS],
    })),
    ...incidents.map((row) => ({
      id: row.id,
      code: row.code,
      kind: row.kind as OwnReport['kind'],
      location: row.location,
      reported_at: row.createdAt.toISOString(),
      status: SST_INCIDENT_STATUS[row.status as keyof typeof SST_INCIDENT_STATUS],
    })),
  ];
  return own.sort((a, b) => b.reported_at.localeCompare(a.reported_at)).slice(0, 50);
}
