import { proposeMonthlyDispositions, type MonthlyProposalDependencies } from '@arza/api/doc';

export type DispositionProposeJobDependencies = MonthlyProposalDependencies;

/**
 * Propuesta mensual de disposición final (B21, numeral 12.4), en el módulo de gestión documental:
 * cada día, la del mes de cada empresa que aún no la tiene y tiene documentos con la retención
 * vencida. No elimina nada: la propuesta empieza su trámite y le llega a Calidad. Devuelve cuántas
 * creó.
 */
export async function processDispositionPropose(
  deps: DispositionProposeJobDependencies,
): Promise<number> {
  return proposeMonthlyDispositions(deps);
}
