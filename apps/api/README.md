# @arza/api

API del backend de ARZA ONE (NestJS 11). Es el único componente que escribe en la base de datos
(capítulo 8.2). Este documento describe la plataforma transversal: la cadena de petición (B02),
la base de datos con contexto de empresa y seguridad por fila (B03), Valkey con las colas de
trabajos (B06) y la identidad (B08). Los módulos se agregan en `src/modules/`.

## Cómo se ejecuta

| Comando                                                          | Qué hace                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm --filter @arza/api dev`                                    | Arranca la API en http://localhost:4000; al guardar un cambio se recompila y reinicia sola  |
| `pnpm --filter @arza/api start`                                  | Arranca la versión ya compilada (`dist/`)                                                   |
| `pnpm --filter @arza/api test`                                   | Pruebas unitarias y de la cadena de petición con cobertura                                  |
| `pnpm --filter @arza/api test -u`                                | Regenera `openapi.json` después de cambiar un contrato                                      |
| `pnpm test:int`                                                  | Pruebas con PostgreSQL y Valkey reales (requiere Docker)                                    |
| `pnpm db:migrate`                                                | Aplica las migraciones pendientes, como `migration_user`                                    |
| `pnpm db:seed`                                                   | Datos semilla (empresa de la plataforma); idempotente                                       |
| `pnpm db:seed:demo`                                              | Semilla más dos empresas ficticias; nunca en producción (`pnpm infra:up` la carga en local) |
| `pnpm --filter @arza/api db:generate`                            | Regenera el cliente de Prisma tras cambiar el modelo                                        |
| `pnpm iam:invitar --empresa demo-uno --correo ana@demo-uno.test` | Invita a una persona (B08); ver «Identidad»                                                 |
| `pnpm iam:reiniciar-segundo-factor --correo ana@demo-uno.test`   | Reinicia el segundo factor de quien perdió el celular y los códigos (B09)                   |

Las variables de entorno se leen del archivo `.env` de la raíz del proyecto (ver `.env.example`).
Los servicios locales se encienden con `pnpm infra:up` ([guía](../../docs/runbooks/entorno-local.md)).

## Puntos de la API

| Ruta                                                      | Acceso                          | Respuesta                                                                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                             | Público                         | 200 si la base de datos, las colas y los archivos responden; 503 si alguno no. Sin límite de peticiones (ver «Límite de peticiones»)                                                                    |
| `GET /version`                                            | Público                         | Versión, ambiente (`local`, `staging`, `production`) y commit                                                                                                                                           |
| `GET /api/docs`                                           | Público                         | Documentación interactiva. Solo en local y pruebas; no existe en producción                                                                                                                             |
| `GET /api/docs/openapi.json`                              | Público                         | El mismo documento en formato OpenAPI 3.1                                                                                                                                                               |
| `POST /v1/auth/login`                                     | Público                         | Inicia sesión; entrega la cookie y el código antifalsificación. Mismo mensaje exista o no el correo                                                                                                     |
| `POST /v1/auth/mfa/verify`                                | A medias                        | Segundo paso: código de la aplicación o de recuperación. Completa la sesión con una llave nueva                                                                                                         |
| `POST /v1/auth/mfa/setup`                                 | A medias                        | Empieza a configurar el segundo factor: secreto y dirección para el QR (15 minutos para confirmar)                                                                                                      |
| `POST /v1/auth/mfa/setup/confirm`                         | A medias                        | Confirma con el primer código y entrega los diez códigos de recuperación (una sola vez)                                                                                                                 |
| `POST /v1/auth/reauthenticate`                            | Sesión                          | «Confirme que es usted»: contraseña y código. Vale 30 minutos para las acciones de alto riesgo                                                                                                          |
| `GET /v1/auth/session`                                    | A medias                        | Sesión actual, su etapa (`stage`) y su código antifalsificación                                                                                                                                         |
| `POST /v1/auth/logout`                                    | A medias                        | Cierra la sesión actual                                                                                                                                                                                 |
| `POST /v1/auth/password/forgot`                           | Público                         | Pide el enlace de recuperación; siempre responde 202 con el mismo mensaje                                                                                                                               |
| `POST /v1/auth/password/reset`                            | Público                         | Cambia la contraseña con el enlace y cierra todas las sesiones                                                                                                                                          |
| `POST /v1/auth/invitation/accept`                         | Público                         | Activa la cuenta con el enlace de la invitación                                                                                                                                                         |
| `GET /v1/me`                                              | Sesión                          | Perfil propio                                                                                                                                                                                           |
| `POST /v1/me/password`                                    | Sesión                          | Cambia la contraseña propia y cierra todas las sesiones, incluida la actual                                                                                                                             |
| `GET /v1/me/mfa`                                          | Sesión                          | Estado del segundo factor propio: obligatorio, activo, desde cuándo y cuántos códigos quedan                                                                                                            |
| `POST /v1/me/mfa/recovery-codes`                          | Sesión + confirmación           | Diez códigos de recuperación nuevos; los anteriores dejan de servir                                                                                                                                     |
| `POST /v1/me/mfa/disable`                                 | Sesión + confirmación           | Desactiva el segundo factor, solo si es opcional; cierra las demás sesiones                                                                                                                             |
| `GET /v1/me/sessions`                                     | Sesión                          | Sesiones abiertas propias, con navegador, sistema, IP y cuál es la actual                                                                                                                               |
| `POST /v1/me/sessions/{id}/revoke`                        | Sesión                          | Cierra una sesión propia; surte efecto en la siguiente petición de ese equipo. La de otra persona responde 404                                                                                          |
| `POST /v1/me/sessions/revoke-others`                      | Sesión                          | Cierra todas las demás sesiones propias                                                                                                                                                                 |
| `GET /v1/me/permissions`                                  | Sesión                          | Roles y permisos vigentes propios (todo o «solo lo propio»), para que la web decida qué mostrar                                                                                                         |
| `GET /v1/users`                                           | `iam.user.read`                 | Usuarios por páginas (`limit`, `cursor`), con búsqueda (`q`) y filtros (`status`, `kind`)                                                                                                               |
| `GET /v1/users/{id}`                                      | `iam.user.read`                 | Ficha con roles vigentes; los datos de seguridad solo para quien tiene `iam.user.lock` o `iam.user.reset_mfa`                                                                                           |
| `POST /v1/users`                                          | `iam.user.invite`               | Invita a una persona; las internas reciben COLABORADOR y los roles elegidos                                                                                                                             |
| `POST /v1/users/{id}/actions/invite`                      | `iam.user.invite`               | Reenvía la invitación de una cuenta que sigue invitada                                                                                                                                                  |
| `POST /v1/users/{id}/actions/lock`                        | `iam.user.lock`                 | Bloquea la cuenta y cierra sus sesiones                                                                                                                                                                 |
| `POST /v1/users/{id}/actions/unlock`                      | `iam.user.lock` + conf.         | Quita el bloqueo del administrador o el de los intentos fallidos                                                                                                                                        |
| `POST /v1/users/{id}/actions/reset-mfa`                   | `iam.user.reset_mfa` + conf.    | Reinicia el segundo factor de otra persona y cierra sus sesiones                                                                                                                                        |
| `POST /v1/users/{id}/actions/revoke-sessions`             | `iam.session.revoke` + conf.    | Cierra todas las sesiones de una persona                                                                                                                                                                |
| `POST /v1/sessions/actions/revoke-all`                    | `iam.session.revoke` + conf.    | Cierra todas las sesiones de la empresa salvo la propia (numeral 15.7)                                                                                                                                  |
| `POST /v1/users/{id}/roles`                               | `iam.role.assign` + conf.       | Asigna un rol, con vencimiento opcional (obligatorio para AUDITOR, 90 días como máximo)                                                                                                                 |
| `POST /v1/users/{id}/roles/{assignmentId}/actions/revoke` | `iam.role.assign` + conf.       | Retira un rol                                                                                                                                                                                           |
| `GET /v1/permissions`                                     | `iam.role.read`                 | Catálogo del anexo G por módulo                                                                                                                                                                         |
| `GET /v1/roles`                                           | `iam.role.read`                 | Roles del sistema y personalizados, con cuántos permisos y personas tienen                                                                                                                              |
| `GET /v1/roles/{id}`                                      | `iam.role.read`                 | Un rol con sus permisos                                                                                                                                                                                 |
| `POST /v1/roles`                                          | `iam.role.manage` + conf.       | Crea un rol personalizado                                                                                                                                                                               |
| `PATCH /v1/roles/{id}`                                    | `iam.role.manage` + conf.       | Edita un rol personalizado con la versión en `If-Match`; nunca uno del sistema ni uno que usted tenga                                                                                                   |
| `GET /v1/delegations`                                     | `iam.delegation.manage`         | Todas con el permiso completo; si no, las que la persona hizo o recibió                                                                                                                                 |
| `POST /v1/delegations`                                    | `iam.delegation.manage` + conf. | Delega aprobaciones propias hasta 60 días (el administrador, las de otros, nunca a su favor)                                                                                                            |
| `POST /v1/delegations/{id}/actions/revoke`                | `iam.delegation.manage`         | Retira una delegación vigente o programada; la ajena responde 404                                                                                                                                       |
| `GET /v1/access-review`                                   | `iam.access_review.read`        | Informe de revisión de accesos; cada consulta queda en la auditoría                                                                                                                                     |
| `GET /v1/audit-events`                                    | `audit.event.read`              | Eventos de auditoría del más reciente al más antiguo, por páginas (`cursor` es el lugar en la cadena); filtros `from`, `to`, `actor_id`, `action` (o su comienzo), `entity_type`, `entity_id`, `result` |
| `GET /v1/entities/{type}/{id}/history`                    | `audit.event.read`              | Historial de un registro, por ejemplo `iam_user` o `iam_role`                                                                                                                                           |
| `GET /v1/security-events`                                 | `audit.security.read`           | Eventos de seguridad por páginas; filtros `from`, `to`, `severity`, `user_id`                                                                                                                           |
| `GET /v1/audit-exports`                                   | `audit.event.read`              | Exportaciones hechas: quién, cuándo, con qué filtros y cuántos eventos                                                                                                                                  |
| `POST /v1/audit-exports`                                  | `audit.event.export` + conf.    | Descarga un CSV con los filtros de la consulta (máximo 10.000 eventos; si no, 422 `AUDIT_EXPORT_TOO_LARGE`)                                                                                             |
| `POST /v1/audit-events/verify-chain`                      | `audit.chain.verify`            | Verifica la cadena de la empresa; un daño queda como evento de seguridad crítico                                                                                                                        |

«Sesión» quiere decir cualquier sesión completa, sobre la cuenta propia (`@OwnAccount()`). Un
permiso como `iam.user.read` quiere decir que la ruta lo exige (`@RequirePermission()`, B10): sin
él responde 403 `PERMISSION_DENIED`. «A medias» quiere decir que también la atiende una sesión que solo verificó la contraseña
(`@SigningIn()`); cualquier otra ruta le responde 403 `SECOND_FACTOR_REQUIRED`. «Confirmación» es
`@RecentAuthentication()` («conf.» en la tabla): sin una confirmación de identidad de los últimos 30 minutos responde
403 `REAUTHENTICATION_REQUIRED`.

`/health` y `/version` están fuera de `/v1` porque son de operación (los consultan Caddy y
Docker). Los recursos de negocio van bajo `/v1`; en los servidores Caddy les antepone `/api`, así
que desde el navegador son `/api/v1/...` (capítulo 14.1).

El documento OpenAPI se genera desde los esquemas Zod de `packages/contracts` (ADR-010) y se
guarda en [`openapi.json`](openapi.json). Una prueba falla si el archivo no coincide con el código.

## Cadena de petición (capítulo 13.1)

Cada petición pasa por los mismos eslabones, definidos una sola vez en `src/platform/`:

| Paso | Eslabón                      | Dónde                                     | Si falla                    |
| ---- | ---------------------------- | ----------------------------------------- | --------------------------- |
| —    | Cabeceras de seguridad       | `platform/security/security-headers.ts`   | —                           |
| 2    | Identificador de correlación | `platform/correlation/correlation-id.ts`  | —                           |
| 3    | Límite de peticiones         | `ThrottlerGuard` en `app.module.ts`       | 429 `RATE_LIMITED`          |
| 4    | Acceso y sesión              | `platform/access/access.guard.ts`         | 401 `UNAUTHENTICATED`       |
| 5    | Antifalsificación (CSRF)     | `platform/security/csrf.guard.ts`         | 403 `CSRF_INVALID`          |
| 8    | Autorización (B10)           | `platform/access/authorization.guard.ts`  | 403 `PERMISSION_DENIED`     |
| 7    | Validación con Zod           | `ZodValidationPipe` en `app.module.ts`    | 422 `VALIDATION_FAILED`     |
| 12   | Respuesta validada con Zod   | `ZodSerializerInterceptor`                | 500 `INTERNAL_ERROR`        |
| —    | Formato único de error       | `platform/errors/api-exception.filter.ts` | Siempre el formato del 14.2 |

El paso 6 (contexto de empresa) lo fija cada caso de uso con la empresa de la sesión. El paso 11
(auditoría) existe en versión mínima desde B08 (`platform/audit/`); B11 lo completa. El paso 8
(autorización) llega en B10 y corre antes de la validación (paso 7): quien no tiene el permiso no
llega a saber qué datos acepta la ruta. El paso 9 (idempotencia) llega con los módulos que la
necesiten.

### Configuración

`platform/config/env-schema.ts` valida las variables al arrancar. Si falta una obligatoria o
tiene formato inválido, la API no arranca y lista las variables con problema, nunca sus valores.
Solo se exigen las variables que la API usa hoy; cada bloque agrega las suyas.

### Registros

JSON con Pino. Cada línea de una petición lleva `correlation_id`, `service` y `environment`.
Se ocultan los encabezados `Authorization`, `Cookie` y `X-CSRF-Token`, la cookie de respuesta y
los campos `password`, `token`, `otp_code` y `verification_code`. Los cuerpos de las peticiones
no se registran.

### Identificador de correlación

Si la petición trae `X-Correlation-Id` con un UUID válido, se reutiliza; si no, se genera un
UUID v7. Se devuelve siempre en la cabecera `X-Correlation-Id` y en todo error.

### Errores

Todo error sale con el formato del numeral 14.2:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "El recurso solicitado no existe.",
    "details": [],
    "correlation_id": "01a10f6d-79a4-73f1-94d9-da2a6f95a5d5"
  }
}
```

