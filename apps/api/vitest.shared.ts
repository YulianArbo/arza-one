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
];

/** Procesos que solo arrancan algo; se prueban a mano o como proceso real. */
export const ENTRY_POINTS = [
  'src/main.ts',
  'src/platform/database/seed/seed-main.ts',
  'src/modules/iam/interface/cli/**',
];
