import { z } from 'zod';

import { hrRefSchema } from './selection.js';

// Permisos, licencias, vacaciones y horas extras (B36, ficha 17.13). Un colaborador ve su saldo de
// vacaciones y solicita; su jefe inmediato aprueba (o Talento humano o la Dirección, decisión 2).
// Solicitud de ausencia: radicada → aprobada o rechazada → disfrutada; mientras está radicada, quien
// la pidió puede retirarla. Las horas extras exigen autorización previa y respetan los topes
// legales (parámetro «Reglas laborales»); después se reportan las horas trabajadas.

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => textSchema(1, max).nullable().default(null);

function enumOf<T extends Record<string, unknown>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

/** Catálogo editable de los tipos de ausencia (decisión 3 del B36). */
export const LEAVE_TYPES_CATALOG = 'hr_leave_types';

/**
 * Tipos de ausencia con comportamiento propio. Las vacaciones descuentan del saldo y se cuentan
 * en días hábiles; la incapacidad la registra solo Talento humano, sin diagnóstico; el permiso no
 * remunerado llega a nómina como tal. Los demás tipos del catálogo son licencias remuneradas.
 */
export const LEAVE_TYPE = {
  vacation: 'VACACIONES',
  unpaid: 'PERMISO_NO_REMUNERADO',
  sickLeave: 'INCAPACIDAD',
} as const;

/** Tipos que el colaborador no solicita: los registra Talento humano. */
export const HR_ONLY_LEAVE_TYPES: readonly string[] = [LEAVE_TYPE.sickLeave];

export const LEAVE_STATUS = {
  requested: 'Radicada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Retirada',
  taken: 'Disfrutada',
} as const;
export type LeaveStatus = keyof typeof LEAVE_STATUS;
export const leaveStatusSchema = enumOf(LEAVE_STATUS);

const leaveCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/u, 'Seleccione un tipo de ausencia.');

export const leaveRequestSchema = z.object({
  id: idSchema,
  employee: hrRefSchema,
  type: z.string(),
  type_label: z.string(),
  starts_on: dateSchema,
  ends_on: dateSchema,
  /** Días hábiles si son vacaciones; días calendario en los demás tipos. */
  days: z.number().int().positive(),
  status: leaveStatusSchema,
  note: z.string().nullable(),
  approver: hrRefSchema.nullable().describe('Jefe inmediato; vacío si decide Talento humano'),
  decided_by: hrRefSchema.nullable(),
  decided_on: dateSchema.nullable(),
  decision_note: z.string().nullable(),
  /** Soporte (incapacidad, licencia): solo lo ve Talento humano. */
  support_file_id: idSchema.nullable(),
  /** A quien consulta le corresponde aprobar o rechazar. */
  can_decide: z.boolean(),
  version: z.number().int().positive(),
});

export const leaveRequestListResponseSchema = z.object({ data: z.array(leaveRequestSchema) });

const leaveDatesSchema = z.strictObject({
  type: leaveCodeSchema,
  starts_on: dateSchema,
  ends_on: dateSchema,
  note: optionalText(1000),
});

function endsAfterStart(input: { readonly starts_on: string; readonly ends_on: string }): boolean {
  return input.ends_on >= input.starts_on;
}

const datesMessage = {
  path: ['ends_on'],
  message: 'La fecha final no puede ser anterior a la inicial.',
};

/** Solicitud del colaborador desde «Mi espacio». */
export const requestLeaveSchema = leaveDatesSchema.refine(endsAfterStart, datesMessage);

/**
 * Registro de Talento humano a nombre de un colaborador: incapacidades, licencias con soporte y
 * vacaciones anticipadas (decisiones 3 y 4). Queda aprobado al registrarse.
 */
export const registerLeaveSchema = leaveDatesSchema
  .extend({
    employee_id: idSchema,
    support_file_id: idSchema.nullable().default(null).describe('Soporte ya revisado'),
  })
  .refine(endsAfterStart, datesMessage);

