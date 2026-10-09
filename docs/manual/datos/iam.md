# Diccionario de datos · Identidad (iam\_) y auditoría mínima (aud\_)

Tipos exactos, restricciones e índices de las tablas de identidad (M01) creadas en B08 y B09 y de
la versión mínima de la auditoría (M19) que B11 completa. Migraciones (en
`apps/api/prisma/migrations/`): `20261009000000_iam_identity_and_audit` (B08) y
`20261010000000_iam_second_factor_and_devices` (B09). Se actualiza en el mismo pull
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
| `device_id` | uuid | Sí | | Equipo (`iam_known_devices`) desde el que se completó el inicio (B09) |
| `authenticated_at` | timestamptz | Sí | | Inicio completo, con segundo factor si corresponde. Vacío: sesión a medias, que solo atiende el segundo paso (B09) |
| `reauthenticated_at` | timestamptz | Sí | | Última confirmación de identidad; vale 30 minutos para las acciones de alto riesgo. Solo con `authenticated_at` (B09) |
| `last_seen_at`   | timestamptz | No   |             | Última actividad (se guarda como mucho una vez por minuto)                |
| `expires_at` | timestamptz | No | | Vencimiento total: 12 horas después de completar el inicio; 10 minutos mientras está a medias |
| `revoked_at`     | timestamptz | Sí   |             | Cierre; va junto con `revoked_reason`                                     |
| `revoked_reason` | text | Sí | | `logout`, `idle`, `password_changed`, `password_reset`; desde B09 también `remote_revoke` (cerrada desde otro equipo), `mfa_failures`, `mfa_changed` y `mfa_reset` |
| `created_at` … `deleted_at` |  |      |             | Columnas de control                                                       |

Índices: llave primaria, único (`token_hash`), (`tenant_id`, `user_id`) y (`tenant_id`, `device_id`).
Llave foránea (`tenant_id`, `device_id`) a `iam_known_devices`. Las sesiones abiertas antes de la
migración de B09 quedan sin `authenticated_at`: la API las trata como sesiones a medias.

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

## iam_mfa_factors · Segundo factor (B09)

Una fila por persona y tipo. **El secreto nunca se guarda legible**: va cifrado con AES-256-GCM y
la llave `FIELD_ENCRYPTION_KEY`, que vive en las variables de entorno (capítulo 12.1), atado a la
empresa y a la persona: copiado a otra fila no descifra. La base rechaza un secreto sin ese formato.

| Columna | Tipo | Nulo | Por defecto | Regla |
| --- | --- | --- | --- | --- |
| `id` | uuid | No | UUID v7 | Llave primaria |
| `tenant_id` | uuid | No | | Empresa |
| `user_id` | uuid | No | | Cuenta; llave foránea (`tenant_id`, `user_id`) a `iam_users` |
| `type` | text | No | `totp` | Solo `totp` por ahora |
| `secret_encrypted` | text | Sí | | Secreto activo cifrado (`v1.iv.etiqueta.cifrado`); va junto con `confirmed_at` |
| `confirmed_at` | timestamptz | Sí | | Activación con el primer código |
| `last_used_step` | integer | Sí | | Último paso de 30 segundos usado: un código no sirve dos veces |
| `pending_secret_encrypted` | text | Sí | | Secreto en configuración, cifrado; va junto con `pending_expires_at` |
| `pending_expires_at` | timestamptz | Sí | | 15 minutos para confirmar |
| `created_at` … `deleted_at` | | | | Columnas de control |

Índices: llave primaria y único (`tenant_id`, `user_id`, `type`). Desactivar o reiniciar el
segundo factor vacía el secreto; la fila no se borra.

## iam_recovery_codes · Códigos de recuperación (B09)

Diez por persona, de un solo uso. Solo se guarda la huella SHA-256; el código se muestra una vez.

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `id` | uuid | No | Llave primaria |
| `tenant_id` | uuid | No | Empresa |
| `user_id` | uuid | No | Cuenta |
| `code_hash` | text | No | Huella SHA-256 en hexadecimal; única |
| `used_at` | timestamptz | Sí | Uso |
| `revoked_at` | timestamptz | Sí | Anulado al generar otros, al desactivar o al reiniciar el segundo factor |
| `created_at` … `deleted_at` | | | Columnas de control |

Índices: llave primaria, único (`code_hash`) y (`tenant_id`, `user_id`).

## iam_known_devices · Dispositivos conocidos (B09)

Equipos desde los que la persona ya entró, para avisar de uno nuevo (numeral 15.5). El navegador
guarda una marca aleatoria en la cookie `__Host-arza_device`; aquí solo queda su huella.

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `id` | uuid | No | Llave primaria |
| `tenant_id` | uuid | No | Empresa |
| `user_id` | uuid | No | Cuenta |
| `device_hash` | text | No | Huella SHA-256 de la marca del navegador |
| `user_agent` | text | Sí | Navegador que informó el equipo la última vez |
| `first_seen_at` | timestamptz | No | Primera entrada |
| `last_seen_at` | timestamptz | No | Última entrada; no antes de `first_seen_at` |
| `created_at` … `deleted_at` | | | Columnas de control |

Índices: llave primaria, únicos (`tenant_id`, `id`) y (`tenant_id`, `user_id`, `device_hash`).

Las tres tablas tienen seguridad por fila forzada; `app_user` puede leerlas, insertar y
modificar, pero no borrar. Ninguna búsqueda sin empresa las necesita.

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

Acciones de B09: `iam.mfa.verify` (éxito y fallo), `iam.mfa.setup_start`, `iam.mfa.setup_confirm`
(fallo), `iam.mfa.enable`, `iam.mfa.change`, `iam.mfa.disable`,
`iam.mfa.recovery_codes_regenerate`, `iam.session.reauthenticate` (éxito y fallo),
`iam.session.revoke` (cerrada desde otro equipo), `iam.session.revoke_others`, `iam.user.lock`
(por códigos equivocados) e `iam.user.reset_mfa` (comando del responsable técnico).

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

Eventos de seguridad de B09. Todos llegan además a la persona como aviso por correo (trabajo
`iam.account-email`), sin códigos ni secretos:

| Tipo | Gravedad | Cuándo | Alerta en la bandeja (B16) |
| --- | --- | --- | --- |
| `iam.mfa.failures` | high | Cinco códigos equivocados: sesión cerrada y cuenta bloqueada 15 minutos | Sí |
| `iam.mfa.reset` | high | El responsable técnico reinició el segundo factor | Sí |
| `iam.mfa.changed` | medium | Pasó el segundo factor a otro celular | Sí |
| `iam.mfa.disabled` | medium | Desactivó el segundo factor (solo si era opcional) | Sí |
| `iam.mfa.recovery_codes_regenerated` | medium | Generó códigos de recuperación nuevos | No |
| `iam.mfa.recovery_code_used` | medium | Entró o confirmó su identidad con un código de recuperación | No |
| `iam.mfa.enabled` | low | Activó el segundo factor | No |
| `iam.login.new_device` | low | Inició sesión desde un equipo que la cuenta no conocía | No |
