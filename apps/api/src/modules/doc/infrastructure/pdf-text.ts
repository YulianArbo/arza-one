import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Texto de un PDF para la búsqueda (B21, numeral 13.2), con pdfjs-dist (Mozilla, Apache-2.0). El
// PDF ya pasó el antivirus; igual se lee sin sus formularios XFA ni sus fuentes, que no hacen falta
// para el texto. Un PDF escaneado no trae texto: devuelve una cadena vacía.

/** Hasta dónde se lee: suficiente para cualquier documento del SGC. */
export const MAX_TEXT_CHARS = 300_000;
const MAX_PAGES = 500;

function cleaned(text: string): string {
  // PostgreSQL no guarda el carácter nulo en un texto.
  return text.replaceAll('\u0000', ' ').replace(/\s+/gu, ' ').trim();
}

export async function extractPdfText(content: Buffer): Promise<string> {
  const task = getDocument({
    data: new Uint8Array(content),
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  try {
    const document = await task.promise;
    let text = '';
    const pages = Math.min(document.numPages, MAX_PAGES);
    for (let number = 1; number <= pages && text.length < MAX_TEXT_CHARS; number += 1) {
      const page = await document.getPage(number);
      const items = (await page.getTextContent()).items;
      text += ` ${items.map((item) => ('str' in item ? item.str : ' ')).join(' ')}`;
      page.cleanup();
    }
    return cleaned(text).slice(0, MAX_TEXT_CHARS);
  } finally {
    await task.destroy();
  }
}
