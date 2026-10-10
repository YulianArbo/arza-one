# Diccionario de datos · Auditoría (aud\_)

Tipos exactos, restricciones e índices de las tablas de la auditoría (M19, ficha 17.20, ADR-012).
B08 creó la versión mínima (`20261009000000_iam_identity_and_audit`); B11 la completa con la
partición por mes, la cadena de hash, las exportaciones y la verificación
(`20261012000000_aud_hash_chain_and_partitions`). Se actualiza en el mismo pull request que cambia
el modelo.

## Reglas comunes

- **Solo inserción.** `app_user` tiene `SELECT` e `INSERT` en `aud_events`, `aud_security_events`
  y `aud_exports`, y solo `SELECT` en `aud_chain_heads`. No puede modificar, borrar ni vaciar
  ninguna. Los eventos se conservan como mínimo diez años: no hay borrado automático.
- **Sin columnas de control**: sus filas nunca cambian.
- **Seguridad por fila** activada y forzada en las cuatro tablas, con `core_current_tenant_id()`.
- **Toda escritura deja su evento** en la misma transacción. `DatabaseService.withTenant` revierte
  la transacción que escribió sin insertar un evento en `aud_events` o `aud_security_events`
  (los disparadores marcan `app.audited`). Las únicas escrituras exentas están en el tipo
  `UnauditedWrite` con su porqué: hoy, la última actividad de la sesión (`last_seen_at`).
- **Lo que cambió**: `changes` guarda `{ campo: { from, to } }`; de un campo restringido solo
  `{ campo: { changed: true } }` (función `changesBetween`). Nunca contraseñas, huellas, llaves ni
  códigos.
- **Consultar la auditoría también queda auditado** (`audit.event.read`, `audit.security.read`,
  `audit.event.export`, `audit.chain.verify`).

## aud_events · Auditoría de negocio

Particionada por rango de `occurred_at`, una partición por mes (`aud_events_AAAA_MM`) y una por
defecto (`aud_events_default`) para que nunca se pierda un evento. `app_user` no tiene acceso
directo a las particiones: solo a la tabla principal, donde aplica la seguridad por fila.

| Columna          | Tipo        | Nulo | Regla                                                                    |
| ---------------- | ----------- | ---- | ------------------------------------------------------------------------ |
| `id`             | uuid        | No   | Identificador (UUID v7)                                                  |
| `tenant_id`      | uuid        | No   | Empresa                                                                  |
| `seq`            | bigint      | No   | Lugar en la cadena de la empresa: 1, 2, 3… Lo fija la base de datos      |
| `occurred_at`    | timestamptz | No   | Momento del hecho; columna de la partición                               |
| `actor_id`       | uuid        | Sí   | Obligatorio solo si `actor_kind` es `user`                               |
| `actor_kind`     | text        | No   | `user`, `system` o `anonymous`                                           |
| `action`         | text        | No   | Formato de los permisos del anexo G, por ejemplo `iam.session.create`    |
| `entity_type`    | text        | No   | Tabla o recurso, por ejemplo `iam_user`                                  |
| `entity_id`      | uuid        | Sí   | Registro afectado                                                        |
| `result`         | text        | No   | `success` o `failure`                                                    |
| `changes`        | jsonb       | No   | Lo que cambió (ver las reglas comunes)                                   |
| `ip`             | text        | Sí   | Dirección IP                                                             |
| `correlation_id` | text        | Sí   | Identificador de la petición                                             |
| `prev_hash`      | text        | No   | Hash del evento anterior de la empresa; 64 ceros en el primero           |
| `hash`           | text        | No   | SHA-256 en hexadecimal de todas las columnas y `prev_hash`               |

Llave primaria (`id`, `occurred_at`): en una tabla particionada debe incluir la columna de la
partición. Índices: (`tenant_id`, `seq`), (`tenant_id`, `occurred_at`) y (`tenant_id`,
`entity_type`, `entity_id`).

**Disparador `aud_events_chain`** (antes de insertar, `aud_chain_event()`, corre como su dueño):
bloquea el último eslabón de la empresa en `aud_chain_heads`, fija `seq`, `prev_hash` y `hash` —lo
que envíe la API se ignora— y actualiza el eslabón. El bloqueo dura hasta el fin de la transacción,
así dos eventos nunca toman el mismo lugar.

**Hash** (`aud_event_hash`): SHA-256 del arreglo JSON `[prev_hash, id, tenant_id, seq,
occurred_at en UTC con microsegundos, actor_kind, actor_id, action, entity_type, entity_id,
result, changes, ip, correlation_id]`. La forma de texto de un `jsonb` es única, así el mismo
evento siempre da el mismo hash.

## aud_chain_heads · Último eslabón de cada cadena

| Columna      | Tipo        | Nulo | Regla                                      |
| ------------ | ----------- | ---- | ------------------------------------------ |
| `tenant_id`  | uuid        | No   | Llave primaria; una fila por empresa       |
| `seq`        | bigint      | No   | Lugar del último evento                    |
| `hash`       | text        | No   | Hash del último evento                     |
| `updated_at` | timestamptz | No   | Último cambio                              |

Solo la escribe el disparador. Al compararla con la última fila se detecta que alguien borró los
eventos más recientes.

## aud_exports · Exportaciones

