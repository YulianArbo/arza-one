import { escapeHtml } from './notice-email.js';

// Cuerpo de los contratos y otrosíes (B24, ficha 17.7): el texto cláusula por cláusula, tal como se
// aprobó, y el espacio de las firmas. El encabezado y el pie institucionales los pone Gotenberg
// (institutional.ts). Todo lo que escribió una persona va escapado.

export interface ContractDocumentClause {
  /** PRIMERA, SEGUNDA…; null en el encabezado de las partes. */
  readonly ordinal: string | null;
  readonly title: string;
  readonly body: string;
}

export interface ContractSignature {
  /** EL CONTRATANTE, EL CONTRATISTA… */
  readonly role: string;
  readonly name: string;
  readonly detail: string;
}

export interface ContractDocument {
  /** «CONTRATO DE PRESTACIÓN DE SERVICIOS…», en mayúsculas. */
  readonly heading: string;
  readonly code: string;
  readonly clauses: readonly ContractDocumentClause[];
  /** «Para constancia, se firma el 01/11/2026.», o el texto de la fecha de firma. */
  readonly closing: string;
  readonly signatures: readonly ContractSignature[];
}

function paragraphs(value: string): string {
  return value
    .split(/\n+/u)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

function clause(item: ContractDocumentClause): string {
  if (item.ordinal === null) return paragraphs(item.body);
  const title = `${item.ordinal}. ${item.title.toUpperCase()}.`;
  return `<div class="clause"><p><strong>${escapeHtml(title)}</strong></p>${paragraphs(item.body)}</div>`;
}

function signatures(items: readonly ContractSignature[]): string {
  const cells = items.map(
    (item) =>
      `<td><div class="line"></div><p><strong>${escapeHtml(item.role)}</strong><br>${escapeHtml(item.name)}<br>${escapeHtml(item.detail)}</p></td>`,
  );
  return `<table class="signatures"><tr>${cells.join('')}</tr></table>`;
}

const STYLES = [
  'h1.contract{font-size:13px;text-align:center;margin:0 0 4px}',
  'p.code{text-align:center;margin:0 0 14px}',
  'div.clause{margin-top:8px}',
  'p{text-align:justify}',
  'table.signatures{margin-top:48px;border:none}',
  'table.signatures td{border:none;width:50%;vertical-align:top;padding:0 16px}',
  'div.line{border-top:1px solid #0d1b2a;margin-top:56px}',
].join('');

/** Cuerpo del contrato o del otrosí, para printPage. */
export function contractDocumentBody(document: ContractDocument): string {
  return [
    `<style>${STYLES}</style>`,
    `<h1 class="contract">${escapeHtml(document.heading)}</h1>`,
    `<p class="code">${escapeHtml(document.code)}</p>`,
    ...document.clauses.map(clause),
    `<p>${escapeHtml(document.closing)}</p>`,
    signatures(document.signatures),
  ].join('');
}
