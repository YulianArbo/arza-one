import { JOBS, type FileScanJob } from '@arza/api/platform';
import { scanUploadedFile, type FileScanDependencies, type FileScanResult } from '@arza/api/doc';
import { UnrecoverableError } from 'bullmq';

export type FileScanJobDependencies = FileScanDependencies;

/** Datos del trabajo validados. Si no cumplen el esquema, reintentar no sirve de nada. */
function parseFileScanJob(data: unknown): FileScanJob {
  const parsed = JOBS.fileScan.schema.safeParse(data);
  if (!parsed.success) {
    throw new UnrecoverableError('Los datos del trabajo no son válidos; no se reintenta.');
  }
  return parsed.data;
}

/**
 * Análisis de un archivo recién subido (B14): tipo real, antivirus y huella, en el módulo de
 * gestión documental. Si el antivirus o el almacenamiento no responden, BullMQ reintenta; el
 * archivo sigue «en análisis» y no se puede descargar.
 */
export async function processFileScan(
  data: unknown,
  deps: FileScanJobDependencies,
): Promise<FileScanResult> {
  return scanUploadedFile(parseFileScanJob(data), deps);
}
