import { Inject, Injectable } from '@nestjs/common';
import {
  indicatorFrequencySchema,
  indicatorSourceSchema,
  isAutomaticSource,
  periodStartOf,
  previousPeriodStart,
  type AnalyzeMeasurement,
  type CalculateIndicator,
  type RecordMeasurement,
} from '@arza/contracts';

import type { QmsIndicator } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { meetsOf, storeAutomatic } from './measurement-records.js';
import type { QmsViewer } from './nonconformities.js';
import {
  assertFile,
  auditQms,
  qmsActorOf,
  qmsConflict,
  qmsInvalid,
  qmsNotFound,
  type Target,
} from './qms-support.js';

// Mediciones de los indicadores (B39). Lo que la plataforma no calcula lo registra su responsable
// (o Calidad) con análisis y evidencia (ficha 17.15); las automáticas las calcula la plataforma y
// su responsable les agrega el análisis. Calidad puede pedir el cálculo de un periodo.

function canMeasure(viewer: QmsViewer, indicator: Pick<QmsIndicator, 'responsibleId'>): boolean {
  return (
    hasUnconditionalPermission(viewer.ability, 'qms.indicator.measure') ||
    indicator.responsibleId === viewer.principal.userId
  );
}

async function findIndicator(tx: TenantTransaction, id: string): Promise<QmsIndicator> {
  const indicator = await tx.qmsIndicator.findFirst({ where: { id, deletedAt: null } });
  if (indicator === null) throw qmsNotFound('El indicador no existe.');
  return indicator;
}

/** El periodo empieza donde debe y ya empezó: no se mide el futuro. */
function assertPeriod(indicator: QmsIndicator, periodStart: string, today: string): void {
  const frequency = indicatorFrequencySchema.parse(indicator.frequency);
  if (periodStartOf(frequency, periodStart) !== periodStart) {
    throw qmsInvalid('La fecha no es el primer día de un periodo del indicador.');
  }
  if (periodStart > periodStartOf(frequency, today)) {
    throw qmsInvalid('No se puede medir un periodo que aún no empieza.');
  }
}

/** Un indicador manual y activo, en un periodo válido que aún no tiene su medición. */
async function assertManualMeasurement(
  tx: TenantTransaction,
  indicator: QmsIndicator,
  input: RecordMeasurement,
  today: string,
): Promise<void> {
  if (!indicator.active) throw qmsConflict('El indicador está inactivo.');
  if (isAutomaticSource(indicatorSourceSchema.parse(indicator.source))) {
    throw qmsConflict('Este indicador lo calcula la plataforma; agregue solo el análisis.');
  }
  assertPeriod(indicator, input.period_start, today);
  const taken = await tx.qmsMeasurement.findFirst({
    where: { indicatorId: indicator.id, periodStart: fromCalendarDate(input.period_start) },
  });
  if (taken !== null) throw qmsConflict('Ese periodo ya tiene su medición.');
}

@Injectable()
export class Measurements {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Medición manual con evidencia: la registra el responsable o Calidad. */
  async record(
    viewer: QmsViewer,
    meta: RequestMeta,
    indicatorId: string,
    input: RecordMeasurement,
  ): Promise<string> {
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    return this.database.withTenant(viewer.principal, async (tx) => {
      const indicator = await findIndicator(tx, indicatorId);
      if (!canMeasure(viewer, indicator)) throw permissionDenied();
      await assertManualMeasurement(tx, indicator, input, bogotaToday(actor.at));
      await assertFile(tx, viewer.principal, input.evidence_file_id);
      const row = await tx.qmsMeasurement.create({
        data: {
          tenantId: actor.tenantId,
          indicatorId,
          periodStart: fromCalendarDate(input.period_start),
          value: input.value,
          meets: meetsOf(indicator, input.value),
          analysis: input.analysis,
          evidenceNote: input.evidence_note,
          evidenceFileId: input.evidence_file_id,
          automatic: false,
          measuredBy: actor.userId,
        },
      });
      await auditQms(tx, actor, {
        action: 'qms.indicator.measure',
        entityType: 'qms_measurement',
        entityId: row.id,
        changes: { code: indicator.code, period_start: input.period_start, value: input.value },
      });
      return row.id;
    });
  }

  /** El análisis de una medición (sobre todo de las automáticas). */
  async analyze(
    viewer: QmsViewer,
    meta: RequestMeta,
    target: Target,
    input: AnalyzeMeasurement,
  ): Promise<void> {
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await tx.qmsMeasurement.findFirst({
        where: { id: target.id, deletedAt: null },
        include: { indicator: true },
      });
      if (row === null) throw qmsNotFound('La medición no existe.');
      if (!canMeasure(viewer, row.indicator)) throw permissionDenied();
      const updated = await tx.qmsMeasurement.updateMany({
        where: { id: row.id, version: target.version },
        data: { analysis: input.analysis },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.indicator.analyze',
        entityType: 'qms_measurement',
        entityId: row.id,
        changes: {
          code: row.indicator.code,
          period_start: row.periodStart.toISOString().slice(0, 10),
        },
      });
    });
  }

  /** «Calcular ahora»: el periodo pedido o el último cerrado (decisión 7). */
  async calculate(
    viewer: QmsViewer,
    meta: RequestMeta,
    indicatorId: string,
    input: CalculateIndicator,
  ): Promise<string> {
    const actor = qmsActorOf(viewer.principal, this.clock.now(), meta);
    return this.database.withTenant(viewer.principal, async (tx) => {
      const indicator = await findIndicator(tx, indicatorId);
      if (!isAutomaticSource(indicatorSourceSchema.parse(indicator.source))) {
        throw qmsConflict('Este indicador se registra a mano con su evidencia.');
      }
      const frequency = indicatorFrequencySchema.parse(indicator.frequency);
      const today = bogotaToday(actor.at);
      const period = input.period_start ?? previousPeriodStart(frequency, today);
      assertPeriod(indicator, period, today);
      const outcome = await storeAutomatic(tx, indicator, period);
      if (outcome.kind === 'no_data') {
        throw qmsInvalid('La plataforma aún no tiene datos para calcular ese periodo.');
      }
      await auditQms(tx, actor, {
        action: 'qms.indicator.calculate',
        entityType: 'qms_measurement',
        entityId: outcome.id,
        changes: { code: indicator.code, period_start: period, value: outcome.value },
      });
      return outcome.id;
    });
  }
}
