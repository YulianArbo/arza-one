// Interfaz pública del módulo de privacidad (M18). Los formularios de los demás módulos registran
// aquí la autorización de tratamiento, en su misma transacción; nunca leen las tablas prv_.
export { PrivacyModule } from './interface/privacy.module.js';
export { seedPrivacyDemo, seedPrivacyNotices } from './application/privacy-seed.js';
export {
  consentsOfParty,
  grantConsent,
  publishedAuthorizationNotices,
  publishedNotices,
  canEraseRecruitmentIdentity,
} from './application/consent-grant.js';
export { actorOf } from './application/privacy-support.js';
export {
  PARTY_DIRECTORY,
  type PartyDirectory,
  type PartyRecord,
} from './application/party-directory.js';
