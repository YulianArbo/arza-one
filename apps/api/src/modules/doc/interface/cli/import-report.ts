import type { ImportReport } from '../../application/master-list-import.js';
import { toCsv } from '../../../../platform/export/csv.js';

// Informe de la carga inicial del Listado Maestro (B19, numeral 18.2): el resumen para la consola y
// el archivo CSV que queda como evidencia («Informe de importación sin diferencias»).

export function summaryLines(report: ImportReport, applied: boolean): string[] {
  const lines = [
    `Documentos vigentes en el listado: ${String(report.listed)}`,
    `Filas no vigentes (no se cargan): ${String(report.skipped.length)}`,
    `Filas con problemas: ${String(report.problems.length)}`,
  ];
  if (applied) {
    lines.push(
      `En esta corrida: ${String(report.uploaded)} archivos subidos, ${String(report.created)} documentos creados, ${String(report.published)} publicados`,
      `Vigentes cargados: ${String(report.current)}`,
      `Esperando el antivirus o el PDF: ${String(report.waiting)}`,
    );
  }
  lines.push(
    report.differences.length === 0
      ? 'Conciliación: SIN DIFERENCIAS entre la plataforma y el listado.'
      : `Conciliación: ${String(report.differences.length)} diferencias entre la plataforma y el listado.`,
  );
  return lines;
}

export function detailLines(report: ImportReport): string[] {
  return [
    ...report.problems.map((p) => `  Fila ${String(p.row)} ${p.code ?? ''}: ${p.problem}`),
    ...report.skipped.map((p) => `  Fila ${String(p.row)} ${p.code ?? ''}: ${p.problem}`),
    ...report.differences.map((d) => `  ${d.code}: ${d.problem}`),
  ];
}

/** El informe completo en CSV: una fila por problema, omisión o diferencia, y el resumen. */
export function reportCsv(report: ImportReport, applied: boolean): string {
  const rows = [
    ...report.problems.map((p) => [String(p.row), p.code, 'Problema', p.problem]),
    ...report.skipped.map((p) => [String(p.row), p.code, 'No se carga', p.problem]),
    ...report.differences.map((d) => [null, d.code, 'Diferencia', d.problem]),
    ...summaryLines(report, applied).map((line) => [null, null, 'Resumen', line]),
  ];
  return toCsv(['Fila', 'Código', 'Resultado', 'Detalle'], rows);
}
