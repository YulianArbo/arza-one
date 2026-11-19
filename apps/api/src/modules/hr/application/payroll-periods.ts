import { Inject, Injectable } from '@nestjs/common';
import {
  NOVELTY_CONCEPTS_CATALOG,
  noveltiesCsv,
  noveltiesFileName,
  payrollNoveltySchema,
  type NoveltyFileRow,
  type PayrollNovelty,
  type PayrollPeriod,
  type PayrollPeriodDetail,
} from '@arza/contracts';

import type { HrPayrollNovelty } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { bogotaToday, catalogLabels, toCalendarDate } from '../../core/index.js';
import { candidateParties } from '../../party/index.js';
import { periodOf } from '../domain/leave-days.js';
import {
  auditHr,
  employeeRefsById,
  hrConflict,
  lockKey,
  refOf,
  userRefs,
  type HrActor,
} from './hr-support.js';

// Meses de novedades de nómina (B36, ficha 17.13, decisión 6): se consultan, se cierran y, cerrados,
// se descargan para el software de nómina. Un mes cerrado no se reabre y no admite cambios (la base
// de datos también lo impide). El cierre lo hacen Talento humano o la Dirección.

export async function isClosed(tx: TenantTransaction, period: string): Promise<boolean> {
  const row = await tx.hrPayrollPeriod.findFirst({
    where: { period, status: 'closed', deletedAt: null },
    select: { id: true },
  });
  return row !== null;
}

async function noveltiesOf(tx: TenantTransaction, period: string): Promise<HrPayrollNovelty[]> {
  return tx.hrPayrollNovelty.findMany({
    where: { period, deletedAt: null },
    orderBy: [{ employeeId: 'asc' }, { concept: 'asc' }, { startsOn: 'asc' }, { id: 'asc' }],
  });
}

export async function noveltyViews(
  tx: TenantTransaction,
  rows: readonly HrPayrollNovelty[],
): Promise<PayrollNovelty[]> {
  const employees = await employeeRefsById(
    tx,
    rows.map(({ employeeId }) => employeeId),
  );
  const labels = await catalogLabels(tx, NOVELTY_CONCEPTS_CATALOG);
  return rows.map((row) =>
    payrollNoveltySchema.parse({
      id: row.id,
      period: row.period,
      employee: employees.get(row.employeeId) ?? { id: row.employeeId, name: 'Colaborador' },
      concept: row.concept,
      concept_label: labels.get(row.concept) ?? row.concept,
      quantity: row.quantity.toFixed(2),
      unit: row.unit,
      amount: row.amount === null ? null : row.amount.toFixed(2),
      starts_on: row.startsOn === null ? null : toCalendarDate(row.startsOn),
      ends_on: row.endsOn === null ? null : toCalendarDate(row.endsOn),
      source: row.sourceEntity,
      note: row.note,
      version: row.version,
    }),
  );
}

