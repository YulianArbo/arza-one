import { ARZA_LOGO_DATA_URI } from './logo.js';
import { escapeHtml } from './notice-email.js';

// Marco institucional de los documentos generados (B20, ficha 17.4): el encabezado del SGC (logo,
// nombre del formato, código, versión, fecha y página) y el pie (razón social, NIT, código del
// registro y la leyenda de copia no controlada). Gotenberg repite los dos en cada página; los
// números de página los pone Chromium en las clases pageNumber y totalPages.

/** Lo que identifica el documento en el encabezado. */
export interface DocumentIdentity {
  readonly code: string;
  readonly name: string;
  /** Versión del formato como se imprime: 01, 02… */
  readonly version: string;
  /** Fecha de la versión, dd/mm/aaaa. */
  readonly date: string;
}

/** La empresa que emite el documento. */
export interface CompanyIdentity {
  readonly legalName: string;
  readonly taxId: string;
}

export const UNCONTROLLED_COPY = 'Copia no controlada cuando se imprime';

const NAVY = '#0d1b2a';
const BORDER = '1px solid #0d1b2a';

/** Chromium dibuja el encabezado y el pie sin los estilos de la página: todo va en línea. */
function frame(content: string): string {
  return [
    '<!doctype html><html lang="es-CO"><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;-webkit-print-color-adjust:exact}</style></head>',
    `<body style="width:100%;font-family:Arial,Helvetica,sans-serif;color:${NAVY}">`,
    content,
    '</body></html>',
  ].join('');
}

function cell(content: string, style: string): string {
  return `<td style="border:${BORDER};padding:3px 6px;${style}">${content}</td>`;
}

/** Encabezado del SGC: logo, nombre, y la columna de código, versión, fecha y página. */
export function institutionalHeader(document: DocumentIdentity, company: CompanyIdentity): string {
  const logo = `<img src="${ARZA_LOGO_DATA_URI}" alt="${escapeHtml(company.legalName)}" style="height:38px">`;
  const data = [
    `Código: ${escapeHtml(document.code)}`,
    `Versión: ${escapeHtml(document.version)}`,
    `Fecha: ${escapeHtml(document.date)}`,
    'Página: <span class="pageNumber"></span> de <span class="totalPages"></span>',
  ].join('<br>');
  const row = [
    cell(logo, 'width:22%;text-align:center'),
    cell(
      `<div style="font-size:7px">SISTEMA DE GESTIÓN DE CALIDAD</div><div style="font-size:11px;font-weight:700">${escapeHtml(document.name)}</div>`,
      'text-align:center',
    ),
    cell(data, 'width:26%;font-size:8px;line-height:1.35'),
  ].join('');
  return frame(
    `<table style="width:calc(100% - 2.4cm);margin:0 1.2cm;border-collapse:collapse;font-size:9px"><tr>${row}</tr></table>`,
  );
}

/** Pie: la empresa, el registro y la leyenda de copia no controlada. */
export function institutionalFooter(company: CompanyIdentity, reference: string | null): string {
  const parts = [`${escapeHtml(company.legalName)} · NIT ${escapeHtml(company.taxId)}`];
  if (reference !== null) parts.push(escapeHtml(reference));
  return frame(
    [
      '<div style="margin:0 1.2cm;font-size:7px;text-align:center;line-height:1.4">',
      `<div>${parts.join(' · ')}</div>`,
      `<div style="font-weight:700">${UNCONTROLLED_COPY}</div>`,
      '</div>',
    ].join(''),
  );
}

/** Lo que va en el pie de la copia de consulta de un documento vigente. */
export function controlledCopyStamp(document: Omit<DocumentIdentity, 'name'>): string {
  return `${document.code} · Versión ${document.version} · Vigente desde ${document.date} · ${UNCONTROLLED_COPY}`;
}

function bodyOf(html: string): string {
  return /<body[^>]*>([\s\S]*)<\/body>/iu.exec(html)?.[1] ?? html;
}

/**
 * Vista previa en pantalla: el encabezado, la página y el pie uno debajo del otro, como se verá la
 * primera hoja del PDF. Los números de página quedan en 1.
 */
export function framedPreview(parts: {
  readonly header: string;
  readonly page: string;
  readonly footer: string;
}): string {
  const header = bodyOf(parts.header)
    .replace('<span class="pageNumber"></span>', '1')
    .replace('<span class="totalPages"></span>', '1');
  const frameStyle = 'margin:0 auto 12px;max-width:21.6cm';
  const footer = bodyOf(parts.footer);
  // Con funciones de reemplazo: un «$» en lo que escribió una persona no es un patrón.
  return parts.page
    .replace(/<body([^>]*)>/iu, (_tag, attributes: string) => {
      return `<body${attributes}><div style="${frameStyle}">${header}</div><div style="padding:0 1.2cm">`;
    })
    .replace(/<\/body>/iu, () => `</div><div style="margin-top:16px">${footer}</div></body>`);
}
