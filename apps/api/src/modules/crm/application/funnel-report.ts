import { Inject, Injectable } from '@nestjs/common';
import { opportunityStageSchema, type FunnelQuery, type FunnelReport } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addDays, bogotaToday, toCalendarDate } from '../../core/index.js';
import { funnelReport, type FunnelOpportunity } from '../domain/funnel.js';
import { funnelCsv } from '../domain/funnel-csv.js';
import { bogotaDayStart } from '../domain/crm-rules.js';
import { opportunityContext, optionOf } from './crm-views.js';

// Informe del embudo, RE-COM-001 Registro de Oportunidades (B22): las oportunidades creadas en el
// periodo, en pantalla y en CSV. Descargarlo queda en la auditoría.

/** Creadas entre el primer y el último día del periodo, en fechas de Colombia. */
function createdWithin(query: FunnelQuery): Prisma.DateTimeFilter | undefined {
  if (query.from === undefined && query.to === undefined) return undefined;
  return {
    ...(query.from === undefined ? {} : { gte: bogotaDayStart(query.from) }),
    ...(query.to === undefined ? {} : { lt: bogotaDayStart(addDays(query.to, 1)) }),
  };
}

function periodWhere(query: FunnelQuery) {
  const createdAt = createdWithin(query);
  return {
    deletedAt: null,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(query.owner_id === undefined ? {} : { ownerId: query.owner_id }),
  };
}

async function opportunitiesOf(
  tx: TenantTransaction,
  query: FunnelQuery,
): Promise<FunnelOpportunity[]> {
  const rows = await tx.crmOpportunity.findMany({
    where: periodWhere(query),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const context = await opportunityContext(tx, rows);
  return rows.map((row) => ({
    code: row.code,
    createdOn: bogotaToday(row.createdAt),
    client: context.parties.get(row.partyId)?.name ?? 'Tercero',
    title: row.title,
    stage: opportunityStageSchema.parse(row.stage),
    estimatedValue: row.estimatedValue.toString(),
    probability: row.probability,
    expectedClose: toCalendarDate(row.expectedClose),
    owner: row.ownerId === null ? null : (context.people.get(row.ownerId) ?? 'Colaborador'),
    lostReason: row.lostReason === null ? null : optionOf(context.labels, row.lostReason),
    closedOn: row.closedAt === null ? null : bogotaToday(row.closedAt),
  }));
}

async function buildReport(tx: TenantTransaction, query: FunnelQuery, now: Date) {
  const where = periodWhere(query);
  const [opportunities, leads, converted] = await Promise.all([
    opportunitiesOf(tx, query),
    tx.crmLead.count({ where }),
    tx.crmLead.count({ where: { ...where, status: 'converted' } }),
  ]);
  return funnelReport(opportunities, { count: leads, converted }, now);
}

@Injectable()
export class FunnelReportUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async report(principal: Principal, query: FunnelQuery): Promise<FunnelReport> {
    const now = this.clock.now();
    return this.database.withTenant(principal, (tx) => buildReport(tx, query, now));
  }

  /** El RE-COM-001 en CSV para Excel; la descarga queda en la auditoría. */
  async export(
    principal: Principal,
    query: FunnelQuery,
    meta: RequestMeta,
  ): Promise<{ readonly fileName: string; readonly content: string }> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const report = await buildReport(tx, query, now);
      await recordAuditEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: now,
        actor: { kind: 'user', id: principal.userId },
        action: 'crm.report.export',
        entityType: 'crm_report',
        entityId: null,
        result: 'success',
        changes: { report: 'RE-COM-001', rows: report.rows.length, ...query },
        meta,
      });
      return { fileName: `RE-COM-001-${bogotaToday(now)}.csv`, content: funnelCsv(report) };
    });
  }
}
