import {
  followUpContracts,
  renderPendingContracts,
  type ContractFollowUpResult,
  type ContractWorkDependencies,
} from '@arza/api/contract';

export type ContractWorkJobDependencies = ContractWorkDependencies;

/**
 * Contratos (B24), en su módulo: el PDF definitivo de cada contrato y otrosí aprobados. Repetirlo no
 * cambia nada; si Gotenberg o el almacenamiento no responden, lo pendiente queda para la siguiente
 * pasada. Devuelve cuántos PDF generó.
 */
export async function processContractPdfs(deps: ContractWorkJobDependencies): Promise<number> {
  return renderPendingContracts(deps);
}

/** Revisión diaria: alertas a 90, 60 y 30 días, fin de plazo y obligaciones (ficha 17.7). */
export async function processContractFollowUp(
  deps: ContractWorkJobDependencies,
): Promise<ContractFollowUpResult> {
  return followUpContracts(deps);
}
