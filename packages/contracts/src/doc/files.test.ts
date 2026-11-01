import { describe, expect, it } from 'vitest';

import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  createUploadRequestSchema,
  extensionMatches,
  imageUploadRequestSchema,
} from '../index.js';

const PDF = { file_name: 'Informe de visita.pdf', mime_type: 'application/pdf', size_bytes: 2048 };

describe('solicitud de carga (lista blanca, numeral 15.4)', () => {
  it('acepta un tipo permitido con su extensión', () => {
    expect(createUploadRequestSchema.safeParse(PDF).success).toBe(true);
    expect(extensionMatches('FOTO.JPEG', 'image/jpeg')).toBe(true);
  });

  it('rechaza un tipo fuera de la lista blanca', () => {
    const exe = { ...PDF, file_name: 'programa.exe', mime_type: 'application/x-msdownload' };
    expect(createUploadRequestSchema.safeParse(exe).success).toBe(false);
  });

  it('rechaza una extensión que no corresponde al tipo', () => {
    expect(createUploadRequestSchema.safeParse({ ...PDF, file_name: 'informe.exe' }).success).toBe(
      false,
    );
  });

  it('rechaza un archivo de más de 20 MB o vacío', () => {
    expect(
      createUploadRequestSchema.safeParse({ ...PDF, size_bytes: MAX_FILE_BYTES + 1 }).success,
    ).toBe(false);
    expect(createUploadRequestSchema.safeParse({ ...PDF, size_bytes: 0 }).success).toBe(false);
  });

  it('rechaza nombres con rutas o caracteres de control', () => {
    for (const name of ['../secreto.pdf', 'carpeta\\a.pdf', 'a\u0000.pdf']) {
      expect(createUploadRequestSchema.safeParse({ ...PDF, file_name: name }).success).toBe(false);
    }
  });
});

describe('foto y logo (B22A)', () => {
  const photo = { file_name: 'Foto.png', mime_type: 'image/png', size_bytes: 1024 };

  it('acepta PNG o JPG de hasta 2 MB', () => {
    expect(imageUploadRequestSchema.safeParse(photo).success).toBe(true);
    const jpg = { file_name: 'Logo.jpg', mime_type: 'image/jpeg', size_bytes: MAX_IMAGE_BYTES };
    expect(imageUploadRequestSchema.safeParse(jpg).success).toBe(true);
  });

  it('rechaza otros tipos y las imágenes más pesadas', () => {
    expect(imageUploadRequestSchema.safeParse(PDF).success).toBe(false);
    const heavy = { ...photo, size_bytes: MAX_IMAGE_BYTES + 1 };
    expect(imageUploadRequestSchema.safeParse(heavy).success).toBe(false);
  });
});
