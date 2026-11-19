import { Inject, Injectable } from '@nestjs/common';
import type { CreateHolidayRequest, Holiday as HolidayView } from '@arza/contracts';

import type { Holiday } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addBusinessDays, type WorkCalendar } from '../domain/business-days.js';
import {
  addBusinessHours,
  businessMinutesBetween,
  minutesOfDay,
  type WorkHoursCalendar,
} from '../domain/business-hours.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../domain/calendar-date.js';
import { auditCore } from './core-audit.js';
import { holidayTaken, recordNotFound } from './core-messages.js';
import { WORK_SCHEDULE } from './core-seed-data.js';
import { workScheduleOn } from './parameters.js';

/** Horario del numeral 17.1 si la empresa aún no tiene el parámetro: de lunes a viernes. */
const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

function holidayView(holiday: Holiday): HolidayView {
  return { id: holiday.id, date: toCalendarDate(holiday.holidayDate), name: holiday.name };
}

function yearRange(fromYear: number, toYear: number) {
  return {
    gte: fromCalendarDate(`${String(fromYear)}-01-01`),
    lte: fromCalendarDate(`${String(toYear)}-12-31`),
  };
}

/**
 * Fecha en que se cumple un plazo de `days` días hábiles desde `from`, con el horario laboral
 * vigente ese día y los festivos de la empresa (numeral 13.2). Lo usan los módulos con plazos.
 */
export async function businessDeadline(
  tx: TenantTransaction,
  from: string,
  days: number,
): Promise<string> {
  const schedule = await workScheduleOn(tx, from);
  return addBusinessDays(from, days, {
    workdays: new Set(schedule?.days ?? DEFAULT_WORKDAYS),
    holidays: await holidaysFrom(tx, from),
  });
}

/**
 * Días laborales y festivos para contar días hábiles entre `from` y `to` (B36): las vacaciones se
 * cuentan en días hábiles con el horario vigente al empezar y los festivos de la empresa.
 */
export async function workCalendarBetween(
  tx: TenantTransaction,
  from: string,
  to: string,
): Promise<WorkCalendar> {
  const schedule = await workScheduleOn(tx, from);
  const holidays = await tx.holiday.findMany({
    where: {
      deletedAt: null,
      holidayDate: { gte: fromCalendarDate(from), lte: fromCalendarDate(to) },
    },
    select: { holidayDate: true },
  });
  return {
    workdays: new Set(schedule?.days ?? DEFAULT_WORKDAYS),
    holidays: new Set(holidays.map((holiday) => toCalendarDate(holiday.holidayDate))),
  };
}

/** Festivos desde el año de `from`: 365 días hábiles caben en menos de dos años de calendario. */
async function holidaysFrom(tx: TenantTransaction, from: string): Promise<Set<string>> {
  const year = Number(from.slice(0, 4));
  const holidays = await tx.holiday.findMany({
    where: { deletedAt: null, holidayDate: yearRange(year, year + 2) },
    select: { holidayDate: true },
  });
  return new Set(holidays.map((holiday) => toCalendarDate(holiday.holidayDate)));
}

/**
 * Instante en que se cumple un plazo de `hours` horas hábiles desde `from`, con las jornadas del
 * horario laboral vigente ese día y los festivos de la empresa (ficha 17.5). Lo usa el motor de
 * flujos para los vencimientos de las tareas.
 */
export async function businessHoursDeadline(
  tx: TenantTransaction,
  from: Date,
  hours: number,
): Promise<Date> {
  return addBusinessHours(from, hours, await workHoursFrom(tx, from));
}

/** El horario laboral vigente en `from` y los festivos desde ese año. */
async function workHoursFrom(tx: TenantTransaction, from: Date): Promise<WorkHoursCalendar> {
  const today = bogotaToday(from);
  const schedule = (await workScheduleOn(tx, today)) ?? WORK_SCHEDULE;
  return {
    workdays: new Set(schedule.days),
    holidays: await holidaysFrom(tx, today),
    shifts: [schedule.morning, schedule.afternoon].map((shift) => ({
      start: minutesOfDay(shift.start),
      end: minutesOfDay(shift.end),
    })),
  };
}

/**
 * Minutos hábiles entre dos instantes, con el horario vigente en `from` y los festivos de la
 * empresa. Lo usa la mesa de ayuda para saber cuánto plazo consumió un tiquete antes de pausarse.
 */
export async function businessMinutesElapsed(
  tx: TenantTransaction,
  from: Date,
  to: Date,
): Promise<number> {
  return businessMinutesBetween(from, to, await workHoursFrom(tx, from));
}

const MINUTE_MS = 60 * 1000;

/**
 * Primer instante dentro de la jornada desde `at`: el mismo `at` si cae en una jornada de un día
 * hábil, o el inicio de la siguiente. Un aviso generado el sábado se entrega el lunes a las 8:00
 * (ficha 17.5, PT-GTH-001). Un minuto hábil desde `at`, menos ese minuto, cae exactamente ahí.
 */
export async function nextBusinessMoment(tx: TenantTransaction, at: Date): Promise<Date> {
  const oneMinuteLater = await businessHoursDeadline(tx, at, 1 / 60);
  return new Date(oneMinuteLater.getTime() - MINUTE_MS);
}

/** Festivos de la empresa y cálculo de días hábiles (ficha 17.1). */
@Injectable()
export class CalendarUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async holidays(principal: Principal, year: number): Promise<HolidayView[]> {
    const holidays = await this.database.withTenant(principal, (tx) =>
      tx.holiday.findMany({
        where: { deletedAt: null, holidayDate: yearRange(year, year) },
        orderBy: { holidayDate: 'asc' },
      }),
    );
    return holidays.map(holidayView);
  }

  /** Agrega un festivo; si esa fecha se había retirado, la recupera con el nombre nuevo. */
  async addHoliday(
    principal: Principal,
    input: CreateHolidayRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const holidayDate = fromCalendarDate(input.date);
      const existing = await tx.holiday.findFirst({ where: { holidayDate } });
      if (existing !== null && existing.deletedAt === null) throw holidayTaken();
      const holiday =
        existing === null
          ? await tx.holiday.create({
              data: { tenantId: principal.tenantId, holidayDate, name: input.name },
            })
          : await tx.holiday.update({
              where: { id: existing.id },
              data: { name: input.name, deletedAt: null },
            });
      await auditCore(
        tx,
        { context: principal, meta, at },
        {
          action: 'core.holiday.create',
          entityType: 'holiday',
          entityId: holiday.id,
          changes: { date: input.date, name: input.name },
        },
      );
      return holiday.id;
    });
  }

  async removeHoliday(principal: Principal, id: string, meta: RequestMeta): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const holiday = await tx.holiday.findFirst({ where: { id, deletedAt: null } });
      if (holiday === null) throw recordNotFound('El festivo');
      await tx.holiday.update({ where: { id }, data: { deletedAt: at } });
      await auditCore(
        tx,
        { context: principal, meta, at },
        {
          action: 'core.holiday.delete',
          entityType: 'holiday',
          entityId: id,
          changes: { date: toCalendarDate(holiday.holidayDate), name: holiday.name },
        },
      );
    });
  }

  async businessDays(principal: Principal, from: string, days: number): Promise<string> {
    return this.database.withTenant(principal, (tx) => businessDeadline(tx, from, days));
  }
}
