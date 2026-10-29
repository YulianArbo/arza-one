import type { Prisma } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate } from '../domain/calendar-date.js';
import { colombianHolidays } from '../domain/colombian-holidays.js';
import { auditCore, type CoreActor } from './core-audit.js';
import {
  CATALOGS,
  DISCOUNT_CAP,
  HOLIDAY_YEARS,
  POSITIONS,
  PROCESSES,
  WORK_SCHEDULE,
  WORK_SCHEDULE_VALID_FROM,
  type SeedCatalog,
} from './core-seed-data.js';

// Semilla del núcleo (capítulo 12.1): crea lo que falta y nunca deshace lo que la empresa cambió,
// así que se puede repetir. Transacciones cortas (nota de B10), cada una con su evento de
// auditoría si creó algo.

/** Lo que el paso creó, para la auditoría, o null si no hacía falta nada. */
type SeedStep = (tx: TenantTransaction, tenantId: string) => Promise<Prisma.InputJsonObject | null>;

/** Un año que ya tiene festivos, aun retirados, no se toca: la empresa pudo ajustarlo. */
function holidaysOf(year: number): SeedStep {
  return async (tx, tenantId) => {
    const from = fromCalendarDate(`${String(year)}-01-01`);
    const to = fromCalendarDate(`${String(year)}-12-31`);
    if ((await tx.holiday.count({ where: { holidayDate: { gte: from, lte: to } } })) > 0)
      return null;
    const holidays = colombianHolidays(year);
    await tx.holiday.createMany({
      data: holidays.map((h) => ({
        tenantId,
        holidayDate: fromCalendarDate(h.date),
        name: h.name,
      })),
    });
    return { year, holidays: holidays.length };
  };
}

/** Primera vigencia de un parámetro, solo si nunca tuvo una. */
function parameterOf(key: string, value: Prisma.InputJsonObject, validFrom: string): SeedStep {
  return async (tx, tenantId) => {
    if ((await tx.parameter.count({ where: { key } })) > 0) return null;
    await tx.parameter.create({
      data: { tenantId, key, value, validFrom: fromCalendarDate(validFrom) },
    });
    return { key, valid_from: validFrom };
  };
}

/** Crea el catálogo con sus opciones; si ya existe, agrega solo las opciones que le faltan. */
function catalogOf(seed: SeedCatalog): SeedStep {
  return async (tx, tenantId) => {
    const existing = await tx.catalog.findFirst({ where: { key: seed.key } });
    const catalog =
      existing ??
      (await tx.catalog.create({
        data: { tenantId, key: seed.key, name: seed.name, description: seed.description },
      }));
    const known = new Set(
      (await tx.catalogItem.findMany({ where: { catalogId: catalog.id } })).map((i) => i.code),
    );
    const missing = seed.items
      .map(([code, label], index) => ({ code, label, sortOrder: (index + 1) * 10 }))
      .filter((item) => !known.has(item.code));
    if (missing.length === 0) return null;
    await tx.catalogItem.createMany({
      data: missing.map((item) => ({ tenantId, catalogId: catalog.id, ...item })),
    });
    return { catalog: seed.key, items: missing.length };
  };
}

const processes: SeedStep = async (tx, tenantId) => {
  const existing = await tx.orgUnit.findMany({ select: { code: true } });
  const known = new Set(existing.map((unit) => unit.code));
  const missing = PROCESSES.filter(([code]) => !known.has(code));
  if (missing.length === 0) return null;
  await tx.orgUnit.createMany({
    data: missing.map(([code, name]) => ({ tenantId, code, name, kind: 'process' })),
  });
  return { processes: missing.map(([code]) => code) };
};

/** Cargos del organigrama provisional, solo si la empresa aún no tiene ninguno. */
const positions: SeedStep = async (tx, tenantId) => {
  if ((await tx.position.count()) > 0) return null;
  const units = await tx.orgUnit.findMany({ where: { deletedAt: null } });
  const unitId = new Map(units.map((unit) => [unit.code, unit.id]));
  const positionId = new Map<string, string>();
  for (const seed of POSITIONS) {
    const orgUnitId = unitId.get(seed.process);
    if (orgUnitId === undefined) return null;
    const reportsToId = seed.reportsTo === null ? null : (positionId.get(seed.reportsTo) ?? null);
    const created = await tx.position.create({
      data: { tenantId, orgUnitId, name: seed.name, reportsToId },
    });
    positionId.set(seed.name, created.id);
    await tx.orgUnit.updateMany({
      where: { code: { in: [...seed.leads] }, ownerPositionId: null },
      data: { ownerPositionId: created.id },
    });
  }
  return { positions: POSITIONS.length };
};

const STEPS: readonly (readonly [action: string, step: SeedStep])[] = [
  ...HOLIDAY_YEARS.map((year) => ['core.holiday.seed', holidaysOf(year)] as const),
  ['core.parameter.seed', parameterOf('work.schedule', WORK_SCHEDULE, WORK_SCHEDULE_VALID_FROM)],
  ['core.parameter.seed', parameterOf('crm.discount_cap', DISCOUNT_CAP, WORK_SCHEDULE_VALID_FROM)],
  ...CATALOGS.map((catalog) => ['core.catalog.seed', catalogOf(catalog)] as const),
  ['core.org_unit.seed', processes],
  ['core.position.seed', positions],
];

/** Festivos, horario laboral, catálogos y organigrama provisional de cada empresa. */
export async function seedCore(
  database: DatabaseService,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const actor: CoreActor = { context: { tenantId, userId: null }, meta: null, at: clock.now() };
    for (const [action, step] of STEPS) {
      await database.withTenant(actor.context, async (tx) => {
        const created = await step(tx, tenantId);
        if (created === null) return;
        await auditCore(tx, actor, {
          action,
          entityType: 'core_seed',
          entityId: null,
          changes: created,
        });
      });
    }
  }
}
