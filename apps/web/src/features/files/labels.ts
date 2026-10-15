import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_BYTES,
  PREVIEWABLE_FILE_TYPES,
  createUploadRequestSchema,
  type AllowedFileType,
  type FileRejection,
  type FileStatus,
  type FileView,
} from '@arza/contracts';

// Textos de los archivos (B14, numeral 16.6: sin jerga, trato de usted).

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

export const STATUS_LABELS: Readonly<Record<FileStatus, string>> = {
  pending_upload: 'Esperando el archivo',
  scanning: 'En análisis',
  available: 'Disponible',
  rejected: 'Rechazado',
};

export const STATUS_TONES: Readonly<Record<FileStatus, Tone>> = {
  pending_upload: 'neutral',
  scanning: 'info',
  available: 'success',
  rejected: 'destructive',
};

export const REJECTION_LABELS: Readonly<Record<FileRejection, string>> = {
  virus: 'El antivirus encontró un virus',
  type_mismatch: 'El contenido no es del tipo que indica su nombre',
  size_mismatch: 'El tamaño no coincide con el declarado',
};

const TYPE_LABELS: Readonly<Record<AllowedFileType, string>> = {
  'application/pdf': 'PDF',
  'image/png': 'Imagen PNG',
  'image/jpeg': 'Imagen JPEG',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
};

export function typeLabel(type: AllowedFileType): string {
  return TYPE_LABELS[type];
}

/** Lo que acepta el selector de archivos: tipos y extensiones de la lista blanca. */
export const ACCEPT = Object.entries(ALLOWED_FILE_TYPES)
  .flatMap(([type, extensions]) => [type, ...extensions])
  .join(',');

export const ALLOWED_HINT = `PDF, PNG, JPEG, Word (.docx) o Excel (.xlsx), hasta ${String(MAX_FILE_BYTES / 1024 / 1024)} MB.`;

const SIZE = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** «512 KB», «2,5 MB». */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${SIZE.format(Math.max(bytes / 1024, 0.1))} KB`;
  return `${SIZE.format(bytes / 1024 / 1024)} MB`;
}

/** Por qué no se puede subir el archivo elegido; null si cumple la lista blanca y el tamaño. */
export function uploadProblem(file: File): string | null {
  const parsed = createUploadRequestSchema.safeParse({
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (parsed.success) return null;
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_FILE_BYTES) return `El archivo pesa más de ${formatSize(MAX_FILE_BYTES)}.`;
  return `Ese tipo de archivo no está permitido. Se aceptan ${ALLOWED_HINT}`;
}

export function canPreview(file: FileView): boolean {
  return file.status === 'available' && PREVIEWABLE_FILE_TYPES.includes(file.mime_type);
}

export function inProgress(file: FileView): boolean {
  return file.status === 'pending_upload' || file.status === 'scanning';
}
