// Interfaz pública del módulo de auditoría (M19). Se publica también como «@arza/api/audit» para
// el worker, que verifica la cadena de cada empresa a diario.
export { AuditModule } from './interface/audit.module.js';
export { ChainVerificationUseCase } from './application/chain-verification.js';
export { entityHistory, type EntityHistoryPage } from './application/entity-history.js';
