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
  activeUsersWithRoles,
  noticeRecipients,
  type NoticeRecipient,
} from './infrastructure/notice-recipients.js';
