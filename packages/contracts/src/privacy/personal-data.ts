import { z } from 'zod';

// Entrega y supresión de los datos de un titular (M18, B42; ficha 17.19). Cada módulo presta sus
// datos con etiquetas en español; lo que la ley obliga a conservar se bloquea y se informa
// (decisiones 6 y 8).

const dateTime = z.iso.datetime({ offset: true });

function enumOf<T extends string>(labels: Readonly<Record<T, string>>) {
  return z.enum(Object.keys(labels) as [T, ...T[]]);
}

export const PERSONAL_DATA_OUTCOMES = {
  erased: 'Suprimido',
  blocked: 'Bloqueado por deber legal',
  kept: 'Conservado como prueba',
  none: 'Sin datos',
} as const;

export type PersonalDataOutcome = keyof typeof PERSONAL_DATA_OUTCOMES;

export const personalDataOutcomeSchema = enumOf(PERSONAL_DATA_OUTCOMES);

export const erasureSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  outcome: personalDataOutcomeSchema,
  count: z.number().int().nonnegative(),
  reason: z.string().nullable().describe('Por qué se bloquea o se conserva'),
});

export type ErasureSection = z.infer<typeof erasureSectionSchema>;

export const erasureResultSchema = z.object({
  erased_at: dateTime,
  sections: z.array(erasureSectionSchema),
});

export type ErasureResult = z.infer<typeof erasureResultSchema>;

export const PERSONAL_DATA_EXPORT_STATUSES = {
  pending: 'En preparación',
  ready: 'Lista',
  failed: 'No se pudo preparar',
} as const;

export type PersonalDataExportStatus = keyof typeof PERSONAL_DATA_EXPORT_STATUSES;

export const personalDataExportStatusSchema = enumOf(PERSONAL_DATA_EXPORT_STATUSES);

export const personalDataExportSchema = z.object({
  id: z.uuid(),
  status: personalDataExportStatusSchema,
  requested_at: dateTime,
  ready_at: dateTime.nullable(),
  pdf_file_id: z.uuid().nullable(),
});

export type PersonalDataExport = z.infer<typeof personalDataExportSchema>;

/** Un dato con su etiqueta en español, para el PDF y la copia en formato de datos (decisión 6). */
export const personalDataFieldSchema = z.object({
  label: z.string(),
  value: z.string().nullable(),
});

export const personalDataRecordSchema = z.object({
  title: z.string(),
  fields: z.array(personalDataFieldSchema),
});

export const personalDataSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  records: z.array(personalDataRecordSchema),
});

export type PersonalDataField = z.infer<typeof personalDataFieldSchema>;
export type PersonalDataRecord = z.infer<typeof personalDataRecordSchema>;
export type PersonalDataSection = z.infer<typeof personalDataSectionSchema>;

/** Contenido del archivo que recibe el titular. */
export const personalDataReportSchema = z.object({
  company: z.string(),
  holder: z.string(),
  request_code: z.string(),
  generated_at: dateTime,
  sections: z.array(personalDataSectionSchema),
});

export type PersonalDataReport = z.infer<typeof personalDataReportSchema>;
