import type { Prisma } from '../../generated/prisma/client.js';

// Alerta de exportación masiva (numeral 10.7, decisión 6 de B44). Una exportación es una acción
// de auditoría con un segmento «export…» (por ejemplo «qms.action.export» o
// «finance.export.download») hecha por una persona. Es masiva si saca más de 500 registros, o
// siempre que saque la auditoría o los datos personales de un titular.

/** Más de este número de registros en una sola exportación dispara la alerta. */
export const BULK_EXPORT_ROWS = 500;

/** Exportaciones que siempre alertan, sin importar el tamaño. */
const ALWAYS_ALERT: ReadonlySet<string> = new Set(['audit.event.export', 'privacy.data.export']);

/** Tipo de la alerta en la bandeja de salida y en los eventos de seguridad. */
export const BULK_EXPORT_ALERT = 'data.export.bulk';

export function isExportAction(action: string): boolean {
  return action.split('.').some((segment) => segment.startsWith('export'));
}

/** Registros exportados según lo que el caso de uso dejó en la auditoría («rows» o «row_count»). */
export function exportedRows(changes: Prisma.InputJsonObject | undefined): number | null {
  const value = changes?.['rows'] ?? changes?.['row_count'];
  return typeof value === 'number' ? value : null;
}

export function isBulkExport(action: string, changes: Prisma.InputJsonObject | undefined): boolean {
  if (!isExportAction(action)) return false;
  if (ALWAYS_ALERT.has(action)) return true;
  const rows = exportedRows(changes);
  return rows !== null && rows > BULK_EXPORT_ROWS;
}
