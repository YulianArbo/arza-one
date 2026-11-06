import {
  followTicketClocks,
  type SlaWorkDependencies,
  type SlaWorkResult,
} from '@arza/api/service';

export type SlaWorkJobDependencies = SlaWorkDependencies;

/**
 * Reloj de los tiquetes de la mesa de ayuda (B28): alerta al 80 % del plazo, marca los vencidos y
 * cierra los resueltos que nadie reabrió. Repetirlo no cambia nada.
 */
export async function processSlaWork(deps: SlaWorkJobDependencies): Promise<SlaWorkResult> {
  return followTicketClocks(deps);
}
