import { executeApprovedDispositions, type DispositionExecutionDependencies } from '@arza/api/doc';

export type DispositionExecuteJobDependencies = DispositionExecutionDependencies;

/**
 * Ejecución de las propuestas de disposición aprobadas (B21), en el módulo de gestión documental:
 * marca los documentos como eliminados, borra sus archivos del almacenamiento y genera el acta en
 * PDF. Repetirlo no cambia nada. Devuelve cuántas propuestas terminó.
 */
export async function processDispositionExecute(
  deps: DispositionExecuteJobDependencies,
): Promise<number> {
  return executeApprovedDispositions(deps);
}