/** Resumen de cada mes: los registrados, los que tienen novedades y el mes en curso. */
async function periodSummaries(tx: TenantTransaction, today: string): Promise<PayrollPeriod[]> {
  const stored = await tx.hrPayrollPeriod.findMany({ where: { deletedAt: null } });
  const counts = await tx.hrPayrollNovelty.groupBy({
    by: ['period'],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const people = await userRefs(
    tx,
    stored.map(({ closedBy }) => closedBy),
  );
  const periods = new Set([
    periodOf(today),
    ...stored.map((p) => p.period),
    ...counts.map((c) => c.period),
  ]);
  return [...periods]
    .sort((a, b) => b.localeCompare(a))
    .map((period) => {
      const row = stored.find((p) => p.period === period);
      const closedAt = row?.closedAt ?? null;
      return {
        period,
        status: row?.status === 'closed' ? 'closed' : 'open',
        novelties: counts.find((c) => c.period === period)?._count._all ?? 0,
        closed_on: closedAt === null ? null : bogotaToday(closedAt),
        closed_by: refOf(people, row?.closedBy ?? null),
      };
    });
}

/** Las filas del archivo, con el documento de identidad de cada colaborador. */
async function fileRows(tx: TenantTransaction, period: string): Promise<NoveltyFileRow[]> {
  const rows = await noveltiesOf(tx, period);
  const views = await noveltyViews(tx, rows);
  const employees = await tx.hrEmployee.findMany({
    where: { id: { in: [...new Set(rows.map(({ employeeId }) => employeeId))] } },
    select: { id: true, partyId: true },
  });
  const parties = await candidateParties(
    tx,
    employees.map(({ partyId }) => partyId),
  );
  const idNumbers = new Map(
    employees.map(({ id, partyId }) => [id, parties.get(partyId)?.idNumber ?? null]),
  );
  return views.map((view) => ({
    period: view.period,
    idNumber: idNumbers.get(view.employee.id) ?? null,
    employee: view.employee.name,
    concept: view.concept,
    conceptLabel: view.concept_label,
    quantity: view.quantity,
    unit: view.unit,
    amount: view.amount,
    startsOn: view.starts_on,
    endsOn: view.ends_on,
    source: view.source,
    note: view.note,
  }));
}

@Injectable()
export class PayrollPeriods {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<PayrollPeriod[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, (tx) => periodSummaries(tx, today));
  }

  async detail(principal: Principal, period: string): Promise<PayrollPeriodDetail> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const summary = (await periodSummaries(tx, today)).find((p) => p.period === period);
      const data = await noveltyViews(tx, await noveltiesOf(tx, period));
      return {
        period: summary ?? {
          period,
          status: 'open',
          novelties: 0,
          closed_on: null,
          closed_by: null,
        },
        data,
      };
    });
  }

  /** Cierra el mes: ya en curso o pasado; después nada cambia. */
  async close(principal: Principal, meta: RequestMeta, period: string): Promise<void> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    if (period > periodOf(bogotaToday(actor.at))) {
      throw hrConflict('Un mes que aún no empieza no se puede cerrar.');
    }
    await this.database.withTenant(principal, async (tx) => {
      await lockKey(tx, `hr.payroll.period:${actor.tenantId}:${period}`);
      if (await isClosed(tx, period)) throw hrConflict('El mes ya está cerrado.');
      const novelties = await tx.hrPayrollNovelty.count({ where: { period, deletedAt: null } });
      await tx.hrPayrollPeriod.upsert({
        where: { tenantId_period: { tenantId: actor.tenantId, period } },
        create: {
          tenantId: actor.tenantId,
          period,
          status: 'closed',
          closedAt: actor.at,
          closedBy: actor.userId,
        },
        update: { status: 'closed', closedAt: actor.at, closedBy: actor.userId },
      });
      await auditHr(tx, actor, {
        action: 'hr.payroll_period.close',
        entityType: 'hr_payroll_period',
        entityId: actor.tenantId,
        changes: { period, novelties },
      });
      await addOutboxEvent(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        occurredAt: actor.at,
        eventType: 'hr.payroll.closed',
        payload: { period, novelties },
      });
    });
  }

  /** El archivo del mes cerrado; la descarga queda en la auditoría. */
  async export(
    principal: Principal,
    meta: RequestMeta,
    period: string,
  ): Promise<{ readonly fileName: string; readonly content: string }> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      if (!(await isClosed(tx, period))) {
        throw hrConflict('Cierre el mes antes de descargar el archivo para nómina.');
      }
      const rows = await fileRows(tx, period);
      await auditHr(tx, actor, {
        action: 'hr.payroll_period.export',
        entityType: 'hr_payroll_period',
        entityId: actor.tenantId,
        changes: { period, rows: rows.length },
      });
      return { fileName: noveltiesFileName(period), content: noveltiesCsv(rows) };
    });
  }
}
