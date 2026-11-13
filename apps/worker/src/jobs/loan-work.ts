import { followLoans, type LoanWorkResult } from '@arza/api/asset';

export type LoanWorkJobDependencies = Parameters<typeof followLoans>[0];

/**
 * Comodatos de los activos (B34), en el módulo de Activos: envía a firma los que ya tienen su PDF
 * y deja vigentes o anuladas las asignaciones que el colaborador respondió. Repetirlo no cambia
 * nada.
 */
export async function processLoanWork(deps: LoanWorkJobDependencies): Promise<LoanWorkResult> {
  return followLoans(deps);
}
