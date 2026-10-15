import { describe, expect, it } from 'vitest';

import { DOWNLOAD_LINK_TTL_MS, contentProblem, detectFileType, linkIsValid } from './file-rules.js';

const PDF = Buffer.from('%PDF-1.7\n%prueba\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const zip = (entry: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from(entry)]);
const EXE = Buffer.from('MZ\x90\x00 programa de Windows');

describe('tipo real por el contenido (numeral 15.4)', () => {
  it('reconoce cada tipo de la lista blanca', () => {
    expect(detectFileType(PDF)).toBe('application/pdf');
    expect(detectFileType(PNG)).toBe('image/png');
    expect(detectFileType(JPEG)).toBe('image/jpeg');
    expect(detectFileType(zip('word/document.xml'))).toContain('wordprocessingml');
    expect(detectFileType(zip('xl/workbook.xml'))).toContain('spreadsheetml');
  });

  it('no reconoce un ejecutable ni un ZIP cualquiera', () => {
    expect(detectFileType(EXE)).toBeNull();
    expect(detectFileType(zip('otro/archivo.txt'))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});

describe('contenido frente a lo declarado', () => {
  it('acepta el contenido que coincide en tipo y tamaño', () => {
    expect(contentProblem({ mimeType: 'application/pdf', sizeBytes: PDF.length }, PDF)).toBeNull();
  });

  it('rechaza un ejecutable renombrado como PDF', () => {
    expect(contentProblem({ mimeType: 'application/pdf', sizeBytes: EXE.length }, EXE)).toBe(
      'type_mismatch',
    );
  });

  it('rechaza un tamaño distinto del declarado', () => {
    expect(contentProblem({ mimeType: 'application/pdf', sizeBytes: 1 }, PDF)).toBe(
      'size_mismatch',
    );
  });
});

describe('vigencia de los enlaces', () => {
  it('el enlace de descarga sirve a los cuatro minutos y no a los cinco', () => {
    const issued = new Date('2026-10-15T15:00:00Z');
    const expiresAt = new Date(issued.getTime() + DOWNLOAD_LINK_TTL_MS);
    expect(linkIsValid(expiresAt, new Date(issued.getTime() + 4 * 60_000))).toBe(true);
    expect(linkIsValid(expiresAt, new Date(issued.getTime() + 5 * 60_000))).toBe(false);
  });
});
