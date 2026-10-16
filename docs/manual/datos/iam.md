# Diccionario de datos · Identidad (iam\_)

Tipos exactos, restricciones e índices de las tablas de identidad (M01) creadas en B08, B09 y
B10. La auditoría (M19) está en [aud.md](aud.md). Migraciones (en
`apps/api/prisma/migrations/`): `20261009000000_iam_identity_and_audit` (B08) y
`20261010000000_iam_second_factor_and_devices` (B09) y
`20261011000000_iam_roles_permissions_and_delegations` (B10). Se actualiza en el mismo pull
request que cambia el modelo.

## Reglas comunes

Las mismas de [core.md](core.md): columnas de control con el disparador
`core_set_control_columns()`, seguridad por fila activada y forzada con
`core_current_tenant_id()`, UUID v7 y fechas `timestamptz` en UTC. Diferencias:

- **Sin `DELETE`** para `app_user` en ninguna tabla.
- **`iam_login_attempts`**: `app_user` solo la lee (y solo las filas de su empresa); escribe en
  ella únicamente por la función `iam_record_login_attempt`.
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
| `position_id`         | uuid        | Sí   |             | Cargo (M00, B12); solo internas y activo al asignarlo. Da el jefe inmediato     |
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

## iam_permissions · Catálogo de permisos (B10)

Los 201 permisos del anexo G. **Es el mismo para todas las empresas**: no lleva `tenant_id` ni
seguridad por fila, porque no tiene datos de ninguna. Lo mantiene igual a `packages/contracts` la
semilla (`pnpm db:seed`); la API solo lo lee. Un permiso que sale del catálogo queda con
`deleted_at`. La tabla legible de qué tiene cada rol está en
[permisos-por-rol.md](permisos-por-rol.md).

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `id` | uuid | No | Llave primaria |
| `code` | text | No | `módulo.recurso.acción`, en minúsculas; único |
| `resource` | text | No | Todo menos la última parte, por ejemplo `iam.user` |
| `action` | text | No | La última parte, por ejemplo `lock`; `code` = `resource.action` |
| `group_key` | text | No | Fila del anexo G, por ejemplo `iam` |
| `level` | text | No | `read`, `write`, `approve`, `manage` o `restricted` (cómo se deduce de la matriz) |
| `ownable` | boolean | No | Se puede conceder limitado a «solo lo propio» |
| `description` | text | No | Para la pantalla de roles |
| `created_at` … `deleted_at` | | | Columnas de control |

Índices: llave primaria y único (`code`).

## iam_roles · Roles (B10)

Roles de cada empresa: los 16 del sistema (numeral 15.2), que la semilla crea y mantiene y nadie
edita, y los personalizados. Nunca se borran.

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `id` | uuid | No | Llave primaria |
| `tenant_id` | uuid | No | Empresa |
| `code` | text | No | Mayúsculas, números y `_`; único por empresa. El de un rol personalizado sale de su nombre |
| `name` | text | No | De 3 a 80 caracteres |
| `description` | text | Sí | Hasta 300 caracteres |
| `is_system` | boolean | No | Rol del sistema: no se edita |
| `audience` | text | No | `internal` o `portal`: a qué tipo de cuenta se asigna |
| `created_at` … `deleted_at` | | | Columnas de control; `version` para editar con `If-Match` |

Índices: llave primaria, únicos (`tenant_id`, `id`) y (`tenant_id`, `code`).

## iam_role_permissions · Permisos de cada rol (B10)

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `id` | uuid | No | Llave primaria |
| `tenant_id` | uuid | No | Empresa |
| `role_id` | uuid | No | Llave foránea (`tenant_id`, `role_id`) a `iam_roles`: siempre de la misma empresa |
| `permission_id` | uuid | No | Llave foránea a `iam_permissions` |
| `conditions` | jsonb | Sí | Vacío: vale para todo. La única condición permitida es `{"scope": "own"}` («solo lo propio») |
| `created_at` … `deleted_at` | | | Columnas de control; un permiso quitado queda con `deleted_at` |

