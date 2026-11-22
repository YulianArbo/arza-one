import {
  indicatorDirectionSchema,
  indicatorFrequencySchema,
  isAutomaticSource,
  meetsTarget,
  periodEndOf,
  indicatorSourceSchema,
} from '@arza/contracts';

import type { QmsIndicator } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate } from '../../core/index.js';
import { calculateSource } from './indicator-sources.js';

// Guardar la medición automática de un periodo (B39, decisiones 6 y 7). La usan el botón «Calcular
// ahora» y el trabajo diario. Si ya existe, actualiza el valor y conserva el análisis.

export type AutomaticOutcome =
  | { readonly kind: 'no_data' }
  | { readonly kind: 'created' | 'updated'; readonly id: string; readonly value: string };

/** ¿El resultado cumple la meta del indicador? */
export function meetsOf(
  indicator: Pick<QmsIndicator, 'target' | 'direction'>,
  value: string,
): boolean {
  return meetsTarget(
    value,
    indicator.target.toString(),
    indicatorDirectionSchema.parse(indicator.direction),
  );
}

export async function storeAutomatic(
  tx: TenantTransaction,
  indicator: QmsIndicator,
  periodStart: string,
): Promise<AutomaticOutcome> {
  const source = indicatorSourceSchema.parse(indicator.source);
  if (!isAutomaticSource(source)) return { kind: 'no_data' };
  const frequency = indicatorFrequencySchema.parse(indicator.frequency);
  const value = await calculateSource(tx, source, {
    start: periodStart,
    end: periodEndOf(frequency, periodStart),
  });
  if (value === null) return { kind: 'no_data' };
  const data = { value, meets: meetsOf(indicator, value) };
  const existing = await tx.qmsMeasurement.findFirst({
    where: { indicatorId: indicator.id, periodStart: fromCalendarDate(periodStart) },
  });
  if (existing !== null) {
    await tx.qmsMeasurement.update({ where: { id: existing.id }, data });
    return { kind: 'updated', id: existing.id, value };
  }
  const row = await tx.qmsMeasurement.create({
    data: {
      tenantId: indicator.tenantId,
      indicatorId: indicator.id,
      periodStart: fromCalendarDate(periodStart),
      automatic: true,
      ...data,
    },
  });
  return { kind: 'created', id: row.id, value };
}
