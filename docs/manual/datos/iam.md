# Diccionario de datos · Identidad (iam\_) y auditoría mínima (aud\_)

Tipos exactos, restricciones e índices de las tablas de identidad (M01) creadas en B08 y de la
versión mínima de la auditoría (M19) que B11 completa. Migración:
`apps/api/prisma/migrations/20261009000000_iam_identity_and_audit`. Se actualiza en el mismo pull
request que cambia el modelo.

## Reglas comunes

Las mismas de [core.md](core.md): columnas de control con el disparador
`core_set_control_columns()`, seguridad por fila activada y forzada con
`core_current_tenant_id()`, UUID v7 y fechas `timestamptz` en UTC. Diferencias:

- **Sin `DELETE`** para `app_user` en ninguna tabla.
- **`iam_login_attempts`**: `app_user` solo la lee (y solo las filas de su empresa); escribe en
  ella únicamente por la función `iam_record_login_attempt`.
- **`aud_events` y `aud_security_events`**: solo inserción. `app_user` tiene `SELECT` e `INSERT`;
  no puede modificar ni borrar. No llevan columnas de control porque sus filas no cambian.
- Las llaves de sesión y de enlaces **nunca** se guardan: solo su huella SHA-256 en hexadecimal.

## Búsquedas antes de conocer la empresa

Al iniciar sesión, al llegar una cookie o al abrir un enlace del correo todavía no se sabe la
empresa, y la seguridad por fila no deja ver nada sin ella. Estas funciones `SECURITY DEFINER`
corren como su dueño (`migration_user`), que tiene políticas de **solo lectura** sobre las tablas
`iam_` (y de inserción sobre los intentos), y devuelven lo mínimo. Tienen `search_path` fijo.
`app_user` solo puede ejecutarlas; no puede cambiarlas.

| Función                                                                    | Devuelve                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `iam_find_login_user(email)`                                               | `user_id`, `tenant_id` de la cuenta con ese correo (sin importar su estado) |
| `iam_find_session(token_hash, now)`                                        | `session_id`, `user_id`, `tenant_id` de una sesión sin cerrar ni vencer     |
| `iam_find_token(token_hash, purpose, now)`                                 | `token_id`, `user_id`, `tenant_id` de un enlace sin usar ni vencer          |
| `iam_record_login_attempt(email, ip, succeeded, reason, occurred_at, id)` | Nada. La empresa y el usuario los deduce del correo                        |
| `iam_recent_login_failures(email, since)`                                  | `failures`, `last_failure_at`: fallos desde `since` y después del último acierto |

## iam_users · Cuentas de usuario

| Columna               | Tipo        | Nulo | Por defecto | Regla                                                                          |
| --------------------- | ----------- | ---- | ----------- | ------------------------------------------------------------------------------ |
| `id`                  | uuid        | No   | UUID v7     | Llave primaria                                                                 |
| `tenant_id`           | uuid        | No   |             | Empresa; llave foránea a `core_tenants`                                        |
| `email`               | text        | No   |             | Sin espacios y en minúsculas; **único en toda la plataforma**                  |
| `display_name`        | text        | Sí   |             | Nombre con el que se muestra                                                   |
| `password_hash`       | text        | Sí   |             | Argon2id en formato PHC (`$argon2id$…`); obligatoria si la cuenta está activa  |
| `kind`                | text        | No   |             | `internal`, `portal` o `service` (las de servicio nunca tienen contraseña)     |
| `status`              | text        | No   | `invited`   | `invited`, `active`, `locked` o `inactive` (ficha 17.2)                        |
| `party_id`            | uuid        | Sí   |             | Tercero de la persona (M02, B13)                                               |
| `position_id`         | uuid        | Sí   |             | Cargo (M00, B12)                                                               |
| `mfa_required`        | boolean     | No   | true        | Segundo factor obligatorio (B09)                                               |
| `last_login_at`       | timestamptz | Sí   |             | Último inicio de sesión                                                        |
| `locked_until`        | timestamptz | Sí   |             | Bloqueo temporal de 15 minutos tras cinco fallos                               |
| `password_changed_at` | timestamptz | Sí   |             | Último cambio de contraseña                                                    |
| `created_at` … `deleted_at` |       |      |             | Columnas de control                                                            |

Índices: llave primaria, únicos (`email`) y (`tenant_id`, `id`), y (`tenant_id`, `status`).

## iam_sessions · Sesiones

| Columna          | Tipo        | Nulo | Por defecto | Regla                                                                     |
| ---------------- | ----------- | ---- | ----------- | ------------------------------------------------------------------------- |
| `id`             | uuid        | No   | UUID v7     | Llave primaria                                                            |
| `tenant_id`      | uuid        | No   |             | Empresa                                                                   |
| `user_id`        | uuid        | No   |             | Cuenta; llave foránea (`tenant_id`, `user_id`) a `iam_users`              |
| `token_hash`     | text        | No   |             | Huella SHA-256 de la llave de la cookie; única                            |
| `ip`             | text        | Sí   |             | Dirección IP al iniciar sesión                                            |
| `user_agent`     | text        | Sí   |             | Navegador (máximo 512 caracteres)                                         |
| `last_seen_at`   | timestamptz | No   |             | Última actividad (se guarda como mucho una vez por minuto)                |
| `expires_at`     | timestamptz | No   |             | Vencimiento total: 12 horas después de iniciar sesión                     |
| `revoked_at`     | timestamptz | Sí   |             | Cierre; va junto con `revoked_reason`                                     |
| `revoked_reason` | text        | Sí   |             | `logout`, `idle`, `password_changed` o `password_reset`                   |
| `created_at` … `deleted_at` |  |      |             | Columnas de control                                                       |

