# Diccionario de datos · Flujos y tareas (wf\_)

Tipos exactos, restricciones e índices de las tablas del dominio `wf_` (capítulo 12.3, ficha
17.5, ADR-011). Se actualiza en el mismo pull request que cambia el modelo
(`apps/api/prisma/schema.prisma`). Migración: `20261016000000_wf_workflows_and_tasks` (B15).

`wf_sla_policies` (acuerdos de tiempo por prioridad del capítulo 12.3) llega con la mesa de ayuda
(M08), que es quien la usa. Las tablas `ntf_` de avisos llegan con B16.

## Reglas comunes

- **Columnas de control** (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`,
  `deleted_at`): las fija el disparador `core_set_control_columns()`, igual que en el núcleo
  ([core.md](core.md)). La columna `version` es la versión del registro (If-Match); la versión de
  un flujo es `version_number`.
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las siete tablas.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`; en `wf_history` y `wf_approvals` solo
  `SELECT` e `INSERT`: el historial y las decisiones nunca se modifican ni se borran. Sin `DELETE`
  en ninguna: el borrado es lógico.
- **Personas**: se guardan por identificador (`*_id`, `*_by`, `on_behalf_of`), sin llave foránea a
  `iam_users`: el motor consulta a las personas por el índice del módulo `iam`.
- **Auditoría**: `wf.definition.create · update · publish · new_version`, `wf.instance.start ·
transition` y `wf.task.start · complete · approve · reject · delegate · reassign · escalate` (este
  último del sistema) en `aud_events`.
- **Bandeja de salida**: `wf.instance.started`, `wf.instance.transitioned`, `wf.task.assigned` y
  `wf.task.escalated`, con identificadores, nunca datos personales.

## wf_definitions · Definiciones de flujo

Una versión de un flujo. El borrador se edita; publicar lo vuelve la versión vigente y retira la
anterior.

| Columna          | Tipo        | Nulo | Por defecto | Regla                                                                                  |
| ---------------- | ----------- | ---- | ----------- | -------------------------------------------------------------------------------------- |
| `id`             | uuid        | No   | UUID v7     | Llave primaria                                                                         |
| `tenant_id`      | uuid        | No   |             | Empresa                                                                                |
| `key`            | text        | No   |             | Clave estable del flujo, como `doc.change_request`; igual en todas sus versiones       |
| `version_number` | integer     | No   |             | 1, 2, 3… Única con `tenant_id` y `key`                                                 |
| `name`           | text        | No   |             | Nombre que ven las personas                                                            |
| `description`    | text        | Sí   |             |                                                                                        |
| `entity_type`    | text        | No   |             | Tipo de registro que sigue el flujo                                                    |
| `status`         | text        | No   | `draft`     | `draft`, `published` (la vigente, el `is_active` del capítulo 12.3) o `retired`        |
| `published_at`   | timestamptz | Sí   |             | Obligatoria si no es borrador                                                          |
| `published_by`   | uuid        | Sí   |             | Quien la publicó                                                                       |
| control          |             |      |             | Columnas de control                                                                    |

Disparador `wf_keep_published_definitions`: una versión publicada o retirada no cambia su clave,
número, tipo, nombre, descripción ni fecha de publicación, y no vuelve a borrador. Una sola
versión publicada y un solo borrador por clave: lo garantiza el caso de uso bloqueando las
versiones de la clave (`SELECT … FOR UPDATE`).

## wf_states · Estados

| Columna         | Tipo    | Nulo | Por defecto | Regla                                                                                           |
| --------------- | ------- | ---- | ----------- | ----------------------------------------------------------------------------------------------- |
| `id`            | uuid    | No   | UUID v7     | Llave primaria                                                                                  |
| `tenant_id`     | uuid    | No   |             | Empresa                                                                                         |
| `definition_id` | uuid    | No   |             | Versión del flujo (llave foránea con `tenant_id`)                                               |
| `position`      | integer | No   |             | Orden en el editor                                                                              |
| `key`           | text    | No   |             | Única por versión; minúsculas, números y guion bajo                                             |
| `label`         | text    | No   |             | Nombre del estado                                                                               |
| `kind`          | text    | No   |             | `initial`, `normal`, `approval` o `final`                                                       |
| `sla_hours`     | integer | Sí   |             | Plazo en horas hábiles para salir del estado (1 a 2000)                                         |
| `priority`      | text    | No   | `normal`    | `low`, `normal`, `high` o `urgent`; la heredan sus tareas                                       |
| `assignee`      | jsonb   | Sí   |             | Quién lo atiende: `{"type":"initiator"}`, `{"type":"supervisor"}` o `{"type":"role","role":…}` |
| `approval`      | jsonb   | Sí   |             | Solo en `approval` (y obligatorio): `{"mode":"serial"\|"parallel","approvers":[…]}`             |
| control         |         |      |             | Columnas de control                                                                             |

## wf_transitions · Transiciones permitidas

| Columna               | Tipo    | Nulo | Por defecto | Regla                                                                                      |
| --------------------- | ------- | ---- | ----------- | ------------------------------------------------------------------------------------------ |
| `id`                  | uuid    | No   | UUID v7     | Llave primaria                                                                             |
| `tenant_id`           | uuid    | No   |             | Empresa                                                                                    |
| `definition_id`       | uuid    | No   |             | Versión del flujo                                                                          |
| `position`            | integer | No   |             | Orden en el editor                                                                         |
| `from_state`          | text    | No   |             | Clave del estado de origen                                                                 |
| `to_state`            | text    | No   |             | Clave del estado de destino                                                                |
| `action`              | text    | No   |             | Clave de la acción; única con `definition_id` y `from_state`                               |
| `label`               | text    | No   |             | Nombre del botón                                                                           |
| `required_permission` | text    | Sí   |             | Permiso del anexo G que exige; vacío: quien atiende el paso                                |
| `condition`           | jsonb   | Sí   |             | Reglas `{"fact","op","value"}` que deben cumplirse todas; `op` es `eq`, `neq`, `gt`, `gte`, `lt`, `lte` o `in` |
| `requires_comment`    | boolean | No   | false       | Pide comentario                                                                            |
| control               |         |      |             | Columnas de control                                                                        |

Disparador `wf_only_draft_parts`: los estados y transiciones solo se escriben mientras su versión
es un borrador. Al editar un borrador, los que salen quedan con `deleted_at`.

## wf_instances · Trámites

| Columna         | Tipo        | Nulo | Por defecto | Regla                                                            |
| --------------- | ----------- | ---- | ----------- | ---------------------------------------------------------------- |
| `id`            | uuid        | No   | UUID v7     | Llave primaria                                                   |
| `tenant_id`     | uuid        | No   |             | Empresa                                                          |
| `definition_id` | uuid        | No   |             | La versión con la que inició; no cambia                          |
| `entity_type`   | text        | No   |             | Tipo del registro                                                |
| `entity_id`     | uuid        | No   |             | Registro del módulo dueño; un solo trámite abierto por registro  |
| `title`         | text        | No   |             | Asunto que ven las personas                                      |
| `current_state` | text        | No   |             | Clave del estado actual                                          |
| `facts`         | jsonb       | No   | `{}`        | Datos del registro para las condiciones, como `{"amount":6000000}` |
| `started_by`    | uuid        | Sí   |             | Quien lo inició                                                  |
| `started_at`    | timestamptz | No   |             |                                                                  |
| `due_at`        | timestamptz | Sí   |             | Vencimiento del estado actual                                    |
| `completed_at`  | timestamptz | Sí   |             | Cuándo llegó a un estado final                                   |
| control         |             |      |             | Columnas de control (`version` sirve para mover el trámite sin carreras) |

## wf_history · Historial

Un paso por fila: el inicio (`action = 'start'`, sin `from_state`) y cada transición. Solo se
agrega.

| Columna        | Tipo        | Nulo | Regla                                   |
| -------------- | ----------- | ---- | --------------------------------------- |
| `id`           | uuid        | No   | Llave primaria                          |
| `tenant_id`    | uuid        | No   | Empresa                                 |
| `instance_id`  | uuid        | No   | Trámite                                 |
| `from_state`   | text        | Sí   | Estado de origen                        |
| `to_state`     | text        | No   | Estado de destino                       |
| `action`       | text        | No   | Acción                                  |
| `actor_id`     | uuid        | Sí   | Quién; vacío si fue el sistema          |
| `on_behalf_of` | uuid        | Sí   | A nombre de quién, por una delegación   |
| `comment`      | text        | Sí   | Comentario                              |
| `occurred_at`  | timestamptz | No   | Cuándo                                  |
| control        |             |      | Columnas de control                     |

## wf_tasks · Tareas

| Columna               | Tipo        | Nulo | Por defecto | Regla                                                                                      |
| --------------------- | ----------- | ---- | ----------- | ------------------------------------------------------------------------------------------ |
| `id`                  | uuid        | No   | UUID v7     | Llave primaria                                                                             |
| `tenant_id`           | uuid        | No   |             | Empresa                                                                                    |
| `instance_id`         | uuid        | No   |             | Trámite                                                                                    |
| `entry_id`            | uuid        | No   |             | Paso del historial que entró al estado: separa las decisiones si el flujo vuelve al estado |
| `state_key`           | text        | No   |             | Estado al que pertenece                                                                    |
| `title`               | text        | No   |             | «Estado: asunto»                                                                           |
| `kind`                | text        | No   |             | `action` (atender) o `approval` (aprobar)                                                  |
| `sequence`            | integer     | No   | 0           | Lugar del aprobador en la lista                                                            |
| `assignee_id`         | uuid        | Sí   |             | Responsable                                                                                |
| `assignee_role`       | text        | Sí   |             | Rol que la atiende mientras nadie la toma                                                  |
| `required_permission` | text        | Sí   |             | Permiso de la aprobación, el que cubren las delegaciones de B10                            |
| `priority`            | text        | No   | `normal`    | `low`, `normal`, `high` o `urgent`                                                         |
| `due_at`              | timestamptz | Sí   |             | Vencimiento en horas hábiles                                                               |
| `status`              | text        | No   | `pending`   | `pending` → `in_progress` → `completed`, `overdue` o `cancelled`; una vencida sigue abierta |
| `started_at`          | timestamptz | Sí   |             | Cuándo se tomó                                                                             |
| `completed_at`        | timestamptz | Sí   |             | Obligatoria si está completada o cancelada                                                 |
| `completed_by`        | uuid        | Sí   |             | Quién la cerró                                                                             |
| `delegated_from_id`   | uuid        | Sí   |             | Quién la delegó                                                                            |
| `escalated_to_id`     | uuid        | Sí   |             | Jefe inmediato a quien escaló; vacío si no tenía jefe                                      |
| `escalated_at`        | timestamptz | Sí   |             | Cuándo escaló                                                                              |
| control               |             |      |             | Columnas de control                                                                        |

Política `wf_tasks_overdue_lookup` y función `wf_tenants_with_overdue_tasks(at)`: el worker
obtiene solo los identificadores de las empresas con tareas vencidas; luego trabaja en cada una
con su contexto, como la API (igual que `aud_tenant_ids`, B11).

## wf_approvals · Decisiones de aprobación

Una decisión por tarea. Solo se agrega.

| Columna        | Tipo        | Nulo | Regla                                 |
| -------------- | ----------- | ---- | ------------------------------------- |
| `id`           | uuid        | No   | Llave primaria                        |
| `tenant_id`    | uuid        | No   | Empresa                               |
| `task_id`      | uuid        | No   | Tarea; única                          |
| `approver_id`  | uuid        | No   | Quién decidió                         |
| `on_behalf_of` | uuid        | Sí   | A nombre de quién, por una delegación |
| `decision`     | text        | No   | `approved` o `rejected`               |
| `comment`      | text        | Sí   | Obligatorio al rechazar (contrato)    |
| `decided_at`   | timestamptz | No   | Cuándo                                |
| control        |             |      | Columnas de control                   |
