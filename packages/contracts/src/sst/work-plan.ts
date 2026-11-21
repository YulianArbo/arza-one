import { z } from 'zod';

import { sstDateSchema, sstIdSchema, sstRefSchema, sstTextSchema } from './common.js';

// Plan anual de trabajo del SG-SST (B37, decisión 14; PL-SST-001). Una actividad solo se da por
// hecha con su evidencia adjunta. El plan muestra dos porcentajes: el del año (hechas sobre todas)
// y el de cumplimiento a la fecha (hechas sobre las que ya debían estar hechas).

export const workPlanItemSchema = z.object({
  id: sstIdSchema,
  year: z.number().int(),
  activity: z.string(),
  responsible: sstRefSchema,
  due_on: sstDateSchema,
  done_on: sstDateSchema.nullable(),
  evidence_file_id: sstIdSchema.nullable(),
  overdue: z.boolean(),
  version: z.number().int().positive(),
});

export const workPlanComplianceSchema = z.object({
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  due_to_date: z.number().int().nonnegative(),
  done_of_due: z.number().int().nonnegative(),
  year_percent: z.number().int().min(0).max(100),
  to_date_percent: z.number().int().min(0).max(100),
});

export const workPlanResponseSchema = z.object({
  year: z.number().int(),
  compliance: workPlanComplianceSchema,
  data: z.array(workPlanItemSchema),
});

export const workPlanQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

export const saveWorkPlanItemSchema = z.strictObject({
  year: z.number().int().min(2020).max(2100),
  activity: sstTextSchema(3, 300).describe('Actividad del plan'),
  responsible_id: sstIdSchema.describe('Cuenta de quien responde por la actividad'),
  due_on: sstDateSchema,
});

export const completeWorkPlanItemSchema = z.strictObject({
  done_on: sstDateSchema,
  evidence_file_id: sstIdSchema.describe('Evidencia de la actividad (obligatoria)'),
});

/** Porcentaje entero hacia abajo; sin base, vale lo que diga `empty`. */
function percent(part: number, whole: number, empty: number): number {
  return whole === 0 ? empty : Math.floor((part * 100) / whole);
}

/** Cumplimiento del plan a partir de sus actividades y la fecha de hoy (AAAA-MM-DD). */
export function workPlanCompliance(
  items: readonly { readonly due_on: string; readonly done_on: string | null }[],
  today: string,
): WorkPlanCompliance {
  const done = items.filter((item) => item.done_on !== null).length;
  const due = items.filter((item) => item.due_on <= today);
  const doneOfDue = due.filter((item) => item.done_on !== null).length;
  return {
    total: items.length,
    done,
    due_to_date: due.length,
    done_of_due: doneOfDue,
    // Un plan sin actividades no tiene cumplimiento; sin nada vencido, se va al día.
    year_percent: percent(done, items.length, 0),
    to_date_percent: percent(doneOfDue, due.length, 100),
  };
}

export type WorkPlanItem = z.infer<typeof workPlanItemSchema>;
export type WorkPlanCompliance = z.infer<typeof workPlanComplianceSchema>;
export type WorkPlanResponse = z.infer<typeof workPlanResponseSchema>;
export type SaveWorkPlanItem = z.infer<typeof saveWorkPlanItemSchema>;
export type CompleteWorkPlanItem = z.infer<typeof completeWorkPlanItemSchema>;
