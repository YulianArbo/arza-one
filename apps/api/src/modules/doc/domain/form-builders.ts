import type { FormField, FormSection } from '@arza/contracts';

// Piezas para escribir los formatos que trae la plataforma (B20 y B27): campos con sus valores por
// omisión y secciones.

type FieldInput = Partial<FormField> & Pick<FormField, 'key' | 'label' | 'type'>;

export function field(input: FieldInput): FormField {
  return { required: false, help: null, options: [], items: [], columns: [], ...input };
}

export const text = (key: string, label: string, required = false): FormField =>
  field({ key, label, type: 'text', required });
export const long = (key: string, label: string, required = false): FormField =>
  field({ key, label, type: 'textarea', required });
export const date = (key: string, label: string, required = false): FormField =>
  field({ key, label, type: 'date', required });
export const yesNo = (key: string, label: string): FormField =>
  field({ key, label, type: 'boolean' });
export const choice = (
  key: string,
  label: string,
  options: string[],
  required = false,
): FormField => field({ key, label, type: 'select', options, required });

export function section(key: string, title: string, fields: FormField[]): FormSection {
  return { key, title, fields };
}
