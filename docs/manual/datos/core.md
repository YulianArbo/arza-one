# Diccionario de datos · Núcleo (core\_)

Tipos exactos, restricciones e índices de las tablas del dominio `core_` (capítulo 12.3). Se
actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).

## Reglas comunes

- **Columnas de control** (todas las tablas): `created_at`, `created_by`, `updated_at`,
  `updated_by`, `version` y `deleted_at`. Las fija el disparador `core_set_control_columns()`:
  al crear, `version = 1` y el autor sale de `app.user_id`; al modificar, la versión sube en uno y se
  registra quién y cuándo. Los valores que envíe el código en esas columnas se ignoran y el `id` no
  se puede cambiar. `created_by` y `updated_by` quedan vacíos en procesos del sistema; su llave
  foránea a `iam_users` se agrega en B08.
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