Índices: llave primaria, único (`role_id`, `permission_id`) y (`tenant_id`, `role_id`).

**Qué es «solo lo propio».** La API lo traduce, según el permiso, a una condición sobre el registro
concreto: `from_user_id` igual a la persona en las delegaciones, y `involved_user_ids` (las
personas relacionadas con el registro) en los demás. Cada módulo que llegue arma ese campo para
sus registros. Nadie escribe condiciones arbitrarias: la base rechaza cualquier otra.

## iam_user_roles · Roles de cada persona (B10)

Asignaciones con vigencia (ficha 17.2). Retirar un rol deja `revoked_at`: el historial completo
queda. Las vigentes son las no retiradas, ya empezadas y sin vencer.

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `id` | uuid | No | Llave primaria |
| `tenant_id` | uuid | No | Empresa |
| `user_id` | uuid | No | Llave foránea (`tenant_id`, `user_id`) a `iam_users` |
| `role_id` | uuid | No | Llave foránea (`tenant_id`, `role_id`) a `iam_roles` |
| `scope_type`, `scope_id` | text, uuid | Sí | Alcance (por ejemplo, un proyecto); van juntos. Sin uso en B10 |
| `valid_from` | timestamptz | No | Desde cuándo vale |
| `valid_until` | timestamptz | Sí | Vence; posterior a `valid_from`. El auditor siempre vence, a los 90 días como máximo |
| `assigned_by` | uuid | Sí | Quién la asignó; vacío si fue el sistema (`pnpm iam:asignar-rol`, invitación por comando) |
| `revoked_at`, `revoked_by` | timestamptz, uuid | Sí | Retiro |
| `created_at` … `deleted_at` | | | Columnas de control |

Índices: llave primaria, (`tenant_id`, `user_id`) y (`tenant_id`, `role_id`).

**Nadie se asigna ni se retira un rol a sí mismo**, y la base lo impide además de la API: la
restricción `iam_user_roles_not_self_check` exige que `assigned_by`, `revoked_by` y quien hizo el
cambio según la base (`created_by`, `updated_by`, que fija el disparador) sean distintos de
`user_id`.

## iam_delegations · Delegación temporal de aprobaciones (B10)

| Columna | Tipo | Nulo | Regla |
| --- | --- | --- | --- |
| `id` | uuid | No | Llave primaria |
| `tenant_id` | uuid | No | Empresa |
| `from_user_id` | uuid | No | Quien delega; llave foránea a `iam_users` |
| `to_user_id` | uuid | No | Quien recibe; distinto de `from_user_id` |
| `starts_at`, `ends_at` | timestamptz | No | `ends_at` posterior a `starts_at` y 60 días después como máximo |
| `scope` | jsonb | No | Lista no vacía de permisos de aprobación delegados |
| `reason` | text | No | Motivo, de 5 a 300 caracteres |
| `revoked_at`, `revoked_by` | timestamptz, uuid | Sí | Retiro |
| `created_at` … `deleted_at` | | | Columnas de control |

Índices: llave primaria, (`tenant_id`, `from_user_id`) y (`tenant_id`, `to_user_id`).

La base rechaza una delegación registrada por quien la recibe (`created_by` distinto de
`to_user_id`): nadie se da aprobaciones a sí mismo. El motor de flujos (B15) las usa.

Las cuatro tablas con empresa tienen seguridad por fila forzada; `app_user` puede leer, insertar y
modificar, pero no borrar (tampoco en `iam_permissions`).

## Cambio en iam_sessions (B10)

`revoked_reason` admite además `account_locked`: bloquear una cuenta desde la pantalla de
usuarios cierra sus sesiones.

## Auditoría

Las tablas `aud_events` y `aud_security_events`, con las acciones y los eventos de seguridad que
registra este módulo, están en [aud.md](aud.md) desde B11.
