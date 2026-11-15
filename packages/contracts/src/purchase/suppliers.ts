import { z } from 'zod';

import { purchasePersonRefSchema } from './requests.js';

// Selección, evaluación y reevaluación de proveedores (B33, ficha 17.12, RE-ADM-001). Cuatro
// criterios de 1 a 5; el promedio da el resultado. Los criterios y los cortes son provisionales
// hasta validarlos contra el formato del SGC.

const idSchema = z.uuid();

export const SUPPLIER_EVALUATION_KINDS = ['selection', 'reevaluation'] as const;
export const SUPPLIER_EVALUATION_RESULTS = ['approved', 'conditional', 'rejected'] as const;
export type SupplierEvaluationResult = (typeof SUPPLIER_EVALUATION_RESULTS)[number];

export const SUPPLIER_CRITERIA = ['quality', 'compliance', 'price', 'service'] as const;

const gradeSchema = z
  .number()
  .int('Califique con un número entero.')
  .min(1, 'La calificación va de 1 a 5.')
  .max(5, 'La calificación va de 1 a 5.');

export const supplierCriteriaSchema = z.strictObject({
  quality: gradeSchema.describe('Calidad'),
  compliance: gradeSchema.describe('Cumplimiento'),
  price: gradeSchema.describe('Precio'),
  service: gradeSchema.describe('Servicio'),
});
export type SupplierCriteria = z.infer<typeof supplierCriteriaSchema>;

/** Periodo evaluado: el año («2026») o un semestre («2026-1», «2026-2»). */
export const evaluationPeriodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(-[12])?$/u, 'Escriba el año (2026) o el semestre (2026-1 o 2026-2).');

/**
 * Puntaje (promedio con dos decimales) y resultado: 4 o más, aprobado; de 3 a menos de 4,
 * condicionado; menos de 3, no aprobado.
 */
export function supplierScore(criteria: SupplierCriteria): {
  readonly score: string;
  readonly result: SupplierEvaluationResult;
} {
  const sum = SUPPLIER_CRITERIA.reduce((total, key) => total + criteria[key], 0);
  // Con cuatro criterios el promedio termina en ,00 ,25 ,50 o ,75: la cuenta en centésimas es exacta.
  const hundredths = (sum * 100) / SUPPLIER_CRITERIA.length;
  const score = `${String(Math.floor(hundredths / 100))}.${String(hundredths % 100).padStart(2, '0')}`;
  if (hundredths >= 400) return { score, result: 'approved' };
  return { score, result: hundredths >= 300 ? 'conditional' : 'rejected' };
}

export const supplierEvaluationSchema = z.object({
  id: idSchema,
  supplier: z.object({ id: idSchema, name: z.string() }),
  kind: z.enum(SUPPLIER_EVALUATION_KINDS),
  period: z.string(),
  criteria: supplierCriteriaSchema,
  score: z.string(),
  result: z.enum(SUPPLIER_EVALUATION_RESULTS),
  note: z.string().nullable(),
  evaluated_by: purchasePersonRefSchema,
  evaluated_at: z.iso.datetime(),
});

export const supplierEvaluationListResponseSchema = z.object({
  data: z.array(supplierEvaluationSchema),
});

export const createSupplierEvaluationSchema = z.strictObject({
  supplier_id: idSchema,
  kind: z.enum(SUPPLIER_EVALUATION_KINDS),
  period: evaluationPeriodSchema,
  criteria: supplierCriteriaSchema,
  note: z.string().trim().min(3).max(2000).nullable(),
});

export type SupplierEvaluation = z.infer<typeof supplierEvaluationSchema>;
export type CreateSupplierEvaluation = z.infer<typeof createSupplierEvaluationSchema>;
