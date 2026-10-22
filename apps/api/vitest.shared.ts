// Código que solo puede probarse contra PostgreSQL y Valkey reales. Su cobertura la mide
// vitest.int.config.ts; vitest.config.ts mide todo lo demás. Cada archivo se mide en un solo lado.
export const DATABASE_BOUND_FILES = [
  'src/platform/database/**/*.ts',
  'src/platform/valkey/valkey-throttler-storage.ts',
  'src/platform/queues/job-queue.ts',
  'src/platform/queues/queue.module.ts',
  'src/platform/audit/**/*.ts',
  'src/platform/outbox/**/*.ts',
  // Identidad (B08): casos de uso, acceso a datos y controladores.
  'src/modules/iam/application/account-email.ts',
  'src/modules/iam/application/change-password.ts',
  'src/modules/iam/application/invitation.ts',
  'src/modules/iam/application/login.ts',
  'src/modules/iam/application/password-reset.ts',
  'src/modules/iam/application/profile.ts',
  'src/modules/iam/application/session-service.ts',
  'src/modules/iam/infrastructure/accounts-store.ts',
  'src/modules/iam/infrastructure/identity-lookup.ts',
  'src/modules/iam/interface/**/*.ts',
  // Segundo factor y seguridad de sesión (B09).
  'src/modules/iam/application/active-sessions.ts',
  'src/modules/iam/application/reauthentication.ts',
  'src/modules/iam/application/second-factor-reset.ts',
  'src/modules/iam/application/second-factor-settings.ts',
  'src/modules/iam/application/second-factor-setup.ts',
  'src/modules/iam/application/second-factor-sign-in.ts',
  'src/modules/iam/application/second-factor-verifier.ts',
  'src/modules/iam/application/security-notice-email.ts',
  'src/modules/iam/application/sign-in-completion.ts',
  'src/modules/iam/application/verification-failures.ts',
  'src/modules/iam/infrastructure/second-factor-store.ts',
  'src/modules/iam/infrastructure/verification-attempts.ts',
  // Roles, permisos y autorización (B10).
  'src/modules/iam/application/access-control.ts',
  'src/modules/iam/application/access-messages.ts',
  'src/modules/iam/application/access-review.ts',
  'src/modules/iam/application/access-seed.ts',
  'src/modules/iam/application/cli-role-assignment.ts',
  'src/modules/iam/application/delegations.ts',
  'src/modules/iam/application/permission-change.ts',
  'src/modules/iam/application/role-admin.ts',
  'src/modules/iam/application/role-assignment.ts',
  'src/modules/iam/application/user-admin.ts',
  'src/modules/iam/application/user-directory.ts',
  'src/modules/iam/infrastructure/access-catalog.ts',
  'src/modules/iam/infrastructure/access-store.ts',
  'src/modules/iam/infrastructure/assignment-store.ts',
  'src/modules/iam/infrastructure/role-store.ts',
  'src/modules/iam/infrastructure/user-directory-store.ts',
  'src/modules/iam/infrastructure/people-directory.ts',
  // Auditoría y trazabilidad (B11): todo menos el formato CSV, que se prueba solo.
  'src/modules/audit/application/**/*.ts',
  'src/modules/audit/infrastructure/**/*.ts',
  'src/modules/audit/interface/**/*.ts',
  // Núcleo (B12): todo menos las reglas del dominio, que se prueban solas.
  'src/modules/core/application/**/*.ts',
  'src/modules/core/infrastructure/**/*.ts',
  'src/modules/core/interface/**/*.ts',
  // Terceros (B13): todo menos las reglas del dominio, que se prueban solas.
  'src/modules/party/application/**/*.ts',
  'src/modules/party/interface/**/*.ts',
  // Archivos (B14): todo menos las reglas del dominio, que se prueban solas. El almacenamiento, el
  // antivirus y los enlaces necesitan Garage, ClamAV y Valkey reales.
  'src/modules/doc/application/**/*.ts',
  'src/modules/doc/infrastructure/**/*.ts',
  'src/modules/doc/interface/**/*.ts',
  // Flujos y tareas (B15): todo menos el motor del dominio, que se prueba solo.
  'src/modules/wf/application/**/*.ts',
  'src/modules/wf/infrastructure/**/*.ts',
  'src/modules/wf/interface/**/*.ts',
  // Avisos, comentarios y adjuntos (B16): todo menos las reglas del dominio, que se prueban solas.
  'src/modules/iam/infrastructure/notice-recipients.ts',
  'src/modules/ntf/application/**/*.ts',
  'src/modules/ntf/interface/**/*.ts',
  // Privacidad (B17): casos de uso y controladores.
  'src/modules/privacy/application/**/*.ts',
  'src/modules/privacy/interface/**/*.ts',
];

/** Procesos que solo arrancan algo; se prueban a mano o como proceso real. */
export const ENTRY_POINTS = [
  'src/main.ts',
  'src/platform/database/seed/seed-main.ts',
  'src/modules/iam/interface/cli/**',
  'src/modules/doc/interface/cli/import-master-list-main.ts',
  'src/modules/doc/interface/cli/import-retention-main.ts',
];