Un error inesperado responde 500 con un mensaje genérico que incluye el identificador; la traza
queda solo en el registro interno. Códigos de la plataforma: `BAD_REQUEST`, `UNAUTHENTICATED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `VALIDATION_FAILED`, `RATE_LIMITED` e
`INTERNAL_ERROR` (`packages/contracts/src/platform/error-response.ts`).

### Acceso

Toda ruta debe declarar cómo se accede a ella con `@Public()`, `@SigningIn()`, `@OwnAccount()` o
`@RequirePermission()` (`platform/access/access.decorators.ts`). Sin declaración, la ruta queda
cerrada. Una prueba (`test/access.test.ts`) falla si alguna ruta de la API no lo declara (ver
«Roles, permisos y autorización»). Las rutas con sesión exigen una sesión válida (ver «Identidad»);
la persona llega al controlador con `@CurrentPrincipal()` y sus permisos con `@CurrentAbility()`.

### Límite de peticiones

`RATE_LIMIT_MAX_REQUESTS` peticiones por dirección IP cada `RATE_LIMIT_WINDOW_SECONDS` segundos.
Detrás de Caddy, la IP real se toma de `X-Forwarded-For` (solo de proxies de red local). Las
rutas de acceso (iniciar sesión, recuperar y restablecer la contraseña, activar la cuenta) tienen
un límite más estricto: 10 por minuto por IP. Además, cada correo tiene su propia espera
progresiva y su bloqueo (ver «Identidad»).

Desde B06 el conteo vive en Valkey (`platform/valkey/valkey-throttler-storage.ts`): un guion de
Valkey cuenta y bloquea en un solo paso, así que no se lo saltan peticiones simultáneas, se
conserva si la API se reinicia y es el mismo para todas sus copias. Si Valkey no responde, toda
petición con límite falla con 500: el límite es un control de seguridad y no se omite. `/health`
no tiene límite (`@SkipThrottle`) para poder informar justamente esa caída; sus revisiones son
baratas y tienen tiempo máximo, y en los servidores Caddy limita el tráfico antes (B07).

### Cabeceras de seguridad (numeral 15.6)

`Strict-Transport-Security`, `Content-Security-Policy` (`default-src 'none'`),
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`,
`Cache-Control: no-store` y `X-Robots-Tag: noindex`. La página `/api/docs` permite estilos en
línea porque Swagger UI los necesita. CORS solo admite `APP_URL`, `PORTAL_URL` y `PUBLIC_URL`.

