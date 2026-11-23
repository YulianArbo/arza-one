// Interfaz pública del módulo de privacidad (M18). Los formularios de los demás módulos registran
// aquí la autorización de tratamiento, en su misma transacción; nunca leen las tablas prv_. Cada
// módulo que guarda datos personales registra su fuente en PersonalDataRegistry para la entrega y
// la supresión (B42). Servicio al cliente traslada aquí las PQRSF de datos personales. Se publica
// también como «@arza/api/privacy» para el worker, que envía los correos al titular, arma el PDF
// de la entrega y lleva los plazos y la retención.
export { PrivacyModule } from './interface/privacy.module.js';
export { seedPrivacyDemo, seedPrivacyNotices } from './application/privacy-seed.js';
export {
  consentsOfParty,
  grantConsent,
  hasCommercialConsent,
  publishedAuthorizationNotices,
  publishedNotices,
  canEraseRecruitmentIdentity,
} from './application/consent-grant.js';
export { actorOf } from './application/privacy-support.js';
export { recordCookieConsent } from './application/cookie-consents.js';
export {
  PARTY_DIRECTORY,
  type HolderRecord,
  type PartyDirectory,
  type PartyRecord,
} from './application/party-directory.js';
export {
  outcomeFor,
  PersonalDataRegistry,
  shownDate,
  shownDateTime,
  type ErasureActor,
  type ErasureOutcome,
  type PersonalDataHolder,
  type PersonalDataSource,
} from './application/personal-data-sources.js';
export { receivePqrsfTransfer } from './application/request-transfer.js';
export { runPrivacyWork, type PrivacyWorkDependencies } from './application/privacy-work.js';
export { runPrivacyDailyIn, tenantsWithPrivacyDailyWork } from './application/privacy-daily.js';
