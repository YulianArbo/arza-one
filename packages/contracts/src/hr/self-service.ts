import { z } from 'zod';

import { vacationBalanceSchema } from './absences.js';
import { contractTypeSchema, hrRefSchema, workModeSchema } from './selection.js';

// Autoservicio del colaborador (B36, ficha 17.13 y numeral 15.4 «Propiedad»): en «Mi espacio» cada
// persona ve sus datos laborales, su saldo de vacaciones, sus solicitudes, novedades, evaluaciones,
// capacitaciones y las tareas de inducción o retiro a su cargo. Quien es jefe ve además a su equipo
// directo. Del salario solo ve la banda (decisión 11).

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);

export const myEmploymentSchema = z.object({
  employee_id: idSchema,
  name: z.string(),
  position: hrRefSchema,
  hire_date: dateSchema,
  contract_type: contractTypeSchema,
  work_mode: workModeSchema,
  salary_band_label: z.string().nullable(),
  /** Puede descargar su contrato firmado (decisión 11). */
  contract_available: z.boolean(),
  manager: hrRefSchema.nullable().describe('Jefe inmediato según el organigrama'),
  vacation: vacationBalanceSchema,
  /** Tiene personas a cargo: ve «Mi equipo». */
  has_team: z.boolean(),
});

/** «Mi espacio»: null en employment si la cuenta no está vinculada como colaborador. */
export const mySpaceResponseSchema = z.object({ employment: myEmploymentSchema.nullable() });

export const MY_TASK_KINDS = { onboarding: 'Inducción', offboarding: 'Retiro' } as const;
export type MyTaskKind = keyof typeof MY_TASK_KINDS;
export const myTaskKindSchema = z.enum(['onboarding', 'offboarding']);

export const myTaskSchema = z.object({
  /** La tarea de inducción, o el retiro al que pertenece el ítem. */
  id: idSchema,
  kind: myTaskKindSchema,
  /** El ítem de la lista de chequeo del retiro; null en inducción. */
  item: z.string().nullable(),
  title: z.string(),
  employee: hrRefSchema,
  due_on: dateSchema.nullable(),
  version: z.number().int().positive(),
});
export const myTaskListResponseSchema = z.object({ data: z.array(myTaskSchema) });

export const teamMemberSchema = z.object({
  employee_id: idSchema,
  name: z.string(),
  position: hrRefSchema,
  vacation_available: z.string(),
});
export const teamResponseSchema = z.object({ data: z.array(teamMemberSchema) });

export const completeMyTaskSchema = z.strictObject({
  done_on: dateSchema,
  note: textSchema(1, 1000).nullable().default(null),
});

export type MyEmployment = z.infer<typeof myEmploymentSchema>;
export type MySpace = z.infer<typeof mySpaceResponseSchema>;
export type MyTask = z.infer<typeof myTaskSchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type CompleteMyTask = z.infer<typeof completeMyTaskSchema>;