export const decideLeaveSchema = z.strictObject({ note: optionalText(1000) });
export const rejectLeaveSchema = z.strictObject({ note: textSchema(3, 1000) });

export const leaveListQuerySchema = z.strictObject({
  status: leaveStatusSchema.optional().describe('Solo las de este estado'),
});

export const vacationBalanceSchema = z.object({
  /** Días hábiles ganados desde el ingreso, con dos decimales. */
  accrued: z.string(),
  /** Días ya disfrutados, aprobados o radicados. */
  used: z.number().int().nonnegative(),
  /** Lo que aún puede solicitar. */
  available: z.string(),
  days_per_year: z.number().int().positive(),
});

export const leaveTypeOptionSchema = z.object({
  code: z.string(),
  label: z.string(),
  /** Solo lo registra Talento humano. */
  hr_only: z.boolean(),
});
export const leaveTypeListResponseSchema = z.object({ data: z.array(leaveTypeOptionSchema) });

// --- Horas extras -------------------------------------------------------------------------

export const OVERTIME_KINDS = {
  day: 'Diurna',
  night: 'Nocturna',
  holiday_day: 'Dominical o festiva diurna',
  holiday_night: 'Dominical o festiva nocturna',
} as const;
export type OvertimeKind = keyof typeof OVERTIME_KINDS;
export const overtimeKindSchema = enumOf(OVERTIME_KINDS);

export const OVERTIME_STATUS = {
  requested: 'Por autorizar',
  authorized: 'Autorizada',
  rejected: 'No autorizada',
  reported: 'Reportada',
  cancelled: 'Retirada',
} as const;
export type OvertimeStatus = keyof typeof OVERTIME_STATUS;
export const overtimeStatusSchema = enumOf(OVERTIME_STATUS);

/** Horas en cuartos de hora: 0.25 a 12. */
export const overtimeHoursSchema = z
  .number()
  .multipleOf(0.25, 'Escriba las horas en cuartos de hora: 1, 1.25, 1.5…')
  .positive('Escriba al menos un cuarto de hora.')
  .max(12, 'Son máximo 12 horas.');

export const overtimeSchema = z.object({
  id: idSchema,
  employee: hrRefSchema,
  work_date: dateSchema,
  kind: overtimeKindSchema,
  hours: z.number(),
  reported_hours: z.number().nullable(),
  reason: z.string(),
  status: overtimeStatusSchema,
  approver: hrRefSchema.nullable(),
  authorized_by: hrRefSchema.nullable(),
  decision_note: z.string().nullable(),
  can_decide: z.boolean(),
  version: z.number().int().positive(),
});
export const overtimeListResponseSchema = z.object({ data: z.array(overtimeSchema) });

export const requestOvertimeSchema = z.strictObject({
  employee_id: idSchema.optional().describe('Solo Talento humano pide a nombre de otro'),
  work_date: dateSchema,
  kind: overtimeKindSchema,
  hours: overtimeHoursSchema,
  reason: textSchema(3, 1000),
});

export const reportOvertimeSchema = z.strictObject({ hours: overtimeHoursSchema });

export const overtimeListQuerySchema = z.strictObject({
  status: overtimeStatusSchema.optional().describe('Solo las de este estado'),
});

export type LeaveRequest = z.infer<typeof leaveRequestSchema>;
export type RequestLeave = z.infer<typeof requestLeaveSchema>;
export type RegisterLeave = z.infer<typeof registerLeaveSchema>;
export type DecideLeave = z.infer<typeof decideLeaveSchema>;
export type RejectLeave = z.infer<typeof rejectLeaveSchema>;
export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;
export type VacationBalance = z.infer<typeof vacationBalanceSchema>;
export type LeaveTypeOption = z.infer<typeof leaveTypeOptionSchema>;
export type Overtime = z.infer<typeof overtimeSchema>;
export type RequestOvertime = z.infer<typeof requestOvertimeSchema>;
export type ReportOvertime = z.infer<typeof reportOvertimeSchema>;
export type OvertimeListQuery = z.infer<typeof overtimeListQuerySchema>;
