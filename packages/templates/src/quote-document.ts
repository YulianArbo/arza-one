import { escapeHtml } from './notice-email.js';

// Cuerpo de la Propuesta Comercial FT-COM-001 (B23): la cotización que recibe el cliente. El formato
// original no está en el repositorio: este contenido lo propuso el equipo y lo aprobó el dueño del
// producto. El encabezado y el pie institucionales los pone Gotenberg (institutional.ts). Todo lo
// que escribió una persona va escapado.

export interface QuoteDocumentLine {
  readonly position: number;
  readonly description: string;
  readonly unit: string;
  /** Cantidad con punto decimal, como «1.50». */
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discountPercent: string;
  readonly taxRate: string;
  readonly lineTotal: string;
}

export interface QuoteDocumentTax {
  readonly taxRate: string;
  readonly base: string;
  readonly tax: string;
}

export interface QuoteDocument {
  readonly code: string;
  readonly versionNumber: number;
  /** Fechas ya impresas, dd/mm/aaaa. */
  readonly issuedOn: string;
  readonly validUntil: string;
  readonly company: { readonly legalName: string; readonly taxId: string };
  readonly client: string;
  readonly opportunity: string;
  readonly preparedBy: string;
  readonly lines: readonly QuoteDocumentLine[];
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxes: readonly QuoteDocumentTax[];
  readonly total: string;
  readonly paymentTerms: string;
  readonly deliveryTerms: string;
  readonly warranty: string | null;
  readonly notes: string | null;
}

/** Pesos como se leen en Colombia: «$ 1.190.000,50». Sin coma flotante: trabaja sobre el texto. */
export function pesos(amount: string): string {
  const negative = amount.startsWith('-');
  const [whole = '0', cents = ''] = amount.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}$ ${grouped},${cents.padEnd(2, '0').slice(0, 2)}`;
}

/** Porcentaje sin ceros de sobra: «19 %», «7,5 %». */
export function percentText(value: string): string {
  const trimmed = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  return `${trimmed.replace('.', ',')} %`;
}

/** Cantidad sin ceros de sobra: «1,5», «10». */
function quantityText(value: string): string {
  return percentText(value).replace(' %', '');
}

function text(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function facts(quote: QuoteDocument): string {
  const lines = [
    ['Cotización', `${quote.code} · versión ${String(quote.versionNumber)}`],
    ['Fecha', quote.issuedOn],
    ['Válida hasta', `${quote.validUntil} (inclusive)`],
    ['Cliente', quote.client],
    ['Asunto', quote.opportunity],
    ['Elaboró', quote.preparedBy],
  ];
  const rows = lines.map(
    ([label = '', value = '']) =>
      `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
  );
  return `<table>${rows.join('')}</table>`;
}

function items(quote: QuoteDocument): string {
  const head = ['#', 'Descripción', 'Unidad', 'Cantidad', 'Valor unitario', 'Desc.', 'IVA', 'Total']
    .map((title) => `<th>${escapeHtml(title)}</th>`)
    .join('');
  const rows = quote.lines.map((line) =>
    [
      String(line.position),
      text(line.description),
      escapeHtml(line.unit),
      quantityText(line.quantity),
      pesos(line.unitPrice),
      percentText(line.discountPercent),
      percentText(line.taxRate),
      pesos(line.lineTotal),
    ]
      .map((cell, index) => `<td${index >= 3 ? ' class="number"' : ''}>${cell}</td>`)
      .join(''),
  );
  return `<table><tr>${head}</tr>${rows.map((row) => `<tr>${row}</tr>`).join('')}</table>`;
}

function totals(quote: QuoteDocument): string {
  const lines: [string, string][] = [
    ['Subtotal', pesos(quote.subtotal)],
    ['Descuentos', pesos(`-${quote.discountTotal}`)],
    ...quote.taxes.map((tax): [string, string] => [
      `IVA ${percentText(tax.taxRate)} sobre ${pesos(tax.base)}`,
      pesos(tax.tax),
    ]),
    ['Total', pesos(quote.total)],
  ];
  const rows = lines.map(
    ([label, value], index) =>
      `<tr${index === lines.length - 1 ? ' class="total"' : ''}><td class="label">${escapeHtml(label)}</td><td class="number">${value}</td></tr>`,
  );
  return `<table class="totals">${rows.join('')}</table>`;
}

function conditions(quote: QuoteDocument): string {
  const lines = [
    ['Forma de pago', quote.paymentTerms],
    ['Plazo de entrega', quote.deliveryTerms],
    ...(quote.warranty === null ? [] : [['Garantía', quote.warranty]]),
  ];
  const rows = lines.map(
    ([label = '', value = '']) =>
      `<tr><td class="label">${escapeHtml(label)}</td><td>${text(value)}</td></tr>`,
  );
  return `<table>${rows.join('')}</table>`;
}

const ACCEPTANCE = [
  'Los valores están en pesos colombianos. Los impuestos se calcularon con las tarifas vigentes ',
  'a la fecha de la cotización. Usted puede aceptar o rechazar esta cotización en línea, desde el ',
  'enlace que recibió por correo electrónico, hasta el último día de su vigencia. Al aceptarla ',
  'quedan registrados la fecha y la hora, la dirección IP, la versión aceptada y la huella digital ',
  'de este documento. Una cotización vencida no puede aceptarse.',
].join('');

/** Cuerpo de la propuesta, para printPage. */
export function quoteDocumentBody(quote: QuoteDocument): string {
  return [
    `<style>td.number,th.number{text-align:right;white-space:nowrap}table.totals{width:55%;margin-left:auto}tr.total td{font-weight:700}</style>`,
    facts(quote),
    '<h2>Servicios cotizados</h2>',
    items(quote),
    totals(quote),
    '<h2>Condiciones</h2>',
    conditions(quote),
    ...(quote.notes === null ? [] : ['<h2>Notas</h2>', `<p>${text(quote.notes)}</p>`]),
    `<p>${escapeHtml(ACCEPTANCE)}</p>`,
    `<p>${escapeHtml(quote.company.legalName)} · NIT ${escapeHtml(quote.company.taxId)}</p>`,
  ].join('');
}
