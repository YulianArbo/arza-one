import type { AllowedFileType, FileRejection } from '@arza/contracts';

// Reglas de los archivos (B14, numerales 13.2 y 15.4): el tipo se reconoce por el contenido real,
// no por el nombre ni por lo que dice el navegador.

/** Vigencia del enlace de subida: un solo uso dentro de este tiempo. */
export const UPLOAD_LINK_TTL_MS = 15 * 60 * 1000;
/** Vigencia del enlace de descarga: cinco minutos (numeral 13.2). */
export const DOWNLOAD_LINK_TTL_MS = 5 * 60 * 1000;

const PDF = Buffer.from('%PDF-');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Word y Excel son archivos ZIP; los distingue la parte principal que nombra su índice. */
function officeType(content: Buffer): AllowedFileType | null {
  if (content.includes('word/document.xml')) return DOCX;
  if (content.includes('xl/workbook.xml')) return XLSX;
  return null;
}

/** Tipo de la lista blanca que corresponde al contenido; null si no es ninguno. */
export function detectFileType(content: Buffer): AllowedFileType | null {
  if (content.subarray(0, PDF.length).equals(PDF)) return 'application/pdf';
  if (content.subarray(0, PNG.length).equals(PNG)) return 'image/png';
  if (content.subarray(0, JPEG.length).equals(JPEG)) return 'image/jpeg';
  if (content.subarray(0, ZIP.length).equals(ZIP)) return officeType(content);
  return null;
}

export interface DeclaredFile {
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/**
 * Motivo para rechazar el contenido antes del antivirus; null si cumple lo declarado. Un
 * ejecutable renombrado como PDF no pasa.
 */
export function contentProblem(declared: DeclaredFile, content: Buffer): FileRejection | null {
  if (content.length !== declared.sizeBytes) return 'size_mismatch';
  if (detectFileType(content) !== declared.mimeType) return 'type_mismatch';
  return null;
}

/** El enlace sigue vigente en este momento. */
export function linkIsValid(expiresAt: Date, now: Date): boolean {
  return now.getTime() < expiresAt.getTime();
}
