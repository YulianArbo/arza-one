// Interfaz pública del módulo de identidad (M01). Los demás módulos, el worker y los comandos solo
// usan lo que se exporta aquí. Se publica también como «@arza/api/iam» para el worker.
export { IamModule } from './interface/iam.module.js';
export { seedAccessControl } from './application/access-seed.js';
export {
  prepareAccountEmail,
  type AccountEmail,
  type AccountEmailDependencies,
} from './application/account-email.js';
export {
  POSITION_DIRECTORY,
  type PositionDirectory,
  type PositionRecord,
} from './application/position-directory.js';
export { peopleById, usersInPosition } from './infrastructure/user-directory-store.js';
export { findLoginUser, type IdentityRef } from './infrastructure/identity-lookup.js';
export { linkUserToPerson, type PersonLink } from './application/person-link.js';
export {
  activeInternalUserByEmail,
  activeRoleCodes,
  activeUsersInPosition,
  delegationsTo,
  existingRoleCodes,
  isActiveInternalUser,
  positionOfUser,
  type ReceivedDelegation,
} from './infrastructure/people-directory.js';
export {
  accountsWithRoles,
  activeUsersWithRoles,
  noticeRecipients,
  type CompanySignerAccount,
  type NoticeRecipient,
} from './infrastructure/notice-recipients.js';
export {
  CLIENT_COMPANIES,
  PROFILE_IMAGES,
  type ClientCompanies,
  type ClientCompany,
  type OwnImageState,
  type ProfileImages,
  type StoredImage,
} from './application/profile-ports.js';
export { assertUsableImage, imageNotAllowed, imageNotFound } from './application/image-messages.js';