## Base de datos (B03)

PostgreSQL 17 con Prisma 7 (ADR-006). El modelo está en [`prisma/schema.prisma`](prisma/schema.prisma)
y las migraciones en `prisma/migrations/`. El cliente de Prisma se genera en `src/generated/`
(fuera del repositorio) al instalar, compilar o ejecutar `db:generate`. El diccionario de las
tablas está en [`docs/manual/datos/core.md`](../../docs/manual/datos/core.md).

### Dos usuarios de base de datos

[`infra/postgres/init/01-roles-and-database.sh`](../../infra/postgres/init/01-roles-and-database.sh)
crea la base `arza_one` (UTF-8, intercalación ICU `es-CO`, zona UTC) y dos usuarios, con las
contraseñas de `MIGRATION_DB_PASSWORD` y `APP_DB_PASSWORD`:

| Usuario          | Lo usa                                       | Puede                                                                                                               |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `migration_user` | `pnpm db:migrate` (`DATABASE_MIGRATION_URL`) | Es dueño del esquema y de las tablas; aplica migraciones                                                            |
| `app_user`       | La API y los datos semilla (`DATABASE_URL`)  | Solo lo que cada migración le concede. No es dueño ni superusuario, no salta la seguridad por fila y no borra filas |

### Contexto de empresa y seguridad por fila (ADR-007)

