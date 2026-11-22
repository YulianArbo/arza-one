import { escapeHtml } from './notice-email.js';

// Cuerpos del Informe de auditoría interna (RE-SGC-004) y del Acta de revisión por la dirección
// (RE-SGC-007) (B39, decisión 9). El encabezado y el pie los pone Gotenberg (institutional.ts).
// Todo lo que escribió una persona va escapado.

interface ChecklistLine {
  readonly requirement: string;
  readonly question: string;
  readonly result: string;
  readonly evidence: string;
}

interface FindingLine {
  readonly type: string;
  readonly requirement: string;
  readonly description: string;
  readonly evidence: string;
  /** Código de la no conformidad o de la acción que abrió, o «—». */
  readonly followUp: string;
}

export interface AuditReportDocument {
  readonly code: string;
  readonly process: string;
  readonly auditor: string;
  readonly plannedOn: string;
  readonly startedOn: string;
  readonly reportedOn: string;
  readonly objective: string;
  readonly criteria: string;
  readonly checklist: readonly ChecklistLine[];
  readonly findings: readonly FindingLine[];
  readonly conclusions: string;
}

interface ReviewSection {
  readonly title: string;
  readonly lines: readonly string[];
  readonly comment: string;
}

interface ReviewDecisionLine {
  readonly description: string;
  readonly responsible: string;
  readonly dueOn: string;
  readonly action: string;
}

export interface ManagementReviewDocument {
  readonly code: string;
  readonly period: string;
  readonly meetingOn: string;
  readonly attendees: string;
  readonly sections: readonly ReviewSection[];
  readonly conclusions: string;
  readonly decisions: readonly ReviewDecisionLine[];
  readonly approvedBy: string;
  readonly approvedOn: string;
}

function facts(lines: readonly (readonly [string, string])[]): string {
  const rows = lines.map(
    ([label, value]) =>
      `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
  );
  return `<table>${rows.join('')}</table>`;
}

function table(head: readonly string[], rows: readonly (readonly string[])[], empty: string) {
  const header = `<tr>${head.map((title) => `<th>${escapeHtml(title)}</th>`).join('')}</tr>`;
  const body =
    rows.length === 0
      ? `<tr><td colspan="${String(head.length)}" class="empty">${escapeHtml(empty)}</td></tr>`
      : rows
          .map(
            (cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
          )
          .join('');
  return `<table>${header}${body}</table>`;
}

function paragraph(text: string): string {
  return `<p>${escapeHtml(text).replaceAll('\n', '<br>')}</p>`;
}

/** Cuerpo del informe de auditoría, para printPage. */
export function auditReportBody(report: AuditReportDocument): string {
  return [
    facts([
      ['Auditoría', report.code],
      ['Proceso auditado', report.process],
      ['Auditor', report.auditor],
      ['Programada', report.plannedOn],
      ['Ejecutada desde', report.startedOn],
      ['Informe emitido', report.reportedOn],
      ['Objetivo', report.objective],
      ['Criterios', report.criteria],
    ]),
    '<h2>Lista de chequeo</h2>',
    table(
      ['Requisito', 'Pregunta', 'Resultado', 'Evidencia'],
      report.checklist.map((line) => [line.requirement, line.question, line.result, line.evidence]),
      'No se diligenció lista de chequeo.',
    ),
    `<h2>Hallazgos (${String(report.findings.length)})</h2>`,
    table(
      ['Tipo', 'Requisito', 'Descripción', 'Evidencia', 'Seguimiento'],
      report.findings.map((line) => [
        line.type,
        line.requirement,
        line.description,
        line.evidence,
        line.followUp,
      ]),
      'La auditoría no registró hallazgos.',
    ),
    '<h2>Conclusiones</h2>',
    paragraph(report.conclusions),
  ].join('');
}

/** Cuerpo del acta de revisión por la dirección, para printPage. */
export function managementReviewBody(review: ManagementReviewDocument): string {
  const sections = review.sections.map((section) =>
    [
      `<h3>${escapeHtml(section.title)}</h3>`,
      section.lines.length === 0
        ? ''
        : `<ul>${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
      section.comment === '' ? '' : paragraph(section.comment),
    ].join(''),
  );
  return [
    facts([
      ['Acta', review.code],
      ['Periodo revisado', review.period],
      ['Reunión', review.meetingOn],
      ['Asistentes', review.attendees],
      ['Aprobó', `${review.approvedBy} · ${review.approvedOn}`],
    ]),
    '<h2>Entradas de la revisión</h2>',
    sections.join(''),
    '<h2>Conclusiones</h2>',
    paragraph(review.conclusions),
    '<h2>Decisiones y acciones</h2>',
    table(
      ['Decisión', 'Responsable', 'Fecha', 'Acción'],
      review.decisions.map((line) => [line.description, line.responsible, line.dueOn, line.action]),
      'La revisión no registró decisiones.',
    ),
  ].join('');
}
