// Conversión a PDF con Gotenberg (capítulo 9, numeral 13.2): Word y Excel pasan por su ruta de
// LibreOffice; desde B20, las páginas HTML por la de Chromium y el sello del pie por pdfcpu.
// Gotenberg vive dentro del servidor, sin acceso desde fuera; lo usa el worker.

interface GotenbergOptions {
  readonly url: string;
  readonly timeoutMs: number;
}

export interface SourceDocument {
  readonly fileName: string;
  readonly mimeType: string;
  readonly content: Buffer;
}

/** El archivo no se pudo convertir: está dañado o protegido. Reintentar no sirve de nada. */
export class ConversionRejectedError extends Error {
  constructor(status: number) {
    super(`Gotenberg rechazó el archivo (respuesta ${String(status)}).`);
    this.name = 'ConversionRejectedError';
  }
}

/**
 * Devuelve el PDF del archivo. Un error 4xx significa que el archivo no se puede convertir; los
 * demás errores (servicio caído, tiempo agotado) se lanzan tal cual para que BullMQ reintente.
 */
export async function convertWithGotenberg(
  options: GotenbergOptions,
  source: SourceDocument,
): Promise<Buffer> {
  const form = new FormData();
  const bytes = new Uint8Array(source.content);
  form.append('files', new Blob([bytes], { type: source.mimeType }), source.fileName);
  return send(options, 'forms/libreoffice/convert', form);
}

/** Página HTML con su encabezado y su pie, que Chromium repite en cada hoja (B20). */
export interface HtmlDocument {
  readonly index: string;
  readonly header: string;
  readonly footer: string;
  readonly landscape: boolean;
}

/** Márgenes en pulgadas: el encabezado institucional y el pie caben en ellos (hoja carta). */
const HTML_MARGINS = {
  marginTop: '1.5',
  marginBottom: '0.8',
  marginLeft: '0.6',
  marginRight: '0.6',
};

function htmlFile(content: string, name: string): [Blob, string] {
  return [new Blob([content], { type: 'text/html' }), name];
}

async function send(options: GotenbergOptions, route: string, form: FormData): Promise<Buffer> {
  const base = options.url.endsWith('/') ? options.url : `${options.url}/`;
  const response = await fetch(new URL(route, base), {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (response.status >= 400 && response.status < 500) {
    throw new ConversionRejectedError(response.status);
  }
  if (!response.ok) throw new Error(`Gotenberg respondió ${String(response.status)}.`);
  return Buffer.from(await response.arrayBuffer());
}

/** PDF de una página HTML por la ruta de Chromium, con el encabezado y el pie institucionales. */
export async function convertHtmlWithGotenberg(
  options: GotenbergOptions,
  document: HtmlDocument,
): Promise<Buffer> {
  const form = new FormData();
  form.append('files', ...htmlFile(document.index, 'index.html'));
  form.append('files', ...htmlFile(document.header, 'header.html'));
  form.append('files', ...htmlFile(document.footer, 'footer.html'));
  for (const [name, value] of Object.entries(HTML_MARGINS)) form.append(name, value);
  form.append('printBackground', 'true');
  if (document.landscape) form.append('landscape', 'true');
  return send(options, 'forms/chromium/convert/html', form);
}

/**
 * El mismo PDF con un texto al pie de cada hoja (B20): la copia de consulta de un documento vigente
 * con su código, versión, fecha y la leyenda de copia no controlada. Lo estampa pdfcpu.
 */
export async function stampWithGotenberg(
  options: GotenbergOptions,
  pdf: Buffer,
  text: string,
): Promise<Buffer> {
  const form = new FormData();
  form.append(
    'files',
    new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
    'documento.pdf',
  );
  form.append('stampSource', 'text');
  form.append('stampExpression', text);
  form.append(
    'stampOptions',
    JSON.stringify({
      pos: 'bc',
      points: '7',
      rot: '0',
      scale: '1 abs',
      offset: '0 12',
      fillcolor: '#0d1b2a',
    }),
  );
  return send(options, 'forms/pdfengines/stamp', form);
}
