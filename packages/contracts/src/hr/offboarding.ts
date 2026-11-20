import { z } from 'zod';

import { hrRefSchema } from './selection.js';

// Retiro y paz y salvo (B36, ficha 17.13, decisiones 9 y 10; numerales 13.3 «employee.terminated» y
// 15.1 «Retiro»). Talento humano registra el motivo y el último día; la lista de chequeo reparte
// las tareas por área y muestra los activos por devolver. Al terminar el último día laborado la
// plataforma desactiva la cuenta y cierra las sesiones sola. Con todo hecho se emite el paz y salvo.

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => textSchema(1, max).nullable().default(null);

function enumOf<T extends Record<string, unknown>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

export const OFFBOARDING_REASONS = {
  resignation: 'Renuncia voluntaria',
  just_cause: 'Terminación con justa causa',
  without_cause: 'Terminación sin justa causa',
  mutual_agreement: 'Mutuo acuerdo',
  contract_end: 'Vencimiento del contrato',
  other: 'Otro motivo',
} as const;
export type OffboardingReason = keyof typeof OFFBOARDING_REASONS;
export const offboardingReasonSchema = enumOf(OFFBOARDING_REASONS);

export const OFFBOARDING_STATUS = {
  in_progress: 'En curso',
  cleared: 'Paz y salvo emitido',
  cancelled: 'Anulado',
} as const;
export type OffboardingStatus = keyof typeof OFFBOARDING_STATUS;
export const offboardingStatusSchema = enumOf(OFFBOARDING_STATUS);

/** Quién responde por cada ítem: Talento humano, Administrativo y financiero o SST. */
export type OffboardingResponsible = 'hr' | 'assets' | 'sst';

/** Lista de chequeo del retiro (decisión 10), por validar con Talento humano. */
export const OFFBOARDING_ITEMS = {
  assets_return: { label: 'Devolución de equipos y activos', responsible: 'assets' },
  finance_clearance: {
    label: 'Paz y salvo financiero (anticipos, caja menor, préstamos)',
    responsible: 'assets',
  },
  exit_exam: { label: 'Examen médico ocupacional de egreso', responsible: 'sst' },
  settlement: { label: 'Liquidación enviada al software de nómina', responsible: 'hr' },
  exit_interview: { label: 'Entrevista de retiro', responsible: 'hr' },
  certificate: { label: 'Certificado laboral entregado', responsible: 'hr' },
} as const satisfies Record<string, { label: string; responsible: OffboardingResponsible }>;
export type OffboardingItem = keyof typeof OFFBOARDING_ITEMS;
export const offboardingItemSchema = enumOf(OFFBOARDING_ITEMS);

export const offboardingChecklistEntrySchema = z.object({
  item: offboardingItemSchema,
  label: z.string(),
  responsible: hrRefSchema.nullable(),
  done_on: dateSchema.nullable(),
  done_by: hrRefSchema.nullable(),
  note: z.string().nullable(),
});

export const heldAssetSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  assigned_on: dateSchema,
});

export const offboardingSchema = z.object({
  id: idSchema,
  employee: hrRefSchema,
  reason: offboardingReasonSchema,
  last_day: dateSchema,
  note: z.string().nullable(),
  status: offboardingStatusSchema,
  checklist: z.array(offboardingChecklistEntrySchema),
  /** Activos que aún tiene a su cargo (Activos, B34). */
  assets: z.array(heldAssetSchema),
  exit_interview_file_id: idSchema.nullable(),
  account_deactivated_at: z.iso.datetime({ offset: true }).nullable(),
  cleared_on: dateSchema.nullable(),
  /** Todo listo para emitir el paz y salvo. */
  can_clear: z.boolean(),
  version: z.number().int().positive(),
});
export const offboardingListResponseSchema = z.object({ data: z.array(offboardingSchema) });

export const startOffboardingSchema = z.strictObject({
  employee_id: idSchema,
  reason: offboardingReasonSchema,
  last_day: dateSchema.describe('Último día laborado'),
  note: optionalText(2000),
});

export const completeOffboardingItemSchema = z.strictObject({
  done_on: dateSchema,
  note: optionalText(1000),
  file_id: idSchema
    .nullable()
    .default(null)
    .describe('Soporte de la entrevista de retiro, si aplica'),
});

export const cancelOffboardingSchema = z.strictObject({ reason: textSchema(3, 1000) });

export type Offboarding = z.infer<typeof offboardingSchema>;
export type OffboardingChecklistEntry = z.infer<typeof offboardingChecklistEntrySchema>;
export type HeldAssetView = z.infer<typeof heldAssetSchema>;
export type StartOffboarding = z.infer<typeof startOffboardingSchema>;
export type CompleteOffboardingItem = z.infer<typeof completeOffboardingItemSchema>;
export type CancelOffboarding = z.infer<typeof cancelOffboardingSchema>;
