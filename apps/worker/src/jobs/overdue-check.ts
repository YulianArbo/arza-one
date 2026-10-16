import { escalateOverdueTasks, type OverdueCheckDependencies } from '@arza/api/wf';

export type OverdueCheckJobDependencies = OverdueCheckDependencies;

/**
 * Escalamiento de las tareas vencidas (B15, ficha 17.5): cada tarea vencida queda «vencida» y
 * escala al jefe inmediato de su responsable, en el módulo de flujos. Es idempotente: una tarea ya
 * escalada no se vuelve a escalar. Devuelve cuántas escaló.
 */
export async function processOverdueCheck(deps: OverdueCheckJobDependencies): Promise<number> {
  return escalateOverdueTasks(deps);
}
