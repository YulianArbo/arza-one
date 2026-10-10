# Diccionario de datos · Núcleo (core\_)

Tipos exactos, restricciones e índices de las tablas del dominio `core_` (capítulo 12.3). Se
actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).

## Reglas comunes

- **Columnas de control** (todas las tablas): `created_at`, `created_by`, `updated_at`,
  `updated_by`, `version` y `deleted_at`. Las fija el disparador `core_set_control_columns()`:
  al crear, `version = 1` y el autor sale de `app.user_id`; al modificar, la versión sube en uno y se
  registra quién y cuándo. Los valores que envíe el código en esas columnas se ignoran y el `id` no
  se puede cambiar. `created_by` y `updated_by` quedan vacíos en procesos del sistema; su llave
  foránea a `iam_users` queda pendiente (ver el cierre de B08).
- **Seguridad por fila**: activada y forzada. Solo se ven y se escriben las filas de la empresa
  fijada en `app.tenant_id` (función `core_current_tenant_id()`). Sin contexto, ninguna.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`. Sin `DELETE`: el borrado es lógico.
- **Identificadores**: UUID versión 7 generados por la aplicación (ADR-021).
- **Fechas**: `timestamptz` en UTC.

## core_tenants · Empresas inquilinas

La política compara el propio `id` con la empresa del contexto: una empresa solo se ve a sí misma.

| Columna      | Tipo        | Nulo | Por defecto | Regla                                         |
| ------------ | ----------- | ---- | ----------- | --------------------------------------------- |
| `id`         | uuid        | No   | UUID v7     | Llave primaria                                |
| `legal_name` | text        | No   |             | Razón social; no vacía                        |
| `trade_name` | text        | Sí   |             | Nombre comercial                              |
| `tax_id`     | text        | No   |             | NIT; no vacío; único                          |
| `status`     | text        | No   | `active`    | `active`, `suspended` o `closed`              |
| `settings`   | jsonb       | No   | `{}`        | Ajustes de la empresa; debe ser un objeto     |
| `created_at` | timestamptz | No   | ahora       | Control                                       |
| `created_by` | uuid        | Sí   |             | Control                                       |
| `updated_at` | timestamptz | No   | ahora       | Control                                       |
| `updated_by` | uuid        | Sí   |             | Control                                       |
| `version`    | integer     | No   | 1           | Control; mayor que cero                       |
| `deleted_at` | timestamptz | Sí   |             | Borrado lógico                                |

Índices: llave primaria (`id`) y único (`tax_id`).

## core_outbox_events · Bandeja de salida

Eventos de dominio guardados en la misma transacción que el dato que los origina (numeral 13.2).
El worker los publica a partir de B06.

| Columna          | Tipo        | Nulo | Por defecto | Regla                                                     |
| ---------------- | ----------- | ---- | ----------- | --------------------------------------------------------- |
| `id`             | uuid        | No   | UUID v7     | Llave primaria; identificador único del evento            |
| `tenant_id`      | uuid        | No   |             | Empresa; llave foránea a `core_tenants` (sin borrado)     |
| `event_type`     | text        | No   |             | Formato `dominio.evento` en minúsculas (numeral 13.3)     |
| `schema_version` | integer     | No   | 1           | Versión del esquema del evento; mayor que cero            |
| `payload`        | jsonb       | No   |             | Datos mínimos del evento; debe ser un objeto              |
| `actor_id`       | uuid        | Sí   |             | Usuario que originó el evento                             |
| `occurred_at`    | timestamptz | No   | ahora       | Momento del hecho                                         |
| `published_at`   | timestamptz | Sí   |             | Vacío mientras no se haya publicado                       |
| `attempts`       | integer     | No   | 0           | Intentos de publicación; cero o más                       |
| `created_at` … `deleted_at` |  |      |             | Columnas de control (ver reglas comunes)                  |

Índices: llave primaria (`id`) y (`tenant_id`, `occurred_at`).

## Organización, catálogos, consecutivos, parámetros y festivos (B12)

Todas tienen además las columnas de control, `tenant_id` (llave foránea a `core_tenants`),
seguridad por fila y borrado lógico (`deleted_at`). Las llaves foráneas entre tablas de una misma
empresa son compuestas (`tenant_id`, `id`): un registro nunca apunta a uno de otra empresa.

### core_sites · Sedes

| Columna     | Tipo    | Nulo | Por defecto | Regla                                                      |
| ----------- | ------- | ---- | ----------- | ---------------------------------------------------------- |
| `name`      | text    | No   |             | De 2 a 120 caracteres                                      |
| `city`      | text    | No   |             | De 2 a 120 caracteres                                      |
| `address`   | text    | No   |             | De 5 a 200 caracteres                                      |
| `is_main`   | boolean | No   | `false`     | Sede principal. Solo una por empresa (lo garantiza la API) |
| `is_active` | boolean | No   | `true`      | La principal no se inactiva                                |

Índice: (`tenant_id`).

### core_org_units · Procesos y áreas

| Columna             | Tipo    | Nulo | Por defecto | Regla                                                                    |
| ------------------- | ------- | ---- | ----------- | ------------------------------------------------------------------------ |
| `parent_id`         | uuid    | Sí   |             | Proceso o área de la que depende; nunca ella misma ni un ciclo           |
| `code`              | text    | No   |             | Mayúsculas, números y guiones; único por empresa, también eliminados     |
| `name`              | text    | No   |             | De 2 a 120 caracteres                                                    |
| `kind`              | text    | No   |             | `process` o `area`                                                       |
| `owner_position_id` | uuid    | Sí   |             | Cargo líder (`core_positions`)                                           |
| `is_active`         | boolean | No   | `true`      | Con registros asociados no se elimina: se inactiva                       |

Índices: únicos (`tenant_id`, `id`) y (`tenant_id`, `code`); (`tenant_id`, `parent_id`) y
(`tenant_id`, `owner_position_id`).

### core_positions · Cargos del organigrama

| Columna         | Tipo    | Nulo | Por defecto | Regla                                                       |
| --------------- | ------- | ---- | ----------- | ----------------------------------------------------------- |
| `org_unit_id`   | uuid    | No   |             | Proceso o área del cargo                                    |
| `name`          | text    | No   |             | De 2 a 120 caracteres                                       |
| `reports_to_id` | uuid    | Sí   |             | Cargo al que reporta; vacío en la cabeza; nunca un ciclo    |
| `is_active`     | boolean | No   | `true`      | Con personas, subordinados o procesos a cargo no se elimina |

Índices: único (`tenant_id`, `id`); (`tenant_id`, `org_unit_id`) y (`tenant_id`, `reports_to_id`).
`iam_users.position_id` apunta aquí (llave foránea agregada en B12). El enlace al manual de
funciones de cada cargo llega con la gestión documental (M03).

### core_cost_centers · Centros de costo

| Columna       | Tipo    | Nulo | Por defecto | Regla                                      |
| ------------- | ------- | ---- | ----------- | ------------------------------------------ |
| `code`        | text    | No   |             | Como el de los procesos; único por empresa |
| `name`        | text    | No   |             | De 2 a 120 caracteres                      |
| `org_unit_id` | uuid    | Sí   |             | Proceso o área al que pertenece            |
| `is_active`   | boolean | No   | `true`      |                                            |

Índices: único (`tenant_id`, `code`); (`tenant_id`, `org_unit_id`).

### core_catalogs y core_catalog_items · Catálogos administrables

El sistema crea los catálogos (`key` como `identification_types`); la empresa administra sus
opciones. Una opción no se borra: se inactiva.

| Columna (catálogo) | Tipo | Nulo | Regla                                       |
| ------------------ | ---- | ---- | ------------------------------------------- |
| `key`              | text | No   | Minúsculas, números y guiones bajos; única  |
| `name`             | text | No   | De 2 a 120 caracteres                       |
| `description`      | text | Sí   |                                             |

| Columna (opción) | Tipo    | Nulo | Por defecto | Regla                                          |
| ---------------- | ------- | ---- | ----------- | ---------------------------------------------- |
| `catalog_id`     | uuid    | No   |             | Catálogo de la misma empresa                   |
| `code`           | text    | No   |             | Mayúsculas, números, guiones; único en el catálogo |
| `label`          | text    | No   |             | De 2 a 120 caracteres                          |
| `sort_order`     | integer | No   | `0`         | Entre 0 y 9999                                 |
| `is_active`      | boolean | No   | `true`      | Inactiva: deja de ofrecerse en los formularios |

### core_sequences · Consecutivos de negocio (ADR-021)

Una fila por tipo y año. El código es `PREFIJO-AAAA-NNNN`; el año es el de Colombia.

| Columna      | Tipo    | Nulo | Por defecto | Regla                                         |
| ------------ | ------- | ---- | ----------- | --------------------------------------------- |
| `key`        | text    | No   |             | Como `crm.quote`; hasta 60 caracteres         |
| `name`       | text    | No   |             | De 2 a 120 caracteres                         |
| `prefix`     | text    | No   |             | De 2 a 6 letras mayúsculas                    |
| `year`       | integer | No   |             | Entre 2000 y 2100                             |
| `next_value` | integer | No   | `1`         | Número del siguiente registro; mayor que cero |
| `padding`    | integer | No   | `4`         | Dígitos del número, entre 3 y 8               |

Índice único (`tenant_id`, `key`, `year`). `next_value` solo lo sube `nextBusinessCode()` con un
`UPDATE ... RETURNING` que bloquea la fila hasta el final de la transacción de quien pide el
número: otra petición espera y recibe el siguiente; si la transacción se revierte, el número no
se gasta. El primer número de un año nuevo copia el prefijo y los dígitos del año anterior.

### core_parameters · Parámetros con vigencia

| Columna      | Tipo  | Nulo | Regla                                                           |
| ------------ | ----- | ---- | --------------------------------------------------------------- |
| `key`        | text  | No   | Como `work.schedule`; definida en `packages/contracts`          |
| `value`      | jsonb | No   | Objeto; validado con el esquema Zod de la clave                 |
| `valid_from` | date  | No   | Primer día de la vigencia                                       |
| `valid_to`   | date  | Sí   | Último día; vacío en la vigente. Mayor o igual que `valid_from` |

Índice único (`tenant_id`, `key`, `valid_from`). El disparador `core_parameters_keep_history`
impide cambiar la clave, el valor o el inicio de una vigencia, cerrarla dos veces o borrarla: un
parámetro nunca se sobrescribe. Parámetro de hoy: `work.schedule` (días de la semana y dos
jornadas; sembrado de lunes a viernes, 8:00 a 12:00 y 13:00 a 17:00).

### core_holidays · Festivos

| Columna        | Tipo | Nulo | Regla                 |
| -------------- | ---- | ---- | --------------------- |
| `holiday_date` | date | No   | Única por empresa     |
| `name`         | text | No   | De 2 a 120 caracteres |

Un festivo quitado queda con `deleted_at` y se recupera si se vuelve a agregar la misma fecha. La
semilla carga los festivos de Colombia de 2025 a 2030 (Ley 51 de 1983); un año que ya tiene
festivos no se vuelve a cargar.