Toda lectura o escritura de datos de negocio pasa por `DatabaseService.withTenant`:

```ts
await database.withTenant({ tenantId, userId }, async (transaction) => {
  await transaction.outboxEvent.create({
    data: { tenantId, eventType: 'quote.accepted', payload },
  });
});
```

`withTenant` valida que los identificadores sean UUID, abre una transacción y fija
`app.tenant_id` y `app.user_id` solo para ella (`set_config(..., true)`, equivalente a `SET LOCAL`,
con parámetros). Las políticas RLS comparan cada fila con `core_current_tenant_id()`. Sin contexto
no se ve ni se escribe ninguna fila; al terminar la transacción el contexto desaparece, así que una
conexión reutilizada no lo hereda. Si el trabajo lanza un error, se revierte todo.

### Reglas para cada tabla nueva de negocio

Prisma no expresa estas piezas; van en el SQL de la migración (ver la primera migración):

1. Columna `tenant_id` (primera en los índices compuestos) y las columnas de control.
2. `ENABLE` y `FORCE ROW LEVEL SECURITY` y una política `USING` y `WITH CHECK` con
   `core_current_tenant_id()`.
3. El disparador `core_set_control_columns()`: fija `created_*`, `updated_*` y `version` (sube en
   cada cambio) y ese valor no se puede falsificar desde el código.
