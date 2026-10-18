import type {
  FormEntityType,
  FormRecordStatus,
  FormTemplateStatus,
  OutputTemplateStatus,
  PdfStatus,
} from '@arza/contracts';

import { DOCUMENTS_PATH } from '../documents/labels';

// Textos y rutas de los formatos digitales (B20, numeral 16.6: sin jerga, trato de usted).

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

export const FORMS_PATH = `${DOCUMENTS_PATH}/formatos`;
export const NEW_FORM_PATH = `${FORMS_PATH}/nuevo`;
export const RECORDS_PATH = `${DOCUMENTS_PATH}/registros`;
export const OUTPUT_TEMPLATES_PATH = '/app/administracion/plantillas-de-salida';

export function formPath(id: string): string {
  return `${FORMS_PATH}/${id}`;
}

export function editFormPath(id: string): string {
  return `${FORMS_PATH}/${id}/editar`;
}

export function newFormVersionPath(id: string): string {
  return `${FORMS_PATH}/${id}/nueva-version`;
}

export function recordPath(id: string): string {
  return `${RECORDS_PATH}/${id}`;
}

/** Diligenciar un formato, unido o no a otro registro. */
export function fillPath(
  templateId: string,
  entity: { readonly type: FormEntityType; readonly id: string } | null = null,
): string {
  const base = `${RECORDS_PATH}/nuevo?formato=${templateId}`;
  return entity === null ? base : `${base}&tipo=${entity.type}&registro=${entity.id}`;
}

export const TEMPLATE_STATUS_TONES: Readonly<Record<FormTemplateStatus, Tone>> = {
  draft: 'warning',
  published: 'success',
  retired: 'neutral',
};

export const OUTPUT_STATUS_TONES: Readonly<Record<OutputTemplateStatus, Tone>> = {
  draft: 'warning',
  published: 'success',
  retired: 'neutral',
};

export const RECORD_STATUS_TONES: Readonly<Record<FormRecordStatus, Tone>> = {
  draft: 'warning',
  in_approval: 'info',
  completed: 'success',
};

export const PDF_STATUS_LABELS: Readonly<Record<PdfStatus, string>> = {
  none: 'El PDF se genera cuando el registro termina.',
  pending: 'Generando el PDF…',
  ready: 'PDF listo',
  failed: 'No se pudo generar el PDF. Avise a Calidad para revisar la plantilla de salida.',
};
