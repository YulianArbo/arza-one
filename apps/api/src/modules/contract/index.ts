// Interfaz pública de Contratos (M06, B24). Los demás módulos se enteran de sus cambios por los
// eventos «contract.*» de la bandeja de salida; nunca leen las tablas ctr_. Los avisos y los anexos
// del expediente preguntan aquí cómo se nombra un contrato que la persona puede ver. Se publica
// también como «@arza/api/contract» para el worker, que genera los PDF y revisa los vencimientos.
export { ContractModule } from './interface/contract.module.js';
export { seedContracts } from './application/contract-seed.js';
export { visibleContractTitle } from './application/contract-access.js';
export { linkCompanySigner, type SignerLinkOutcome } from './application/signer-link.js';
export {
  followUpContracts,
  renderPendingContracts,
  type ContractFollowUpResult,
  type ContractWorkDependencies,
} from './application/contract-work.js';
export {
  processSignatureWork,
  type SignatureWorkDependencies,
  type SignatureWorkResult,
} from './application/signature-work.js';
export {
  followUpSignatures,
  type SignatureFollowUpResult,
} from './application/signature-follow-up.js';
