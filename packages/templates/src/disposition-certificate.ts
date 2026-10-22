import { escapeHtml } from './notice-email.js';

// Cuerpo del Acta de disposición final (B21, RE-SGC-005): qué documentos se eliminaron, cuáles se
// conservaron y por qué, y quién revisó y aprobó. El encabezado y el pie los pone Gotenberg
// (institutional.ts). Todo lo que escribió una persona va escapado.

export interface DisposedDocumentLine {
  readonly code: string;
  readonly title: string;
  readonly series: string;
  /** Cuándo venció su retención, dd/mm/aaaa. */
  readonly dueOn: string;
  readonly legalBasis: string;
}

export interface KeptDocumentLine {
  readonly code: string;
  readonly title: string;
  readonly series: string;
  readonly reason: string;
}

export interface DispositionCertificate {
  readonly code: string;
  /** Mes de la propuesta, como «octubre de 2026». */
  readonly period: string;
  readonly proposedOn: string;
  readonly sentBy: string;
  readonly sentOn: string;
  readonly approvedBy: string;
  readonly approvedOn: string;
  readonly executedOn: string;
  readonly disposed: readonly DisposedDocumentLine[];
  readonly kept: readonly KeptDocumentLine[];
}

function row(cells: readonly string[]): string {
  return `<tr>${cells.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`;
}

function table(head: readonly string[], rows: readonly string[], empty: string): string {
  const header = `<tr>${head.map((title) => `<th>${escapeHtml(title)}</th>`).join('')}</tr>`;
  const body =
    rows.length === 0
      ? `<tr><td colspan="${String(head.length)}" class="empty">${escapeHtml(empty)}</td></tr>`
      : rows.join('');
  return `<table>${header}${body}</table>`;
}

function facts(certificate: DispositionCertificate): string {
  const lines = [
    ['Acta', `${certificate.code} · ${certificate.period}`],
    ['Propuesta generada', certificate.proposedOn],
    ['Revisó y envió', `${certificate.sentBy} · ${certificate.sentOn}`],
    ['Aprobó', `${certificate.approvedBy} · ${certificate.approvedOn}`],
    ['Ejecutada', certificate.executedOn],
  ];
  const rows = lines.map(
    ([label = '', value = '']) =>
      `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
  );
  return `<table>${rows.join('')}</table>`;
}

/** Cuerpo del acta, para printPage. */
export function dispositionCertificateBody(certificate: DispositionCertificate): string {
  const disposed = certificate.disposed.map((line) =>
    row([line.code, line.title, line.series, line.dueOn, line.legalBasis]),
  );
  const kept = certificate.kept.map((line) =>
    row([line.code, line.title, line.series, line.reason]),
  );
  return [
    facts(certificate),
    `<h2>Documentos eliminados (${String(certificate.disposed.length)})</h2>`,
    table(
      ['Código', 'Nombre', 'Serie', 'Venció el', 'Fundamento'],
      disposed,
      'Ningún documento se eliminó.',
    ),
    `<h2>Documentos conservados (${String(certificate.kept.length)})</h2>`,
    table(['Código', 'Nombre', 'Serie', 'Motivo'], kept, 'Ningún documento se conservó.'),
    '<p>El contenido de los documentos eliminados se borró de forma definitiva del almacenamiento ',
    'de la plataforma. Su código y su nombre se conservan en esta acta como evidencia de la ',
    'disposición final (Tabla de Retención RE-SGC-005).</p>',
  ].join('');
}
