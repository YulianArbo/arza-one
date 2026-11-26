import { Inject, Injectable } from '@nestjs/common';
import {
  INDICATOR_MATRIX_COLUMNS,
  type Indicator,
  type IndicatorSeriesResponse,
  type QmsCodeResponse,
  type SaveIndicator,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCsv } from '../../../platform/export/csv.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, nextPlainCode } from '../../core/index.js';
import { indicatorRefs, indicatorView, matrixRow, seriesView } from './indicator-views.js';
import type { QmsViewer } from './nonconformities.js';
import {
  assertPerson,
  assertProcess,
  auditQms,
  qmsActorOf,
  qmsConflict,
  qmsNotFound,
  type Target,
} from './qms-support.js';

// Fichas de los indicadores y su matriz (B39; RE-SGC-006). Calidad crea y ajusta las fichas; la
// Dirección, Calidad y el Auditor ven la matriz; cada responsable ve los suyos en Mi espacio.

const INDICATORS = { key: 'qms.indicator', name: 'Indicadores', prefix: 'IND', padding: 3 };

function indicatorData(input: SaveIndicator) {
  return {
    processId: input.process_id,
    name: input.name,
    objective: input.objective,
    formula: input.formula,
    unit: input.unit,
    target: input.target,
    direction: input.direction,
    frequency: input.frequency,
    source: input.source,
    responsibleId: input.responsible_id,
    active: input.active,
  };
}

function auditOf(row: { target: { toString(): string }; source: string; active: boolean }) {
  return { target: row.target.toString(), source: row.source, active: row.active };
}

/** Con mediciones tomadas, la frecuencia y la fuente ya no cambian: la serie dejaría de compararse. */
async function assertSameSeries(
  tx: TenantTransaction,
  row: { id: string; frequency: string; source: string },
  input: SaveIndicator,
): Promise<void> {
  if (row.frequency === input.frequency && row.source === input.source) return;
  const taken = await tx.qmsMeasurement.count({ where: { indicatorId: row.id, deletedAt: null } });
  if (taken > 0) {
    throw qmsConflict('El indicador ya tiene mediciones: no cambie su frecuencia ni su fuente.');
  }
}

async function assertRefs(tx: TenantTransaction, input: SaveIndicator): Promise<void> {
  await assertProcess(tx, input.process_id);
  await assertPerson(tx, input.responsible_id);
}

/** Las fichas que cumplen el filtro, cada una con su serie. */
export async function loadIndicators(
  tx: TenantTransaction,
  where: Prisma.QmsIndicatorWhereInput,
  today: string,
): Promise<Indicator[]> {
  const rows = await tx.qmsIndicator.findMany({
    where: { deletedAt: null, ...where },
    orderBy: [{ processId: 'asc' }, { code: 'asc' }],
    include: { measurements: { where: { deletedAt: null }, orderBy: { periodStart: 'asc' } } },
    take: 500,
  });
  const refs = await indicatorRefs(
    tx,
    rows,
    rows.flatMap((row) => row.measurements),
  );
  return rows
    .map((row) => indicatorView(row, row.measurements, refs, today))
    .sort(
      (a, b) => a.process.name.localeCompare(b.process.name, 'es') || a.code.localeCompare(b.code),
    );
}

@Injectable()
export class Indicators {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** La matriz: todas las fichas por proceso, con su último resultado y tendencia. */
  async list(principal: Principal): Promise<Indicator[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, (tx) => loadIndicators(tx, {}, today));
  }

  /** Los indicadores a cargo de la persona (Mi espacio). */
  async mine(principal: Principal): Promise<Indicator[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, (tx) =>
      loadIndicators(tx, { responsibleId: principal.userId, active: true }, today),
    );
  }

  /** La ficha y todas sus mediciones (la gráfica de tendencia). */
  async series(viewer: QmsViewer, id: string): Promise<IndicatorSeriesResponse> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(viewer.principal, async (tx) => {
      const row = await tx.qmsIndicator.findFirst({
        where: { id, deletedAt: null },
        include: { measurements: { where: { deletedAt: null }, orderBy: { periodStart: 'asc' } } },
      });
      if (row === null) throw qmsNotFound('El indicador no existe.');
      const reader = hasUnconditionalPermission(viewer.ability, 'qms.read');
      if (!reader && row.responsibleId !== viewer.principal.userId) throw permissionDenied();
      const refs = await indicatorRefs(tx, [row], row.measurements);
      return {
        indicator: indicatorView(row, row.measurements, refs, today),
        data: seriesView(row, row.measurements, refs.people),
      };
    });
  }

  /** La matriz en CSV para Excel; la descarga queda en la auditoría. */
  async export(
    principal: Principal,
    meta: RequestMeta,
  ): Promise<{ readonly fileName: string; readonly content: string }> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    const indicators = await this.list(principal);
    const content = toCsv(INDICATOR_MATRIX_COLUMNS, indicators.map(matrixRow));
    await this.database.withTenant(principal, async (tx) => {
      await auditQms(tx, actor, {
        action: 'qms.indicator.export',
        entityType: 'qms_indicator',
        entityId: actor.tenantId,
        changes: { rows: indicators.length },
      });
    });
    return { fileName: `matriz-indicadores-${bogotaToday(actor.at)}.csv`, content };
  }

  async create(
    principal: Principal,
    meta: RequestMeta,
    input: SaveIndicator,
  ): Promise<QmsCodeResponse> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertRefs(tx, input);
      const code = await nextPlainCode(tx, INDICATORS);
      const row = await tx.qmsIndicator.create({
        data: { tenantId: actor.tenantId, code, ...indicatorData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.indicator.create',
        entityType: 'qms_indicator',
        entityId: row.id,
        changes: { code, ...auditOf(row) },
      });
      return { id: row.id, code };
    });
  }

  /** Ajusta la ficha; las mediciones ya tomadas no cambian. */
  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveIndicator,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsIndicator.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('El indicador no existe.');
      await assertRefs(tx, input);
      await assertSameSeries(tx, row, input);
      const data = indicatorData(input);
      const updated = await tx.qmsIndicator.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.indicator.update',
        entityType: 'qms_indicator',
        entityId: row.id,
        changes: changesBetween(auditOf(row), auditOf(data)),
      });
    });
  }
}
