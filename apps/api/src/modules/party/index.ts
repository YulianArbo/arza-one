// Interfaz pública de terceros (M02). Los demás módulos se enteran de las fusiones por el evento
// «party.merged» de la bandeja de salida; nunca leen las tablas pty_ directamente. El CRM (B22)
// registra aquí la persona de un prospecto y vuelve cliente al ganador de una oportunidad;
// Contratos (B24) pide aquí el cliente con sus firmantes autorizados. Finanzas (B32) pide los
// proveedores y el documento de cada tercero para el archivo contable. Compras (B33) pide los
// proveedores con el estado de su conocimiento del tercero.
export { PartyModule } from './interface/party.module.js';
export {
  candidateParties,
  dropCandidateRole,
  eraseRecruitmentIdentity,
  registerCandidateParty,
} from './application/recruitment-parties.js';
export { seedPartyDemo } from './application/party-demo-seed.js';
export { visiblePartyName } from './application/party-records.js';
export { addCompany, hasCompanyWithNit } from './application/company-load.js';
export { activeSuppliers, financeParties, type FinanceParty } from './application/party-finance.js';
export {
  activePurchaseSuppliers,
  purchaseSupplierRefs,
  type PurchaseSupplier,
} from './application/party-purchases.js';
export {
  contractParty,
  partyVerified,
  personByDocument,
  signingPerson,
  type ContractParty,
} from './application/party-contracts.js';
export {
  commercialParties,
  makeCustomer,
  matchingPartyIds,
  registerProspect,
  type CommercialParty,
} from './application/party-prospects.js';
