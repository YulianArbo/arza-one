import type { FormDefinition, FormField, FormData } from '@arza/contracts';

import { printedValue, type ChecklistLine, type PrintedRow } from './form-values.js';
import { escapeHtml } from './notice-email.js';

// Maqueta institucional de un formato diligenciado (B20): cada sección con sus campos, las listas
// de verificación y las tablas, en el cuerpo de la página. El encabezado y el pie los pone
// Gotenberg (institutional.ts). Todo lo que escribió una persona va escapado.

const NAVY = '#0d1b2a';
const BORDER = '1px solid #9aa4b2';

/** Lo que se imprime debajo del encabezado: el registro, quién lo diligenció y quién lo aprobó. */
export interface RecordFacts {
  readonly code: string;
  readonly status: string;
  readonly createdBy: string;
  readonly createdOn: string;
  readonly approvedBy: string | null;
  readonly approvedOn: string | null;
}

const STYLES = `
body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: ${NAVY}; margin: 0; }
h2 { font-size: 11px; background: ${NAVY}; color: #ffffff; margin: 12px 0 0; padding: 4px 6px; }
table { width: 100%; border-collapse: collapse; }
td, th { border: ${BORDER}; padding: 4px 6px; vertical-align: top; text-align: left; }
th { background: #eef1f5; font-weight: 700; }
.label { width: 34%; font-weight: 700; background: #f6f8fa; }
.facts td { border: none; padding: 2px 0; }
.empty { color: #5b6573; }
`;

/** Página completa con los estilos de impresión; el tamaño y los márgenes los fija Gotenberg. */
export function printPage(title: string, body: string): string {
  return [
    '<!doctype html><html lang="es-CO"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${STYLES}</style></head>`,
    `<body>${body}</body></html>`,
  ].join('');
}

function text(value: string): string {
  if (value === '') return '<span class="empty">—</span>';
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function checklist(lines: readonly ChecklistLine[]): string {
  const rows = lines.map(
    (line) =>
      `<tr><td>${escapeHtml(line.punto)}</td><td>${text(line.resultado)}</td><td>${text(line.observacion)}</td></tr>`,
  );
  return `<table><tr><th>Punto</th><th style="width:16%">Resultado</th><th style="width:30%">Observación</th></tr>${rows.join('')}</table>`;
}

function table(field: FormField, rows: readonly PrintedRow[]): string {
  const head = field.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body =
    rows.length === 0
      ? `<tr><td colspan="${String(field.columns.length)}" class="empty">Sin filas</td></tr>`
      : rows
          .map(
            (row) =>
              `<tr>${field.columns.map((c) => `<td>${text(row[c.key] ?? '')}</td>`).join('')}</tr>`,
          )
          .join('');
  return `<table><tr>${head}</tr>${body}</table>`;
}

function fieldHtml(field: FormField, data: FormData): string {
  const value = printedValue(field, data[field.key]);
  const label = escapeHtml(field.label);
  if (field.type === 'checklist' || field.type === 'table') {
    const inner =
      field.type === 'checklist'
        ? checklist(value as readonly ChecklistLine[])
        : table(field, value as readonly PrintedRow[]);
    return `<tr><td colspan="2"><div style="font-weight:700;margin-bottom:4px">${label}</div>${inner}</td></tr>`;
  }
  return `<tr><td class="label">${label}</td><td>${text(value as string)}</td></tr>`;
}

function factsHtml(facts: RecordFacts): string {
  const approved =
    facts.approvedBy === null
      ? ''
      : `<td>Aprobó: ${escapeHtml(facts.approvedBy)} · ${escapeHtml(facts.approvedOn ?? '')}</td>`;
  return [
    '<table class="facts"><tr>',
    `<td><strong>Registro ${escapeHtml(facts.code)}</strong> · ${escapeHtml(facts.status)}</td>`,
    `<td>Diligenció: ${escapeHtml(facts.createdBy)} · ${escapeHtml(facts.createdOn)}</td>`,
    approved,
    '</tr></table>',
  ].join('');
}

/** Cuerpo del formato diligenciado, con sus secciones en orden. */
export function formDocumentBody(
  definition: FormDefinition,
  data: FormData,
  facts: RecordFacts,
): string {
  const sections = definition.sections.map(
    (section) =>
      `<h2>${escapeHtml(section.title)}</h2><table>${section.fields.map((f) => fieldHtml(f, data)).join('')}</table>`,
  );
  return `${factsHtml(facts)}${sections.join('')}`;
}
