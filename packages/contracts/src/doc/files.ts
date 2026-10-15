import { z } from 'zod';

// Contratos de los archivos (M03, B14; numeral 13.2): carga en dos pasos por enlace temporal,
// análisis con antivirus, huella SHA-256 y descarga por enlace de cinco minutos.

export const FILE_ERROR_CODES = {
  notFound: 'FILE_NOT_FOUND',
  typeNotAllowed: 'FILE_TYPE_NOT_ALLOWED',
  tooLarge: 'FILE_TOO_LARGE',
  sizeMismatch: 'FILE_SIZE_MISMATCH',
  linkInvalid: 'FILE_LINK_INVALID',
  notAvailable: 'FILE_NOT_AVAILABLE',
} as const;

/** Tamaño máximo de un archivo: 20 MB. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Lista blanca de tipos (numeral 15.4): tipo declarado y extensiones que lo acompañan. */
export const ALLOWED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
} as const satisfies Record<string, readonly string[]>;

export type AllowedFileType = keyof typeof ALLOWED_FILE_TYPES;

const allowedTypes = Object.keys(ALLOWED_FILE_TYPES) as [AllowedFileType, ...AllowedFileType[]];

export const allowedFileTypeSchema = z
  .enum(allowedTypes)
  .describe('PDF, PNG, JPEG, Word (.docx) o Excel (.xlsx)');

/** Tipos que la web puede mostrar en vista previa; los demás solo se descargan. */
export const PREVIEWABLE_FILE_TYPES: readonly AllowedFileType[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
];

/** La extensión del nombre corresponde al tipo declarado. */
export function extensionMatches(fileName: string, type: AllowedFileType): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_FILE_TYPES[type].some((extension) => lower.endsWith(extension));
}

export const fileStatusSchema = z
  .enum(['pending_upload', 'scanning', 'available', 'rejected'])
  .describe('Esperando el archivo, en análisis, disponible o rechazado');

export const fileRejectionSchema = z
  .enum(['virus', 'type_mismatch', 'size_mismatch'])
  .describe('Virus encontrado, el contenido no es del tipo declarado o el tamaño no coincide');

const dateTime = z.iso.datetime({ offset: true });

export const createUploadRequestSchema = z
  .strictObject({
    file_name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^/\\\p{Cc}]+$/u, 'El nombre no puede llevar barras ni caracteres de control')
      .describe('Nombre del archivo, con su extensión'),
    mime_type: allowedFileTypeSchema,
    size_bytes: z.number().int().positive().max(MAX_FILE_BYTES).describe('Tamaño en bytes'),
  })
  .refine((upload) => extensionMatches(upload.file_name, upload.mime_type), {
    path: ['file_name'],
    message: 'La extensión del nombre no corresponde al tipo de archivo',
  });

export const uploadLinkResponseSchema = z.object({
  id: z.uuid().describe('Identificador del archivo'),
  upload_url: z.url().describe('Enlace de subida (PUT, un solo uso)'),
  expires_at: dateTime,
});

export const fileSchema = z.object({
  id: z.uuid(),
  file_name: z.string(),
  mime_type: allowedFileTypeSchema,
  size_bytes: z.number().int().positive(),
  sha256: z.string().nullable().describe('Huella SHA-256 en hexadecimal, cuando ya se analizó'),
  status: fileStatusSchema,
  rejection: fileRejectionSchema.nullable(),
  created_at: dateTime,
});

export const fileListResponseSchema = z.object({
  data: z
    .array(fileSchema)
    .describe('Archivos que la persona puede ver, los más recientes primero'),
});

export const downloadLinkResponseSchema = z.object({
  url: z.url().describe('Enlace de descarga (GET), válido cinco minutos'),
  expires_at: dateTime,
});

export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;
export type UploadLinkResponse = z.infer<typeof uploadLinkResponseSchema>;
export type FileView = z.infer<typeof fileSchema>;
export type FileStatus = z.infer<typeof fileStatusSchema>;
export type FileRejection = z.infer<typeof fileRejectionSchema>;
export type DownloadLinkResponse = z.infer<typeof downloadLinkResponseSchema>;
