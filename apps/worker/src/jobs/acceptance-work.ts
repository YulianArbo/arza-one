import {
  followAcceptances,
  type AcceptanceWorkDependencies,
  type AcceptanceWorkResult,
} from '@arza/api/project';

export type AcceptanceWorkJobDependencies = AcceptanceWorkDependencies;

/**
 * Actas de entrega (B27), en el módulo de Proyectos: envía a firma las que ya tienen su PDF y deja
 * aceptados o devueltos los entregables que el cliente respondió. Repetirlo no cambia nada.
 */
export async function processAcceptanceWork(
  deps: AcceptanceWorkJobDependencies,
): Promise<AcceptanceWorkResult> {
  return followAcceptances(deps);
}
