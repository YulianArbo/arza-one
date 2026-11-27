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
  // Persona del firmante (B25).
  'src/modules/iam/application/person-link.ts',
  // Empresa, foto y cargos de la persona (B22A) y cuentas y términos del portal (B30).
  'src/modules/iam/application/my-company.ts',
  'src/modules/iam/application/profile-photo.ts',
  'src/modules/iam/application/user-position.ts',
  'src/modules/iam/application/portal-accounts.ts',
  'src/modules/iam/application/portal-terms.ts',
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
  // Parámetros tributarios (B23): casos de uso y controladores.
  'src/modules/fin/application/**/*.ts',
  'src/modules/fin/interface/**/*.ts',
  // Compras, proveedores y viajes (B33): todo menos las reglas del dominio, que se prueban solas.
  'src/modules/purchase/application/**/*.ts',
  'src/modules/purchase/interface/**/*.ts',
  // Activos (B34): todo menos las reglas del dominio, que se prueban solas.
  'src/modules/asset/application/**/*.ts',
  'src/modules/asset/interface/**/*.ts',
  // Talento humano (B35): selección, vinculación, inducción y eliminación de datos de candidatos.
  'src/modules/hr/application/**/*.ts',
  'src/modules/hr/interface/**/*.ts',
  'src/modules/iam/application/invitation-messages.ts',
  'src/modules/iam/application/invitation-records.ts',
  // Contratos (B24): todo menos las reglas del dominio, que se prueban solas.
  'src/modules/contract/application/**/*.ts',
  'src/modules/contract/interface/**/*.ts',
  // CRM (B22): todo menos las reglas del dominio (dinero, embudo, CSV), que se prueban solas.
  'src/modules/crm/application/**/*.ts',
  'src/modules/crm/interface/**/*.ts',
  // Proyectos (B26): todo menos las reglas y los flujos del dominio, que se prueban solos.
  'src/modules/project/application/**/*.ts',
  'src/modules/project/interface/**/*.ts',
  // Servicio al cliente: mesa de ayuda (B28), PQRSF, encuestas y base de conocimiento (B29).
  'src/modules/service/application/**/*.ts',
  'src/modules/service/interface/**/*.ts',
  // Portal (B30): consultas y escrituras con base de datos, medidas en integración.
  'src/modules/iam/application/portal-accounts.ts',
  'src/modules/iam/application/portal-terms.ts',
  'src/modules/portal/application/**/*.ts',
  'src/modules/portal/interface/**/*.ts',
  // Seguridad y salud en el trabajo (B37): todo con base de datos, medido en integración.
  'src/modules/sst/application/**/*.ts',
  'src/modules/sst/interface/**/*.ts',
  // Calidad y mejora continua (B38): todo con base de datos, medido en integración.
  'src/modules/qms/application/**/*.ts',
  'src/modules/qms/interface/**/*.ts',
  // Innovación y propiedad intelectual (B40): todo con base de datos, medido en integración.
  'src/modules/inn/application/**/*.ts',
  'src/modules/inn/interface/**/*.ts',
  // Sitio público, textos legales y cookies (B41): todo con base de datos, medido en integración.
  'src/modules/iam/application/platform-terms-gate.ts',
  'src/modules/web/application/**/*.ts',
  'src/modules/web/interface/**/*.ts',
  // Carga inicial y revisión de puesta en marcha (B45): lo que lee o escribe en la base.
  'src/modules/iam/application/initial-load-accounts.ts',
  'src/modules/golive/application/**/*.ts',
  // Tableros de la Dirección (B46): las cifras leen la base de cada módulo.
  'src/modules/iam/application/access-figures.ts',
  'src/modules/dashboard/application/**/*.ts',
  'src/modules/dashboard/interface/**/*.ts',
  // Asistente de IA (B47): la pasarela, sus usos y lo que lee de Documentos y Servicio.
  'src/modules/ai/application/**/*.ts',
  'src/modules/ai/interface/ai.controller.ts',
  'src/modules/ai/interface/ai-admin.controller.ts',
  'src/modules/doc/application/assistant-sources.ts',
  'src/modules/service/application/assistant-sources.ts',
];

/** Procesos que solo arrancan algo; se prueban a mano o como proceso real. */
export const ENTRY_POINTS = [
  'src/main.ts',
  'src/platform/database/seed/seed-main.ts',
  'src/modules/iam/interface/cli/**',
  'src/modules/doc/interface/cli/import-master-list-main.ts',
  'src/modules/doc/interface/cli/import-retention-main.ts',
  'src/modules/contract/interface/cli/link-signer-main.ts',
  'src/modules/golive/interface/cli/initial-load-main.ts',
  'src/modules/golive/interface/cli/readiness-main.ts',
];
