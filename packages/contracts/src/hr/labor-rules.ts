import { z } from 'zod';

// Reglas laborales de Talento humano (B36, ficha 17.13, decisiones 4, 5 y 8): jornada semanal,
// topes de horas extras, días de vacaciones por año y plazo mínimo entre la citación y los
// descargos. Son un parámetro con vigencia (hr.labor_rules), no valores escritos en el código, y
// quedan por validar con Talento humano y el Reglamento Interno de Trabajo (RIT-001).

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .number()
    .int(`${label}: escriba un número entero.`)
    .min(min, `${label}: el mínimo es ${String(min)}.`)
    .max(max, `${label}: el máximo es ${String(max)}.`);

export const laborRulesSchema = z
  .strictObject({
    weekly_hours: wholeNumber('Jornada semanal', 1, 60).describe('Horas de la jornada semanal'),
    overtime_daily_max: wholeNumber('Horas extras por día', 1, 12).describe(
      'Tope de horas extras por día',
    ),
    overtime_weekly_max: wholeNumber('Horas extras por semana', 1, 60).describe(
      'Tope de horas extras por semana',
    ),
    vacation_days_per_year: wholeNumber('Vacaciones por año', 1, 60).describe(
      'Días hábiles de vacaciones por año trabajado',
    ),
    disciplinary_notice_days: wholeNumber('Días entre citación y descargos', 1, 30).describe(
      'Días hábiles mínimos entre la citación y los descargos',
    ),
  })
  .refine((rules) => rules.overtime_daily_max <= rules.overtime_weekly_max, {
    path: ['overtime_daily_max'],
    message: 'El tope diario no puede superar el semanal.',
  });

/** Valores iniciales (decisiones 4, 5 y 8 del B36); se cambian en Organización › Parámetros. */
export const DEFAULT_LABOR_RULES = {
  weekly_hours: 40,
  overtime_daily_max: 2,
  overtime_weekly_max: 12,
  vacation_days_per_year: 15,
  disciplinary_notice_days: 3,
} as const satisfies z.input<typeof laborRulesSchema>;

export type LaborRules = z.infer<typeof laborRulesSchema>;
