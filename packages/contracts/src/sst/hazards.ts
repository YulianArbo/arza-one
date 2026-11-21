import { z } from 'zod';

import {
  sstDateSchema,
  sstEnumOf,
  sstIdSchema,
  sstOptionalText,
  sstRefSchema,
  sstTextSchema,
} from './common.js';

// Matriz de peligros y valoración de riesgos con la metodología GTC 45 (B37, decisión 3; RE-SST-001).
// Quien la diligencia indica el nivel de deficiencia, el de exposición y el de consecuencia; la
// plataforma calcula la probabilidad, el nivel de riesgo (I a IV) y su aceptabilidad. Valores de la
// guía por validar con el profesional de SST con licencia.

export const HAZARD_CLASSES = {
  biological: 'Biológico',
  physical: 'Físico',
  chemical: 'Químico',
  psychosocial: 'Psicosocial',
  biomechanical: 'Biomecánico',
  safety: 'Condiciones de seguridad',
  natural: 'Fenómenos naturales',
} as const;
export type HazardClass = keyof typeof HAZARD_CLASSES;
export const hazardClassSchema = sstEnumOf(HAZARD_CLASSES);

/** Nivel de deficiencia (ND). «Bajo» no asigna valor en la guía: cuenta como 0. */
export const DEFICIENCY_LEVELS = { 10: 'Muy alto', 6: 'Alto', 2: 'Medio', 0: 'Bajo' } as const;
/** Nivel de exposición (NE). */
export const EXPOSURE_LEVELS = {
  4: 'Continua',
  3: 'Frecuente',
  2: 'Ocasional',
  1: 'Esporádica',
} as const;
/** Nivel de consecuencia (NC). */
export const CONSEQUENCE_LEVELS = {
  100: 'Mortal o catastrófico',
  60: 'Muy grave',
  25: 'Grave',
  10: 'Leve',
} as const;

function levelSchema(levels: Record<number, string>, message: string) {
  const allowed = Object.keys(levels).map(Number);
  return z
    .number()
    .int()
    .refine((value) => allowed.includes(value), { message });
}

export const HAZARD_RISK_LEVELS = { I: 'I', II: 'II', III: 'III', IV: 'IV' } as const;
export type HazardRiskLevel = keyof typeof HAZARD_RISK_LEVELS;
export const hazardRiskLevelSchema = sstEnumOf(HAZARD_RISK_LEVELS);

export const HAZARD_RISK_ACCEPTABILITY: Readonly<Record<HazardRiskLevel, string>> = {
  I: 'No aceptable',
  II: 'No aceptable o aceptable con control específico',
  III: 'Mejorable',
  IV: 'Aceptable',
};

/** Interpretación del nivel de probabilidad (NP = ND × NE). */
export function probabilityLabel(probability: number): string {
  if (probability >= 24) return 'Muy alto';
  if (probability >= 10) return 'Alto';
  if (probability >= 6) return 'Medio';
  return 'Bajo';
}

export interface RiskValuation {
  readonly probability: number;
  readonly risk: number;
  readonly level: HazardRiskLevel;
}

/** NP = ND × NE; NR = NP × NC; nivel I (600 a 4000), II (150 a 500), III (40 a 120), IV (hasta 20). */
export function valueRisk(
  deficiency: number,
  exposure: number,
  consequence: number,
): RiskValuation {
  const probability = deficiency * exposure;
  const risk = probability * consequence;
  const level: HazardRiskLevel = risk >= 600 ? 'I' : risk >= 150 ? 'II' : risk >= 40 ? 'III' : 'IV';
  return { probability, risk, level };
}

export const hazardSchema = z.object({
  id: sstIdSchema,
  process: sstRefSchema,
  activity: z.string(),
  routine: z.boolean(),
  hazard_class: hazardClassSchema,
  hazard: z.string(),
  effects: z.string(),
  existing_controls: z.string().nullable(),
  deficiency: z.number().int(),
  exposure: z.number().int(),
  consequence: z.number().int(),
  probability: z.number().int(),
  risk: z.number().int(),
  risk_level: hazardRiskLevelSchema,
  proposed_controls: z.string().nullable(),
  review_on: sstDateSchema,
  version: z.number().int().positive(),
});
export const hazardListResponseSchema = z.object({ data: z.array(hazardSchema) });

export const saveHazardSchema = z.strictObject({
  process_id: sstIdSchema,
  activity: sstTextSchema(3, 200).describe('Actividad o tarea'),
  routine: z.boolean().default(true),
  hazard_class: hazardClassSchema,
  hazard: sstTextSchema(3, 300).describe('Descripción del peligro'),
  effects: sstTextSchema(3, 300).describe('Efectos posibles'),
  existing_controls: sstOptionalText(1000),
  deficiency: levelSchema(DEFICIENCY_LEVELS, 'El nivel de deficiencia es 10, 6, 2 o 0.'),
  exposure: levelSchema(EXPOSURE_LEVELS, 'El nivel de exposición es 4, 3, 2 o 1.'),
  consequence: levelSchema(CONSEQUENCE_LEVELS, 'El nivel de consecuencia es 100, 60, 25 o 10.'),
  proposed_controls: sstOptionalText(1000),
  review_on: sstDateSchema.describe('Fecha de la próxima revisión'),
});

export type Hazard = z.infer<typeof hazardSchema>;
export type SaveHazard = z.infer<typeof saveHazardSchema>;
