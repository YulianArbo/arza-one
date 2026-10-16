// Interfaz pública de terceros (M02). Los demás módulos se enteran de las fusiones por el evento
// «party.merged» de la bandeja de salida; nunca leen las tablas pty_ directamente.
export { PartyModule } from './interface/party.module.js';
export { seedPartyDemo } from './application/party-demo-seed.js';
export { visiblePartyName } from './application/party-records.js';
