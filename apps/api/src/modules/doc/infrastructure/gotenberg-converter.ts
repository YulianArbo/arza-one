// Conversión a PDF con Gotenberg (capítulo 9, numeral 13.2): Word y Excel pasan por su ruta de
// LibreOffice. Gotenberg vive dentro del servidor, sin acceso desde fuera; lo usa el worker.

export interface GotenbergOptions {
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
  const base = options.url.endsWith('/') ? options.url : `${options.url}/`;
  const response = await fetch(new URL('forms/libreoffice/convert', base), {
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
