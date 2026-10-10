// Interfaz pública del módulo de identidad (M01). Los demás módulos, el worker y los comandos solo
// usan lo que se exporta aquí. Se publica también como «@arza/api/iam» para el worker.
export { IamModule } from './interface/iam.module.js';
export { seedAccessControl } from './application/access-seed.js';
export {
  prepareAccountEmail,
  type AccountEmail,
  type AccountEmailDependencies,
} from './application/account-email.js';
export { peopleById, usersInPosition } from './infrastructure/user-directory-store.js';