| Columna        | Tipo        | Nulo | Regla                                                         |
| -------------- | ----------- | ---- | ------------------------------------------------------------- |
| `id`           | uuid        | No   | Llave primaria                                                |
| `tenant_id`    | uuid        | No   | Empresa                                                       |
| `requested_by` | uuid        | No   | Quién exportó                                                 |
| `scope`        | jsonb       | No   | Filtros usados                                                |
| `row_count`    | integer     | No   | Eventos exportados (máximo 10.000 por exportación)            |
| `file_id`      | uuid        | Sí   | Archivo guardado; vacío hasta el servicio de archivos (B14)   |
| `exported_at`  | timestamptz | No   | Momento                                                       |

Índice: (`tenant_id`, `exported_at`).

## Funciones

| Función | Corre como | Qué hace |
| --- | --- | --- |
| `aud_verify_chain()` | quien la llama | Revisa la cadena de la empresa del contexto: cuántos eventos revisó y el primer daño, `missing` (falta o sobra un evento), `altered` (la fila no coincide con su hash), `broken_link` (no apunta al anterior) o `truncated` (se borraron los últimos) |
| `aud_ensure_partitions(desde, hasta)` | su dueño | Crea las particiones mensuales que falten. Si la partición por defecto ya tiene filas de un mes, no crea ese mes |
| `aud_tenant_ids()` | su dueño | Lista las empresas, para la verificación diaria; con una política de solo lectura sobre `core_tenants` |

**Verificación diaria**: el worker ejecuta `audit.chain-check` a las 3:00 a. m. (hora de Bogotá):
crea las particiones de los próximos tres meses y verifica cada empresa. Cada verificación deja
`audit.chain.verify`; un daño deja además el evento de seguridad `audit.chain.broken` (crítico) y
el trabajo termina fallido, sin reintento, para que la alerta de trabajos fallidos avise.

## Acciones registradas

Acciones registradas en B08: `iam.user.invite`, `iam.link.issue`, `iam.invitation.accept`,
`iam.session.create` (éxito y fallo), `iam.session.revoke` (salida y por inactividad),
`iam.user.lock`, `iam.password.reset_request`, `iam.password.reset` e `iam.password.change`.

Acciones de B09: `iam.mfa.verify` (éxito y fallo), `iam.mfa.setup_start`, `iam.mfa.setup_confirm`
(fallo), `iam.mfa.enable`, `iam.mfa.change`, `iam.mfa.disable`,
`iam.mfa.recovery_codes_regenerate`, `iam.session.reauthenticate` (éxito y fallo),
`iam.session.revoke` (cerrada desde otro equipo), `iam.session.revoke_others`, `iam.user.lock`
(por códigos equivocados) e `iam.user.reset_mfa` (comando del responsable técnico).

Acciones de B10: `iam.role.assign` (también al invitar y por comando), `iam.role.revoke`,
`iam.role.create`, `iam.role.update`, `iam.role.sync` (la semilla corrigió un rol del sistema),
`iam.delegation.create`, `iam.delegation.revoke`, `iam.user.invite` (ahora con quien invitó),
`iam.user.lock` e `iam.user.unlock` (por un administrador), `iam.user.reset_mfa` (desde la
pantalla), `iam.session.revoke_user`, `iam.session.revoke_all` e `iam.access_review.read` (cada
consulta del informe de revisión de accesos).

Acciones de B11: `core.tenant.create` (la semilla crea una empresa), `iam.permission.sync` (la
semilla agregó, corrigió o retiró permisos del catálogo; queda en la primera empresa), `iam.role.sync`
ahora también cuando la semilla crea un rol del sistema (`created`) o corrige su nombre, descripción o
público, `iam.user.invite` con
`changes.resent` (se reenvió una invitación), `audit.event.read` (cada consulta de eventos, de un
historial o de las exportaciones, con los filtros usados), `audit.security.read`,
`audit.event.export` (con los filtros y cuántos eventos) y `audit.chain.verify` (éxito o fallo,
por una persona o por el trabajo diario).

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

Eventos de seguridad de B10. Todo cambio de permisos deja uno, como pide el numeral 15.5 («alerta
de cada cambio de permisos»), con su alerta en la bandeja de salida:

| Tipo | Gravedad | Cuándo | Aviso por correo a la persona |
| --- | --- | --- | --- |
| `iam.permissions.changed` | medium | Se asignó o retiró un rol, se creó o editó un rol personalizado, se creó o retiró una delegación. `detail.action` dice cuál | Sí, al asignar o retirar sus roles («Cambiaron sus roles en ARZA ONE») |
| `iam.account.locked_by_admin` | high | Un administrador bloqueó la cuenta y cerró sus sesiones | No |
| `iam.sessions.revoked` | high | Un administrador cerró todas las sesiones de una persona | No |
| `iam.sessions.revoked_all` | high | Se cerraron todas las sesiones de la empresa (respuesta a incidentes, numeral 15.7) | No |
| `iam.mfa.reset` | high | Un administrador reinició el segundo factor desde la pantalla (además del comando de B09) | Sí, el mismo aviso de B09 |

Eventos de seguridad de B11:

| Tipo | Gravedad | Cuándo |
| --- | --- | --- |
| `audit.chain.broken` | critical | La verificación encontró un evento alterado, faltante o de más; `detail` dice el lugar y el problema |
