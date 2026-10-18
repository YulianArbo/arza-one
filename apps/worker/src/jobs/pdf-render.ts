import { renderPendingPdfs, type PdfRenderDependencies, type PdfRenderResult } from '@arza/api/doc';

export type PdfRenderJobDependencies = PdfRenderDependencies;

/**
 * PDF de los formatos digitales (B20, numeral 13.2), en el módulo de gestión documental: el de cada
 * registro diligenciado que terminó, con el encabezado y el pie institucionales, y la copia de
 * consulta de cada versión vigente. Repetirlo no cambia nada; si Gotenberg o el almacenamiento no
 * responden, lo pendiente queda para la siguiente pasada.
 */
export async function processPdfRender(deps: PdfRenderJobDependencies): Promise<PdfRenderResult> {
  return renderPendingPdfs(deps);
}
