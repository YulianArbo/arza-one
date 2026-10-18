import { z } from 'zod';

// Contratos de las plantillas de salida (M03, B20; numeral 13.2 y capítulo 18, forma D): un texto
// HTML con variables {{nombre}} o un Word con variables {nombre}, que la plataforma llena con los
// datos del registro y convierte a PDF con el encabezado y el pie institucionales. Cada
// publicación es una versión nueva e inmutable; los formatos apuntan a una versión exacta.

const dateTime = z.iso.datetime({ offset: true });

export const OUTPUT_ENGINES = { html: 'HTML', docx: 'Word (DOCX)' } as const;

export type OutputEngine = keyof typeof OUTPUT_ENGINES;

export const outputEngineSchema = z
  .enum(Object.keys(OUTPUT_ENGINES) as [OutputEngine, ...OutputEngine[]])
  .describe('HTML (variables {{nombre}}) o Word (variables {nombre})');

export const OUTPUT_TEMPLATE_STATUSES = {
  draft: 'Borrador',
  published: 'Publicada',
  retired: 'Retirada',
} as const;

export type OutputTemplateStatus = keyof typeof OUTPUT_TEMPLATE_STATUSES;

export const outputTemplateStatusSchema = z
  .enum(Object.keys(OUTPUT_TEMPLATE_STATUSES) as [OutputTemplateStatus, ...OutputTemplateStatus[]])
  .describe('Borrador, publicada (en uso) o retirada');

export const outputTemplateCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9-]{2,39}$/u, 'Use mayúsculas, números y guiones (FT-COM-002).');

export const outputTemplateActionSchema = z.enum(['edit', 'publish', 'new_version']);

export type OutputTemplateAction = z.infer<typeof outputTemplateActionSchema>;

/** Tamaño máximo del HTML de una plantilla. */
export const MAX_OUTPUT_BODY_LENGTH = 200_000;

export const outputTemplateSummarySchema = z.object({
  id: z.uuid(),
  code: outputTemplateCodeSchema,
  name: z.string(),
  engine: outputEngineSchema,
  output_version: z.number().int().positive(),
  status: outputTemplateStatusSchema,
  published_at: dateTime.nullable(),
  version: z.number().int().positive(),
});

export const outputTemplateSchema = outputTemplateSummarySchema.extend({
  body: z.string().nullable().describe('HTML de la plantilla (solo HTML)'),
  file: z
    .object({ id: z.uuid(), file_name: z.string() })
    .nullable()
    .describe('Word de la plantilla (solo Word)'),
  variables: z.array(z.string()).describe('Variables que usa la plantilla'),
  published_by: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  actions: z.array(outputTemplateActionSchema),
});

export const outputTemplateListQuerySchema = z.strictObject({
  status: outputTemplateStatusSchema.optional(),
});

export const outputTemplateListResponseSchema = z.object({
  data: z
    .array(outputTemplateSummarySchema)
    .describe('Por código y de la versión más nueva a la más antigua'),
});

const content = {
  name: z.string().trim().min(3).max(200),
  body: z.string().max(MAX_OUTPUT_BODY_LENGTH).nullable().default(null),
  file_id: z.uuid().nullable().default(null).describe('Word subido con /v1/files'),
};

function engineContent(
  value: { engine: OutputEngine; body: string | null; file_id: string | null },
  context: z.RefinementCtx,
): void {
  const html = value.engine === 'html';
  if (html && (value.body === null || value.body.trim() === '')) {
    context.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'Escriba el HTML de la plantilla.',
    });
  }
  if (!html && value.file_id === null) {
    context.addIssue({
      code: 'custom',
      path: ['file_id'],
      message: 'Suba el Word de la plantilla.',
    });
  }
  if (html && value.file_id !== null) {
    context.addIssue({
      code: 'custom',
      path: ['file_id'],
      message: 'Una plantilla HTML no lleva Word.',
    });
  }
  if (!html && value.body !== null) {
    context.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'Una plantilla Word no lleva HTML.',
    });
  }
}

/** Plantilla nueva, o versión nueva en borrador de una que ya existe (mismo código y motor). */
export const createOutputTemplateSchema = z
  .strictObject({ code: outputTemplateCodeSchema, engine: outputEngineSchema, ...content })
  .superRefine(engineContent);

export const updateOutputTemplateSchema = z.strictObject(content);

export type OutputTemplateSummary = z.infer<typeof outputTemplateSummarySchema>;
export type OutputTemplate = z.infer<typeof outputTemplateSchema>;
export type OutputTemplateListQuery = z.infer<typeof outputTemplateListQuerySchema>;
export type OutputTemplateListResponse = z.infer<typeof outputTemplateListResponseSchema>;
export type CreateOutputTemplate = z.infer<typeof createOutputTemplateSchema>;
export type UpdateOutputTemplate = z.infer<typeof updateOutputTemplateSchema>;
