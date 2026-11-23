import { escapeHtml } from './notice-email.js';

// Cuerpo del informe «Sus datos personales» que se entrega al titular (B42, decisión 6). El
// encabezado y el pie los pone Gotenberg (institutional.ts). Todo va escapado: son datos escritos
// por personas.

interface ReportField {
  readonly label: string;
  readonly value: string | null;
}

interface ReportRecord {
  readonly title: string;
  readonly fields: readonly ReportField[];
}

interface ReportSection {
  readonly title: string;
  readonly records: readonly ReportRecord[];
}

export interface PersonalDataDocument {
  readonly company: string;
  readonly holder: string;
  readonly requestCode: string;
  readonly generatedOn: string;
  readonly sections: readonly ReportSection[];
}

function record(item: ReportRecord): string {
  const rows = item.fields.map(
    (field) =>
      `<tr><td class="label">${escapeHtml(field.label)}</td><td>${escapeHtml(field.value ?? '—')}</td></tr>`,
  );
  return `<h3>${escapeHtml(item.title)}</h3><table>${rows.join('')}</table>`;
}

/** Cuerpo del informe, para printPage. */
export function personalDataReportBody(report: PersonalDataDocument): string {
  const intro =
    `<p>${escapeHtml(report.company)} entrega a ${escapeHtml(report.holder)} los datos personales ` +
    `que conserva de usted, en respuesta a la solicitud ${escapeHtml(report.requestCode)} ` +
    `(Ley 1581 de 2012, art. 8). Generado el ${escapeHtml(report.generatedOn)}.</p>`;
  const sections = report.sections.map(
    (section) => `<h2>${escapeHtml(section.title)}</h2>${section.records.map(record).join('')}`,
  );
  return [intro, ...sections].join('');
}
