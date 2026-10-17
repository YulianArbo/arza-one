import { z } from 'zod';

// Contratos del registro de actividades de tratamiento y de los encargados (M18, B17; numeral
// 20.1: Ley 1581 de 2012, arts. 4, 17, 18 y 26). Todo proveedor con acceso a datos debe tener
// contrato de transmisión; mientras falte, el encargado aparece con la alerta.

const calendarDate = z.iso.date().describe('Fecha de calendario AAAA-MM-DD');
const versionField = z.number().int().positive().describe('Versión para la cabecera If-Match');
const partyRefSchema = z.object({ id: z.uuid(), name: z.string().nullable() });

export const dataCategorySchema = z
  .enum([
    'identification',
    'contact',
    'demographic',
    'financial',
    'employment',
    'education',
    'images',
    'location',
    'health',
    'biometric',
  ])
  .describe('Categoría de datos personales');

export type DataCategory = z.infer<typeof dataCategorySchema>;

/** Datos sensibles (Ley 1581, art. 5): exigen autorización explícita y aviso de que es facultativo. */
export const SENSITIVE_DATA_CATEGORIES: readonly DataCategory[] = ['health', 'biometric'];

export const holderTypeSchema = z
  .enum(['customers', 'suppliers', 'employees', 'candidates', 'contacts', 'visitors', 'users'])
  .describe('Tipo de titular');

export type HolderType = z.infer<typeof holderTypeSchema>;

export const recordStatusSchema = z.enum(['active', 'inactive']).describe('Activo o inactivo');

function distinctList<T extends z.ZodType>(item: T, max: number) {
  return z
    .array(item)
    .min(1, 'Elija al menos una opción.')
    .max(max)
    .refine((values) => new Set(values).size === values.length, 'Hay opciones repetidas.');
}

const activityFields = {
  name: z.string().trim().min(3).max(150),
  purpose: z.string().trim().min(10).max(1000).describe('Para qué se tratan los datos'),
  data_categories: distinctList(dataCategorySchema, 10),
  holder_types: distinctList(holderTypeSchema, 7),
  legal_basis: z.string().trim().min(10).max(500).describe('Fundamento legal del tratamiento'),
  retention: z.string().trim().min(5).max(300).describe('Cuánto tiempo se conservan'),
  international_transfers: z
    .string()
    .trim()
    .min(5)
    .max(500)
    .nullable()
    .default(null)
    .describe('Países y destinatarios; vacío si no hay'),
  processor_ids: z
    .array(z.uuid())
    .max(20)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, 'Hay encargados repetidos.')
    .describe('Encargados que participan'),
};

export const createActivityRequestSchema = z.strictObject(activityFields);

export type CreateActivityRequest = z.infer<typeof createActivityRequestSchema>;

export const updateActivityRequestSchema = z.strictObject({
  ...activityFields,
  status: recordStatusSchema,
});

export type UpdateActivityRequest = z.infer<typeof updateActivityRequestSchema>;

export const activitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  purpose: z.string(),
  data_categories: z.array(dataCategorySchema),
  holder_types: z.array(holderTypeSchema),
  legal_basis: z.string(),
  retention: z.string(),
  international_transfers: z.string().nullable(),
  processors: z.array(z.object({ id: z.uuid(), name: z.string().nullable() })),
  sensitive: z.boolean().describe('Incluye datos sensibles'),
  status: recordStatusSchema,
  version: versionField,
});

export type Activity = z.infer<typeof activitySchema>;

export const activityListResponseSchema = z.object({ data: z.array(activitySchema) });

export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;

const processorFields = {
  service: z.string().trim().min(3).max(300).describe('Qué hace con los datos'),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use el código de dos letras del país, como CO o US.')
    .describe('Dónde trata los datos (ISO 3166-1)'),
  contract_file_id: z
    .uuid()
    .nullable()
    .default(null)
    .describe('Contrato de transmisión: archivo ya revisado por el antivirus'),
  review_on: calendarDate.describe('Próxima revisión del encargado'),
};

export const createProcessorRequestSchema = z.strictObject({
  party_id: z.uuid().describe('Tercero organización que presta el servicio'),
  ...processorFields,
});

export type CreateProcessorRequest = z.infer<typeof createProcessorRequestSchema>;

export const updateProcessorRequestSchema = z.strictObject({
  ...processorFields,
  status: recordStatusSchema,
});

export type UpdateProcessorRequest = z.infer<typeof updateProcessorRequestSchema>;

export const processorSchema = z.object({
  id: z.uuid(),
  party: partyRefSchema,
  service: z.string(),
  country: z.string(),
  contract_file_id: z.uuid().nullable(),
  has_contract: z.boolean().describe('Falso: falta el contrato de transmisión'),
  review_on: calendarDate,
  status: recordStatusSchema,
  version: versionField,
});

export type Processor = z.infer<typeof processorSchema>;

export const processorListResponseSchema = z.object({ data: z.array(processorSchema) });

export type ProcessorListResponse = z.infer<typeof processorListResponseSchema>;