4. `GRANT` explícito a `app_user` solo de lo necesario. Sin `DELETE` salvo que el borrado físico
   esté justificado (capítulo 12.1).
5. Pruebas de aislamiento entre empresas y de permiso denegado en `test/int/`.

Las migraciones nuevas se escriben con `prisma migrate diff` y se completan a mano con lo anterior;
`migration_user` no puede crear la base auxiliar que usa `prisma migrate dev`. Una prueba falla si
la base migrada no coincide con el modelo.

## Valkey y colas de trabajos (B06)

`platform/valkey/valkey.module.ts` abre **una sola conexión** a Valkey para toda la API (límite de
peticiones y `/health`). Sin conexión, cada comando falla de inmediato en lugar de quedar en
espera, y ioredis reintenta conectarse solo. La API arranca aunque Valkey no responda.

`platform/queues/` define las colas y los trabajos (ADR-014): el nombre de cada trabajo, el
esquema Zod de sus datos (todo trabajo lleva `tenantId`, `userId` y `correlationId`) y la
política de reintentos (`DEFAULT_JOB_OPTIONS`: 6 intentos con espera creciente). `JobQueue`
valida los datos antes de encolar. El worker procesa los trabajos ([`apps/worker`](../worker/README.md)).

### Interfaz pública para el worker

[`src/platform/index.ts`](src/platform/index.ts) se publica como `@arza/api/platform` y el
módulo de identidad como `@arza/api/iam` (campo `exports` de `package.json`). Es lo único que el worker puede importar de la API (ADR-004):
configuración, `DatabaseService`, empresas semilla, datos que no se registran y colas. Agregar algo
ahí es ampliar ese contrato.

## Identidad (B08, módulo `src/modules/iam`)

Cuentas, inicio de sesión, sesiones y contraseñas según el numeral 15.1 y la ADR-008. Las tablas
están en [`docs/manual/datos/iam.md`](../../docs/manual/datos/iam.md).

| Regla                        | Cómo se cumple                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta solo por invitación     | `pnpm iam:invitar` crea la cuenta invitada y encola el correo; el enlace vence en 72 horas y sirve una vez. Desde B10 también la pantalla de usuarios, con `iam.user.invite` |
| Contraseñas                  | De 12 a 128 caracteres, sin reglas de composición, fuera de la lista de filtradas ([`data/`](data/README.md)). Argon2id de Node.js, parámetros de OWASP, sal propia          |
| Sesión                       | 256 bits al azar en la cookie `__Host-arza_session` (HttpOnly, Secure, SameSite=Lax); en la base solo su huella. Vence a las 8 horas sin uso y a las 12 en total             |
| Antifalsificación            | Código por sesión (HMAC con `CSRF_SECRET`) en la cabecera `X-CSRF-Token` y origen propio en toda operación que modifica datos                                                |
| Espera y bloqueo             | 1, 2, 4 y 8 segundos tras cada fallo; al quinto, 15 minutos con evento de seguridad, alerta en la bandeja de salida y auditoría. Igual para correos sin cuenta               |
| El error no revela el correo | Mismo código y mensaje para correo inexistente, contraseña equivocada o cuenta no activa; sin cuenta se calcula igual un hash para gastar el mismo tiempo                    |
| Recuperación                 | Enlace de 30 minutos; al usarlo se cierran todas las sesiones y se avisa por correo                                                                                          |
| Cambio de contraseña         | Pide la actual; cierra todas las sesiones, incluida la actual, y avisa por correo                                                                                            |