Índices: llave primaria, único (`token_hash`) y (`tenant_id`, `user_id`).

## iam_tokens · Enlaces de un solo uso

| Columna      | Tipo        | Nulo | Por defecto | Regla                                                       |
| ------------ | ----------- | ---- | ----------- | ----------------------------------------------------------- |
| `id`         | uuid        | No   | UUID v7     | Llave primaria                                              |
| `tenant_id`  | uuid        | No   |             | Empresa                                                     |
| `user_id`    | uuid        | No   |             | Cuenta                                                      |
| `purpose`    | text        | No   |             | `invitation` (72 horas) o `password_reset` (30 minutos)     |
| `token_hash` | text        | No   |             | Huella SHA-256 de la llave del enlace; única                |
| `expires_at` | timestamptz | No   |             | Vencimiento; al enviar otro enlace, el anterior vence ya    |
| `used_at`    | timestamptz | Sí   |             | Uso; una sola vez                                           |
| `created_at` … `deleted_at` |  |      |             | Columnas de control                                         |

Índices: llave primaria, único (`token_hash`) y (`tenant_id`, `user_id`, `purpose`).

## iam_login_attempts · Intentos de inicio de sesión

Se registran también los intentos con correos que no tienen cuenta (con `tenant_id` vacío), para
aplicarles la misma espera y el mismo bloqueo. Esas filas no las ve ninguna empresa.

| Columna       | Tipo        | Nulo | Regla                                                                                  |
| ------------- | ----------- | ---- | -------------------------------------------------------------------------------------- |
| `id`          | uuid        | No   | Llave primaria                                                                         |
| `tenant_id`   | uuid        | Sí   | Empresa de la cuenta, si existe                                                        |
| `user_id`     | uuid        | Sí   | Cuenta, si existe                                                                      |
| `email`       | text        | No   | Correo escrito, normalizado                                                            |
| `ip`          | text        | Sí   | Dirección IP                                                                           |
| `succeeded`   | boolean     | No   |                                                                                        |
| `reason`      | text        | No   | Acierto: `ok`, `password_reset`. Fallo: `bad_credentials`, `delayed`, `locked`         |
| `occurred_at` | timestamptz | No   | Momento del intento                                                                    |
| `created_at` … `deleted_at` |  |  | Columnas de control                                                                    |

Índices: llave primaria, (`email`, `occurred_at`) y (`tenant_id`, `user_id`).

## aud_events · Auditoría de negocio (versión mínima)

B11 agrega la cadena de hash (`prev_hash`, `hash`), la partición por mes, la consulta y la
verificación.

| Columna          | Tipo        | Nulo | Regla                                                                    |
| ---------------- | ----------- | ---- | ------------------------------------------------------------------------ |
| `id`             | uuid        | No   | Llave primaria                                                           |
| `tenant_id`      | uuid        | No   | Empresa                                                                  |
| `occurred_at`    | timestamptz | No   | Momento del hecho                                                        |
| `actor_id`       | uuid        | Sí   | Obligatorio solo si `actor_kind` es `user`                               |
| `actor_kind`     | text        | No   | `user`, `system` o `anonymous`                                           |
| `action`         | text        | No   | Formato de los permisos del anexo G, por ejemplo `iam.session.create`    |
| `entity_type`    | text        | No   | Tabla o recurso, por ejemplo `iam_user`                                  |
| `entity_id`      | uuid        | Sí   | Registro afectado                                                        |
| `result`         | text        | No   | `success` o `failure`                                                    |
| `changes`        | jsonb       | No   | Lo que cambió; nunca contraseñas, huellas, llaves ni códigos             |
| `ip`             | text        | Sí   | Dirección IP                                                             |
| `correlation_id` | text        | Sí   | Identificador de la petición                                             |

Índices: llave primaria, (`tenant_id`, `occurred_at`) y (`tenant_id`, `entity_type`, `entity_id`).

Acciones registradas en B08: `iam.user.invite`, `iam.link.issue`, `iam.invitation.accept`,
`iam.session.create` (éxito y fallo), `iam.session.revoke` (salida y por inactividad),
`iam.user.lock`, `iam.password.reset_request`, `iam.password.reset` e `iam.password.change`.

## aud_security_events · Eventos de seguridad

| Columna       | Tipo        | Nulo | Regla                                           |
| ------------- | ----------- | ---- | ----------------------------------------------- |
| `id`          | uuid        | No   | Llave primaria                                  |
| `tenant_id`   | uuid        | No   | Empresa                                         |
| `occurred_at` | timestamptz | No   | Momento                                         |
| `type`        | text        | No   | Por ejemplo `iam.account.locked`                |
| `user_id`     | uuid        | Sí   | Cuenta afectada                                 |
| `ip`          | text        | Sí   | Dirección IP                                    |
| `detail`      | jsonb       | No   | Explicación; nunca datos secretos               |
| `severity`    | text        | No   | `low`, `medium`, `high` o `critical`            |

Índices: llave primaria y (`tenant_id`, `occurred_at`). Cada bloqueo también deja el evento de
dominio `security.alert` en la bandeja de salida (numeral 13.3), para el aviso de B16.
