import { z } from 'zod';

// Esquema de un formato digital (M03, B20; ficha 17.4 y capítulo 18, forma B): las secciones y los
// campos que Calidad arma en el diseñador, y la validación de lo que una persona diligencia. La
// misma validación corre en la pantalla y en la API, con los campos de la versión exacta del
// formato con que se creó el registro.

export const FORM_FIELD_TYPES = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  number: 'Número',
  date: 'Fecha',
  boolean: 'Sí o no',
  select: 'Lista de opciones',
  checklist: 'Lista de verificación',
  table: 'Tabla',
} as const;

export type FormFieldType = keyof typeof FORM_FIELD_TYPES;

export const TABLE_COLUMN_TYPES = { text: 'Texto', number: 'Número', date: 'Fecha' } as const;

export type TableColumnType = keyof typeof TABLE_COLUMN_TYPES;

/** Respuestas de cada punto de una lista de verificación. */
export const CHECK_RESULTS = { yes: 'Cumple', no: 'No cumple', na: 'No aplica' } as const;

export type CheckResult = keyof typeof CHECK_RESULTS;

export const formFieldTypeSchema = z
  .enum(Object.keys(FORM_FIELD_TYPES) as [FormFieldType, ...FormFieldType[]])
  .describe('Texto, texto largo, número, fecha, sí o no, lista, verificación o tabla');

const keySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/u, 'Use minúsculas, números y guion bajo; empiece por una letra.')
  .describe('Nombre interno del campo; es la variable de las plantillas');

const label = (max: number) => z.string().trim().min(1).max(max);

export const tableColumnSchema = z.strictObject({
  key: keySchema,
  label: label(80),
  type: z.enum(Object.keys(TABLE_COLUMN_TYPES) as [TableColumnType, ...TableColumnType[]]),
});

function duplicates(keys: readonly string[]): string[] {
  return keys.filter((key, index) => keys.indexOf(key) !== index);
}

export const formFieldSchema = z
  .strictObject({
    key: keySchema,
    label: label(120),
    type: formFieldTypeSchema,
    required: z.boolean().default(false),
    help: z.string().trim().max(300).nullable().default(null).describe('Ayuda bajo el campo'),
    options: z.array(label(80)).max(50).default([]).describe('Opciones de una lista'),
    items: z.array(label(300)).max(60).default([]).describe('Puntos de una verificación'),
    columns: z.array(tableColumnSchema).max(10).default([]).describe('Columnas de una tabla'),
  })
  .superRefine((field, context) => {
    const issue = (path: string, message: string) => {
      context.addIssue({ code: 'custom', path: [path], message });
    };
    const needs = { select: 'options', checklist: 'items', table: 'columns' } as const;
    for (const [type, part] of Object.entries(needs)) {
      const present = field[part].length > 0;
      if (field.type === type && !present) issue(part, 'Agregue al menos un elemento.');
      if (field.type !== type && present) issue(part, 'Este tipo de campo no lo usa.');
    }
    if (field.type === 'select' && field.options.length < 2) {
      issue('options', 'Una lista necesita al menos dos opciones.');
    }
    if (duplicates(field.options).length > 0) issue('options', 'Hay opciones repetidas.');
    if (duplicates(field.columns.map((c) => c.key)).length > 0) {
      issue('columns', 'Hay columnas con el mismo nombre interno.');
    }
  });

export const formSectionSchema = z.strictObject({
  key: keySchema,
  title: label(120),
  fields: z.array(formFieldSchema).min(1).max(60),
});

/** Las secciones y los campos de una versión de un formato. */
export const formDefinitionSchema = z
  .strictObject({ sections: z.array(formSectionSchema).min(1).max(30) })
  .superRefine((definition, context) => {
    const sections = definition.sections.map((section) => section.key);
    if (duplicates(sections).length > 0) {
      context.addIssue({ code: 'custom', path: ['sections'], message: 'Secciones repetidas.' });
    }
    const fields = definition.sections.flatMap((s) => s.fields.map((f) => f.key));
    for (const key of new Set(duplicates(fields))) {
      context.addIssue({
        code: 'custom',
        path: ['sections'],
        message: `El nombre interno «${key}» está en más de un campo.`,
      });
    }
  });