Los correos los envía el worker (trabajo `iam.account-email`). El trabajo solo lleva el usuario y
el propósito: el enlace se crea al enviarlo, así su llave nunca queda guardada en la cola.

**Cómo encuentra la empresa.** Al iniciar sesión todavía no se sabe la empresa. Unas funciones
estrechas de la base de datos (`iam_find_login_user`, `iam_find_session`, `iam_find_token`) dicen
a qué usuario y empresa pertenece un correo, una sesión o un enlace; todo lo demás ocurre dentro de
la transacción de esa empresa. Por eso el correo es único en toda la plataforma.

## Segundo factor y seguridad de sesión (B09)

| Regla                           | Cómo se cumple                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Obligatorio por tipo de usuario | Siempre para los internos (no se puede desactivar). En el portal, para quien tenga `mfa_required` (asignar el rol `CLIENTE_ADMIN` lo activa, B10); opcional para los demás |
| Dos pasos                       | La contraseña correcta abre una sesión a medias de 10 minutos que solo atiende el segundo paso; al completarlo la sesión recibe una llave nueva y sus 12 horas             |
| TOTP                            | `otpauth` (MIT): seis dígitos cada 30 segundos, se acepta el anterior y el siguiente, y cada código sirve una sola vez (se guarda el último paso usado)                    |
| Secreto cifrado                 | AES-256-GCM con `FIELD_ENCRYPTION_KEY` (`src/platform/crypto/field-cipher.ts`), atado a la empresa y la persona; la base rechaza un secreto sin cifrar                     |
| Códigos de recuperación         | Diez de 16 caracteres, de un solo uso; solo su huella SHA-256. Usar uno deja evento de seguridad y aviso por correo                                                        |
| Cinco códigos equivocados       | Cierran la sesión y bloquean la cuenta 15 minutos, con evento de seguridad grave, alerta en la bandeja de salida y auditoría (también al confirmar la identidad)           |
| Confirmar la identidad          | `POST /v1/auth/reauthenticate`; vale 30 minutos. Lo exigen: códigos nuevos, cambiar de celular y desactivar                                                                |
| Sesiones activas                | La lista y el cierre remoto; como cada petición valida la sesión en la base, el cierre surte efecto en la siguiente petición                                               |
| Dispositivo nuevo (15.5)        | Marca aleatoria en la cookie `__Host-arza_device` (400 días; solo su huella en `iam_known_devices`). El primer equipo no avisa; los siguientes dejan evento y correo       |
| Avisos por correo               | Activó, cambió, desactivó o reiniciaron el segundo factor; códigos nuevos; código usado; equipo nuevo. Nunca llevan códigos ni secretos                                    |

**Reiniciar el segundo factor de alguien** que perdió el celular y los códigos (desde B10 también
en la pantalla de usuarios, con el permiso `iam.user.reset_mfa`). Antes, confirme la identidad de la persona
por otro medio:

```bash
pnpm iam:reiniciar-segundo-factor --correo ana@demo-uno.test
```

Cierra todas sus sesiones, deja auditoría y evento de seguridad, y le avisa por correo. Al volver a
entrar, la persona configura el segundo factor de nuevo.

**Invitar a una persona** (con `pnpm infra:up` y `pnpm dev` encendidos):

```bash
pnpm iam:invitar --empresa demo-uno --correo ana@demo-uno.test --nombre "Ana Pérez" --tipo interno
```

`--empresa` acepta `plataforma`, `demo-uno`, `demo-dos` o el identificador de la empresa; `--tipo`,
`interno` (aplicación) o `portal`. Si la invitación sigue pendiente, la reenvía. Para un
administrador de cliente agregue `--exige-segundo-factor`.

## Roles, permisos y autorización (B10)

Permisos por rol y por registro con CASL (ADR-009). El catálogo del anexo G, la matriz del numeral
15.3 y los 16 roles del sistema viven en `packages/contracts/src/iam/` y la semilla los carga en
cada empresa. La tabla legible de qué tiene cada rol está en
[`permisos-por-rol.md`](../../docs/manual/datos/permisos-por-rol.md) y las tablas en
[`iam.md`](../../docs/manual/datos/iam.md).

