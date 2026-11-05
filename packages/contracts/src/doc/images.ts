import { z } from 'zod';

import { createUploadRequestSchema } from './files.js';

// Imágenes de perfil y de empresa (B22A): la foto de cada persona y el logo de un tercero. Pasan
// por el mismo antivirus que los demás archivos; solo PNG o JPG y más livianas.

export const IMAGE_ERROR_CODES = {
  invalid: 'IMAGE_INVALID',
  notFound: 'IMAGE_NOT_FOUND',
  notAllowed: 'IMAGE_NOT_ALLOWED',
  scanning: 'IMAGE_SCANNING',
} as const;

/** Tamaño máximo de una foto o un logo: 2 MB. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg'];

export const imageUploadRequestSchema = createUploadRequestSchema
  .refine((upload) => IMAGE_TYPES.includes(upload.mime_type), {
    path: ['mime_type'],
    message: 'Use una imagen PNG o JPG.',
  })
  .refine((upload) => upload.size_bytes <= MAX_IMAGE_BYTES, {
    path: ['size_bytes'],
    message: 'La imagen debe pesar hasta 2 MB.',
  });

export const setImageRequestSchema = z.strictObject({
  file_id: z.uuid().describe('Imagen propia ya subida y revisada por el antivirus'),
});

export type ImageUploadRequest = z.infer<typeof imageUploadRequestSchema>;
export type SetImageRequest = z.infer<typeof setImageRequestSchema>;
