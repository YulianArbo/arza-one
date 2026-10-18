import type { DocumentStatus } from '@arza/contracts';

// Formato del Listado Maestro (B19, RE-SGC-001): las columnas de la exportación son las mismas que
// lee la carga inicial, así que exportar e importar se pueden comparar fila por fila.

export const MASTER_LIST_COLUMNS = [
  'Código',
  'Nombre',
  'Tipo',
  'Proceso',
  'Versión',
  'Fecha',
  'Estado',
  'Responsable',
] as const;

export const DOCUMENT_STATUS_LABELS: Readonly<Record<DocumentStatus, string>> = {
  draft: 'Sin publicar',
  current: 'Vigente',
  obsolete: 'Obsoleto',
};

/** 2026-10-17 → 17/10/2026. */
export function displayDate(isoDate: string | null): string | null {
  if (isoDate === null) return null;
  const [year, month, day] = isoDate.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** 17/10/2026 → 2026-10-17; null si no es una fecha válida. */
export function isoDateOf(display: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(display.trim());
  if (match === null) return null;
  const [, day = '', month = '', year = ''] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Para comparar encabezados y nombres: sin tildes, sin mayúsculas y sin espacios de más. */
export function normalized(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}