| Regla                                    | Cómo se cumple                                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada punto declara su permiso            | `@RequirePermission('iam.user.lock')`, `@OwnAccount()` (solo en `/v1/me` y `/v1/auth`), `@SigningIn()` o `@Public()`. `test/access.test.ts` falla si alguna ruta no declara nada, si nombra un permiso fuera del catálogo o si usa `@OwnAccount()` fuera de su lugar |
| Permisos de la persona                   | La suma de sus roles vigentes (no retirados, empezados y sin vencer), calculada en cada petición: retirar un rol surte efecto en la siguiente                                                                                                                        |
| Sin el permiso                           | 403 `PERMISSION_DENIED`, sin decir qué permiso falta. La guarda va después de la protección CSRF y antes de pedir confirmar la identidad                                                                                                                             |
| «Solo lo propio» (letra P)               | El permiso pasa la ruta; el caso de uso revisa el registro con `canOnRecord()` y responde 404 si no es de la persona (numeral 15.5, BOLA)                                                                                                                            |
| Respuesta según el rol                   | La ficha de un usuario trae sus datos de seguridad solo a quien puede bloquear o reiniciar el segundo factor; a los demás, `security: null`                                                                                                                          |
| Nadie se asigna permisos a sí mismo      | La API responde 403 `SELF_PERMISSION_CHANGE` al asignarse o retirarse un rol, al editar un rol que se tiene y al registrar una delegación a su favor; la base de datos lo impide además con restricciones                                                            |
| Roles del sistema                        | No se editan (422 `SYSTEM_ROLE_READONLY`); la semilla los deja como dice la matriz y audita cada corrección (`iam.role.sync`)                                                                                                                                        |
| Auditor por tiempo limitado              | Su asignación siempre vence, a los 90 días como máximo (422 `ROLE_EXPIRY_INVALID`)                                                                                                                                                                                   |
| Administrador del cliente                | Asignar `CLIENTE_ADMIN` vuelve obligatorio el segundo factor de esa cuenta                                                                                                                                                                                           |
| Toda persona interna                     | Recibe COLABORADOR al ser invitada (por la pantalla o por el comando)                                                                                                                                                                                                |
| Alerta de cada cambio de permisos (15.5) | Auditoría, evento de seguridad `iam.permissions.changed` y alerta `security.alert` en la bandeja de salida, en la misma transacción; correo a la persona cuando cambian sus roles                                                                                    |
| Delegaciones                             | Solo aprobaciones que quien delega tiene hoy, hasta 60 días, nunca a uno mismo. Quien no ve la lista de usuarios indica el correo de quien recibe                                                                                                                    |

Las acciones de alto riesgo («+ conf.» en la tabla de puntos) piden además confirmar la identidad
en los últimos 30 minutos, como en B09.

**Para un módulo nuevo:** declare cada ruta con `@RequirePermission()` y un permiso del catálogo.
Si el permiso tiene «solo lo propio», arme en cada registro el campo `involved_user_ids` con las
personas relacionadas (quien lo creó, sus miembros, a quien está asignado) y revíselo con
`canOnRecord(ability, código, registro)` usando `@CurrentAbility()`. Agregar un permiso exige
agregarlo al catálogo y a la matriz, y regenerar `permisos-por-rol.md` con
`pnpm --filter @arza/contracts test -u`.

**Dar el primer rol de administrador** (desde la pantalla nadie se asigna roles a sí mismo):

```bash
pnpm iam:asignar-rol --correo ana@demo-uno.test --rol ADMIN_PLATAFORMA
```

`--vence dd/mm/aaaa` fija el último día del rol (obligatorio para `AUDITOR`). La asignación queda a
nombre del sistema en la auditoría y la persona recibe un aviso por correo.

## Auditoría y trazabilidad (B11, módulo `src/modules/audit`)

Evidencia inalterable de todo lo que ocurre (ficha 17.20, ADR-012). Las tablas están en
[`aud.md`](../../docs/manual/datos/aud.md).

