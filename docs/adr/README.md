# Decisiones de arquitectura

Cada decisión se guarda como un archivo con la plantilla [000-plantilla.md](000-plantilla.md)
(anexo C del manual). Cambiar una decisión exige un nuevo ADR que reemplace al anterior y la
aprobación del Director General. El resumen oficial está en el numeral 8.4 del manual.

| ADR                                                           | Decisión                                                                          | Estado    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| [ADR-001](001-monolito-modular.md)                            | Monolito modular con fronteras verificadas automáticamente                        | Aceptada  |
| [ADR-002](002-typescript-estricto.md)                         | TypeScript estricto en backend, frontend y contratos compartidos                  | Aceptada  |
| [ADR-003](003-monorepo-pnpm-turborepo.md)                     | Monorepo con pnpm y Turborepo                                                     | Aceptada  |
| [ADR-004](004-nestjs-api-worker.md)                           | NestJS para la API y el worker                                                    | Aceptada  |
| [ADR-005](005-nextjs-web.md)                                  | Next.js con React para las tres superficies web                                   | Aceptada  |
| [ADR-006](006-postgresql-prisma.md)                           | PostgreSQL como única base de datos, con Prisma                                   | Aceptada  |
| [ADR-007](007-multiempresa-tenant-id-rls.md)                  | Aislamiento multiempresa con tenant_id y seguridad por fila                       | Aceptada  |
| [ADR-008](008-identidad-propia.md)                            | Identidad propia: sesiones en cookie segura, Argon2id y MFA con TOTP              | Aceptada  |
| [ADR-009](009-autorizacion-rbac-abac-casl.md)                 | Autorización RBAC más ABAC evaluada en el backend con CASL                        | Aceptada  |
| [ADR-010](010-contratos-zod-openapi.md)                       | Contratos de datos con Zod compartidos y OpenAPI generado                         | Aceptada  |
| [ADR-011](011-motor-de-flujos-por-datos.md)                   | Motor de flujos definido por datos                                                | Aceptada  |
| [ADR-012](012-auditoria-inmutable-hash.md)                    | Auditoría inmutable encadenada por hash en la misma transacción                   | Aceptada  |
| [ADR-013](013-archivos-s3-privado.md)                         | Archivos en almacenamiento S3 privado con enlaces temporales                      | Aceptada  |
| [ADR-014](014-trabajos-bullmq-valkey.md)                      | Trabajos asíncronos con BullMQ sobre Valkey                                       | Aceptada  |
| [ADR-015](015-firma-electronica-propia.md)                    | Firma electrónica propia con paquete de evidencia                                 | Aceptada  |
| [ADR-016](016-componentes-regulados-por-integracion.md)       | Facturación fiscal, contabilidad y nómina por integración                         | Aceptada  |
| [ADR-017](017-despliegue-docker-compose.md)                   | Despliegue con Docker Compose en un servidor por ambiente                         | Aceptada  |
| [ADR-018](018-github-actions.md)                              | GitHub y GitHub Actions para código, revisión y despliegue                        | Aceptada  |
| [ADR-019](019-tailwind-shadcn-radix.md)                       | Sistema de diseño con Tailwind CSS y shadcn/ui sobre Radix                        | Aceptada  |
| [ADR-020](020-fechas-utc-dinero-numeric.md)                   | Fechas en UTC y zona America/Bogota en la interfaz; dinero en numeric(18,2)       | Aceptada  |
| [ADR-021](021-uuid-v7-consecutivos.md)                        | Identificadores UUID versión 7 y consecutivos de negocio separados                | Aceptada  |
| [ADR-022](022-ia-por-pasarela.md)                             | Inteligencia artificial solo mediante pasarela con control de permisos y registro | Aceptada  |
| [ADR-023](023-seguimiento-de-tramites-en-la-transaccion.md)   | Los módulos siguen los pasos de sus trámites dentro de la misma transacción       | Propuesta |
| [ADR-024](024-integracion-continua-sin-repeticiones.md)       | Integración continua sin repetir verificaciones sobre el mismo código             | Aceptada  |
| [ADR-026](026-vigilancia-fuera-del-servidor-de-produccion.md) | Vigilancia y errores en un servidor aparte del de producción                      | Aceptada  |
| [ADR-027](027-busqueda-del-asistente-sin-vectores.md)         | Búsqueda del asistente de IA con palabras clave, sin vectores                     | Aceptada  |
