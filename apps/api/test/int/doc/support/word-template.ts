import PizZip from 'pizzip';

import type { SampleFile } from './file-scenario.js';

// Un Word mínimo pero válido para las plantillas de salida (B20): el texto dado en un párrafo, con
// las partes que el análisis reconoce (cabecera ZIP y word/document.xml) y que docxtemplater lee.

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

const RELATIONSHIPS =
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

export function wordTemplate(text: string, name = 'Plantilla.docx'): SampleFile {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELATIONSHIPS);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return { name, type: WORD, content: zip.generate({ type: 'nodebuffer' }) };
}

/** El texto del Word generado, para revisar lo que quedó lleno. */
export function wordText(content: Buffer): string {
  return new PizZip(content).file('word/document.xml')?.asText() ?? '';
}