| Regla                            | Cómo se cumple                                                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toda escritura deja su evento    | El caso de uso llama a `recordAuditEvent()` (o `recordSecurityEvent()`) dentro de su transacción. `DatabaseService.withTenant` revierte la transacción que escribió sin evento; las excepciones van en `UnauditedWrite` con su porqué                     |
| Una prueba lo comprueba          | `test/int/audit/write-routes-audited.int.test.ts` toma del OpenAPI cada ruta `POST`, `PUT`, `PATCH` o `DELETE`, la llama con un identificador de correlación y exige un evento con ese identificador. Una ruta nueva sin su llamada hace fallar la prueba |
| Nadie modifica la auditoría      | `app_user` solo lee e inserta; no tiene acceso a las particiones                                                                                                                                                                                          |
| Cadena de hash                   | La base de datos fija `seq`, `prev_hash` y `hash` al insertar; `aud_verify_chain()` encuentra el primer evento faltante, alterado, desunido o borrado al final                                                                                            |
| Valor anterior y nuevo           | `changesBetween(antes, después, restringidos)`: de los restringidos solo «cambió»                                                                                                                                                                         |
| Consultar también queda auditado | Cada consulta, historial, exportación y verificación deja su evento                                                                                                                                                                                       |
| Verificación diaria              | El worker ejecuta `audit.chain-check` a las 3:00 a. m.: particiones de los próximos meses y verificación de cada empresa                                                                                                                                  |

**Para un módulo nuevo:** en cada caso de uso que escribe, registre el evento con
`recordAuditEvent()` en la misma transacción, con la acción en el formato del permiso
(`crm.quote.approve`) y `changes: changesBetween(...)`, marcando los campos restringidos. Agregue
la llamada de cada ruta nueva que escribe a `test/int/audit/support/write-route-calls.ts`, y el
nombre de la acción a `apps/web/src/features/audit/labels.ts`. Para el historial de una ficha
use `<EntityHistory entityType="..." entityId={...} />` en la web.

## Imágenes Docker (B05 y B07)

[`Dockerfile`](Dockerfile) produce dos imágenes, sin gestores de paquetes y con usuario sin
privilegios:

| Imagen      | Cómo se construye                                               | Qué lleva                                                                                                                                                                              |
| ----------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API         | `bash infra/scripts/ci/build-image.sh api arza-one/api`         | La API compilada y sus dependencias de producción                                                                                                                                      |
| Migraciones | `bash infra/scripts/ci/build-image.sh migrate arza-one/migrate` | Solo la consola de Prisma ([`infra/migrate`](../../infra/migrate/package.json)), el esquema y las migraciones. El despliegue la ejecuta una vez con `DATABASE_MIGRATION_URL` y termina |

En pruebas la API vive detrás de Caddy en `https://pruebas.[dominio]/api`; Caddy quita el prefijo
`/api` antes de pasarle la petición ([`infra/caddy/Caddyfile`](../../infra/caddy/Caddyfile)).

## Pruebas

- `src/**/*.test.ts`: unitarias (configuración, identificador, registros, revisiones de /health).
- `test/*.test.ts`: la API completa en memoria con Supertest, con la misma cadena que en
  producción. Las piezas externas de `/health` se simulan; `test/support/sample.controller.ts`
  agrega rutas de ensayo que solo existen en las pruebas.
- `test/startup.test.ts`: arranca el programa compilado real y comprueba que no arranca sin
  una variable obligatoria; sin Valkey, atiende `/health` y rechaza el resto (no omite el límite).
  Las demás pruebas en memoria cuentan el límite de peticiones en memoria.
- `test/int/*.int.test.ts` (`pnpm test:int`): con PostgreSQL 17 y Valkey 8 reales en Docker
  (Testcontainers). `test/int/support/global-setup.ts` crea la base con el mismo guion de
  `infra/postgres/init`, contraseñas desechables, y aplica las migraciones desde cero; también
  levanta Valkey con contraseña. Cubren aislamiento entre empresas, permisos denegados a
  `app_user`, columnas de control, transacciones, migraciones, semillas, el límite de peticiones
  en Valkey (429, conteo exacto con peticiones simultáneas, conteo compartido entre dos copias de
  la API) y la cola de trabajos. El worker reutiliza la misma preparación.
- `test/int/iam/`: identidad contra la base real, con un reloj de prueba para adelantar el
  tiempo (bloqueo, inactividad, vencimiento de enlaces): inicio de sesión, sesiones, contraseñas,
  invitación, aislamiento entre empresas y auditoría de solo inserción.
- `test/session-chain.test.ts` y `test/csrf.test.ts`: pasos 4 y 5 de la cadena, sin base de datos.
- Cobertura mínima: 90 % de líneas, funciones e instrucciones y 85 % de ramas (capítulo 21.1).
  [`vitest.shared.ts`](vitest.shared.ts) dice qué se mide en `test:int` (lo que trabaja contra la
  base de datos o Valkey); cada archivo se mide en un solo lado.
  Los datos semilla, el conteo en Valkey y `JobQueue` se miden en `test:int`, con el mismo umbral,
  porque solo se prueban con PostgreSQL y Valkey reales. `@prisma/client` figura como dependencia usada en `knip.json` porque solo lo
  importa el cliente generado, que no está en el repositorio.
