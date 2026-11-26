// Interfaz pública del módulo de identidad (M01). Los demás módulos, el worker y los comandos solo
// usan lo que se exporta aquí. Se publica también como «@arza/api/iam» para el worker.
export { IamModule } from './interface/iam.module.js';
export { seedAccessControl } from './application/access-seed.js';
export {
  clearTermsPending,
  PLATFORM_TERMS_GATE,
  type PlatformTermsGate,
} from './application/platform-terms-gate.js';
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
  activeCollaborators,
  activeInternalUserByEmail,
  activeRoleCodes,
  activeUsersInPosition,
  delegationsTo,
  existingRoleCodes,
  hasAccountForParty,
  isActiveInternalUser,
  positionOfUser,
  type Collaborator,
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
export {
  changePortalRole,
  companyAccounts,
  emailOutsideCompany,
  portalAccountOf,
  portalRoleOfUser,
  renamePortalAccount,
  setPortalAccountActive,
  type CompanyAccount,
  type PortalAccount,
  type PortalAdminActor,
} from './application/portal-accounts.js';
export {
  acceptedTermsOf,
  recentSessionsOf,
  recordTermsAcceptance,
  type AcceptedTerms,
  type TermsVersion,
} from './application/portal-terms.js';
export {
  accountsOfParty,
  anonymizePortalAccount,
  type HolderAccount,
} from './application/holder-accounts.js';
export { InvitationUseCase, type InviteUserInput } from './application/invitation.js';
export {
  accountFindings,
  hasAccount,
  hasFullPermission,
  type AccountFindings,
  loadableRoles,
  type LoadableRole,
} from './application/initial-load-accounts.js';
export { AccountNotifier } from './application/account-notifier.js';
export { PasswordSetter } from './application/password-setter.js';
export { revokeEmployeeAccess, type AccessRevocation } from './application/offboarding-access.js';
export { accessFigures, type AccessFigureRow } from './application/access-figures.js';
