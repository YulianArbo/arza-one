import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Texto de un PDF, página por página (B20): para comprobar que el PDF generado trae de verdad el
// encabezado y el pie institucionales. pdfjs-dist (Mozilla, Apache-2.0) solo se usa en pruebas.

export async function pdfPages(content: Buffer): Promise<string[]> {
  const document = await getDocument({ data: new Uint8Array(content), useSystemFonts: true })
    .promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const text = await page.getTextContent();
    pages.push(
      text.items
        .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? ' ' : ''}` : ' '))
        .join('')
        .replace(/\s+/gu, ' '),
    );
  }
  await document.cleanup();
  return pages;
}