export const formLayoutSchema = z
  .strictObject({
    orientation: z
      .enum(['portrait', 'landscape'])
      .default('portrait')
      .describe('Hoja vertical u horizontal'),
  })
  .describe('Cómo se imprime el formato');

export type TableColumn = z.infer<typeof tableColumnSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type FormSection = z.infer<typeof formSectionSchema>;
export type FormDefinition = z.infer<typeof formDefinitionSchema>;
export type FormLayout = z.infer<typeof formLayoutSchema>;

// Valores diligenciados --------------------------------------------------------------------------

const decimal = z
  .string()
  .regex(/^-?\d{1,15}([.,]\d{1,4})?$/u, 'Escriba un número, con hasta cuatro decimales.');
const calendarDate = z.iso.date({ error: 'Escriba una fecha válida.' });

export const checklistAnswerSchema = z.strictObject({
  result: z.enum(Object.keys(CHECK_RESULTS) as [CheckResult, ...CheckResult[]]).nullable(),
  note: z.string().trim().max(500).default(''),
});

export type ChecklistAnswer = z.infer<typeof checklistAnswerSchema>;
export type TableRow = Readonly<Record<string, string>>;
export type FormValue = string | boolean | null | readonly ChecklistAnswer[] | readonly TableRow[];
export type FormData = Readonly<Record<string, FormValue>>;

/** Cuándo se valida: un borrador acepta lo incompleto; al enviarlo, lo obligatorio debe estar. */
export type FormDataMode = 'draft' | 'final';

function cellSchema(column: TableColumn): z.ZodType<string> {
  const empty = z.literal('');
  if (column.type === 'number') return z.union([empty, decimal]);
  if (column.type === 'date') return z.union([empty, calendarDate]);
  return z.string().trim().max(500);
}

function rowSchema(columns: readonly TableColumn[]): z.ZodType<TableRow> {
  const shape = Object.fromEntries(columns.map((c) => [c.key, cellSchema(c).default('')]));
  return z.strictObject(shape);
}

function valueSchema(field: FormField): z.ZodType<FormValue> {
  switch (field.type) {
    case 'text':
      return z.string().trim().max(500);
    case 'textarea':
      return z.string().trim().max(5000);
    case 'number':
      return z.union([z.literal(''), decimal]);
    case 'date':
      return z.union([z.literal(''), calendarDate]);
    case 'boolean':
      return z.boolean();
    case 'select':
      return z.union([z.literal(''), z.enum(field.options as [string, ...string[]])]);
    case 'checklist':
      return z.array(checklistAnswerSchema).length(field.items.length);
    case 'table':
      return z.array(rowSchema(field.columns)).max(100);
  }
}

/** Un valor vacío: sin escribir, sin elegir, o una tabla sin filas. */
export function isEmptyValue(value: FormValue | undefined): boolean {
  if (value === undefined || value === null || value === '') return true;
  return Array.isArray(value) && value.length === 0;
}

function missing(field: FormField, value: FormValue | undefined): boolean {
  if (isEmptyValue(value)) return true;
  if (field.type !== 'checklist' || !Array.isArray(value)) return false;
  return (value as readonly ChecklistAnswer[]).some((answer) => answer.result === null);
}

export function formFields(definition: FormDefinition): FormField[] {
  return definition.sections.flatMap((section) => section.fields);
}

/** Validador de los datos de un registro con los campos de la versión del formato. */
export function formDataSchema(
  definition: FormDefinition,
  mode: FormDataMode,
): z.ZodType<FormData> {
  const fields = formFields(definition);
  const shape = Object.fromEntries(
    fields.map((f) => [f.key, valueSchema(f).nullable().optional()]),
  );
  return z.strictObject(shape).superRefine((data, context) => {
    if (mode === 'draft') return;
    for (const field of fields) {
      if (!field.required || !missing(field, data[field.key])) continue;
      const message =
        field.type === 'checklist' ? 'Responda todos los puntos.' : 'Este campo es obligatorio.';
      context.addIssue({ code: 'custom', path: [field.key], message });
    }
  }) as z.ZodType<FormData>;
}
