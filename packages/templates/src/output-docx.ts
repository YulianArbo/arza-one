import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { TemplateSyntaxError } from './output-html.js';

// Plantillas de salida en Word (B20, numeral 13.2): docxtemplater llena las variables {nombre}
// del documento, con sus bloques {#lista}…{/lista}. El encabezado y el pie son los del propio Word,
// como en el formato original; Gotenberg lo convierte a PDF.

/** Valor de una ruta con puntos (registro.codigo), solo con propiedades propias del contexto. */
function valueAt(scope: unknown, path: string): unknown {
  if (path === '.') return scope;
  let value: unknown = scope;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function parser(tag: string): { get: (scope: unknown) => unknown } {
  const path = tag.trim();
  return { get: (scope) => valueAt(scope, path) };
}

interface WordTemplate {
  readonly zip: PizZip;
  readonly document: Docxtemplater;
}

function documentOf(content: Buffer): WordTemplate {
  try {
    const zip = new PizZip(content);
    const document = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
      parser,
    });
    return { zip, document };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TemplateSyntaxError(detail);
  }
}

/** Variables de primer nivel del Word, en orden alfabético. Revisa que el Word sea válido. */
export function docxTemplateVariables(content: Buffer): string[] {
  const text = documentOf(content).document.getFullText();
  const found = new Set<string>();
  let depth = 0;
  // Dentro de un bloque {#lista}…{/lista} las variables son de cada fila, no de primer nivel.
  for (const [, mark = '', name = ''] of text.matchAll(/\{([#/^]?)\s*([A-Za-z_]\w*)/gu)) {
    if (mark === '/') depth -= 1;
    else if (depth === 0) found.add(name);
    if (mark === '#' || mark === '^') depth += 1;
  }
  return [...found].sort();
}

/** El Word con las variables llenas. */
export function fillDocxTemplate(
  content: Buffer,
  context: Readonly<Record<string, unknown>>,
): Buffer {
  const { zip, document } = documentOf(content);
  try {
    document.render(context);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TemplateSyntaxError(detail);
  }
  // docxtemplater escribe el resultado en el mismo archivo comprimido.
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
