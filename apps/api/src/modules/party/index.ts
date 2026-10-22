// Interfaz pública de terceros (M02). Los demás módulos se enteran de las fusiones por el evento
// «party.merged» de la bandeja de salida; nunca leen las tablas pty_ directamente. El CRM (B22)
// registra aquí la persona de un prospecto y vuelve cliente al ganador de una oportunidad.
export { PartyModule } from './interface/party.module.js';
export { seedPartyDemo } from './application/party-demo-seed.js';
export { visiblePartyName } from './application/party-records.js';
export {
  commercialParties,
  makeCustomer,
  matchingPartyIds,
  registerProspect,
  type CommercialActor,
  type CommercialParty,
  type ProspectPerson,
} from './application/party-prospects.js';
