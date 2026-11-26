import { toCsv } from '../../../../platform/export/csv.js';
import type { LoadReport, SheetReport } from '../../application/initial-load.js';

// Informe de la carga inicial (B45): el resumen para la consola y el CSV que queda como evidencia
// del anexo E (punto 17, «Informe de accesos», y punto 16 junto al del Listado Maestro).

const SHEET_FILES: Readonly<Record<SheetReport['sheet'], string>> = {
  estructura: 'areas.csv y cargos.csv',
  usuarios: 'usuarios.csv',
  terceros: 'terceros.csv',
};

function sheetLine(sheet: SheetReport, applied: boolean): string {
  const counts = applied
    ? `${String(sheet.created)} creados de ${String(sheet.planned)}`
    : `${String(sheet.planned)} por crear`;
  return `${SHEET_FILES[sheet.sheet]}: ${counts}, ${String(sheet.existing)} ya existían, ${String(sheet.problems.length)} con problemas`;
}

export function summaryLines(report: LoadReport): string[] {
  if (report.missingPermissions.length > 0) {
    return [
      `No se revisó nada: a la persona le faltan los permisos ${report.missingPermissions.join(', ')}.`,
    ];
  }
  const problems = report.sheets.reduce((total, sheet) => total + sheet.problems.length, 0);
  const verdict = report.applied
    ? 'Carga aplicada.'
    : problems > 0
      ? 'No se cargó nada: corrija los problemas y vuelva a revisar.'
      : 'Revisión sin problemas: vuelva a correr el comando con --aplicar para cargar.';
  return [...report.sheets.map((sheet) => sheetLine(sheet, report.applied)), verdict];
}

export function detailLines(report: LoadReport): string[] {
  return report.sheets.flatMap((sheet) =>
    sheet.problems.map(
      (p) => `  ${SHEET_FILES[sheet.sheet]}, fila ${String(p.row)} ${p.key ?? ''}: ${p.problem}`,
    ),
  );
}

/** El informe en CSV: una fila por problema y el resumen. */
export function reportCsv(report: LoadReport): string {
  const rows = [
    ...report.sheets.flatMap((sheet) =>
      sheet.problems.map((p) => [SHEET_FILES[sheet.sheet], String(p.row), p.key, p.problem]),
    ),
    ...summaryLines(report).map((line) => ['Resumen', null, null, line]),
  ];
  return toCsv(['Plantilla', 'Fila', 'Clave', 'Detalle'], rows);
}
