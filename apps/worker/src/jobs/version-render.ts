import { JOBS, type VersionRenderJob } from '@arza/api/platform';
import {
  renderVersionPdf,
  type VersionRenderDependencies,
  type VersionRenderResult,
} from '@arza/api/doc';
import { UnrecoverableError } from 'bullmq';

export type VersionRenderJobDependencies = VersionRenderDependencies;

/** Datos del trabajo validados. Si no cumplen el esquema, reintentar no sirve de nada. */
function parseVersionRenderJob(data: unknown): VersionRenderJob {
  const parsed = JOBS.versionRender.schema.safeParse(data);
  if (!parsed.success) {
    throw new UnrecoverableError('Los datos del trabajo no son válidos; no se reintenta.');
  }
  return parsed.data;
}

/**
 * Conversión a PDF del archivo fuente de una versión (B18), en el módulo de gestión documental.
 * Si Gotenberg o el almacenamiento no responden, BullMQ reintenta; la versión sigue «convirtiendo».
 */
export async function processVersionRender(
  data: unknown,
  deps: VersionRenderJobDependencies,
): Promise<VersionRenderResult> {
  return renderVersionPdf(parseVersionRenderJob(data), deps);
}
