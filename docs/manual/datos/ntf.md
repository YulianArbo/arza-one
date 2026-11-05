# Diccionario de datos · Avisos, comentarios y adjuntos (ntf\_ y core\_)

Tipos exactos, restricciones e índices de las tablas de avisos, comentarios y adjuntos (capítulo
12.3, ficha 17.5). Se actualiza en el mismo pull request que cambia el modelo
(`apps/api/prisma/schema.prisma`). Migración: `20261017000000_ntf_notifications_comments_attachments`
(B16).

Las tablas de comentarios y adjuntos llevan el prefijo `core_` que les da el numeral 12.3, pero
las escribe el módulo de avisos (`apps/api/src/modules/ntf`), que expone sus rutas (numeral 14.3).

## Reglas comunes

- **Columnas de control** (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`,
  `deleted_at`): las fija el disparador `core_set_control_columns()`, igual que en el núcleo
  ([core.md](core.md)). `created_by` es quien comentó o adjuntó: con él se decide quién retira.
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las seis tablas.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`; en `ntf_templates` solo `SELECT` e
  `INSERT`: cada cambio de una plantilla agrega una versión. Sin `DELETE`: el borrado es lógico.
- **Personas, archivos y registros**: se guardan por identificador, sin llave foránea a las tablas
  de otros módulos; se consultan por el índice de `iam`, `doc`, `party` y `wf`.
- **Auditoría** (`aud_events`): `ntf.template.seed` (del sistema) · `ntf.template.update`,
  `ntf.notification.read` · `read_all`, `ntf.preference.update`, `ntf.comment.create` · `delete` y
  `ntf.attachment.create` · `delete`. Descargar un adjunto deja `doc.file.download_link` con
  `via: attachment`.
- **Entrega sin auditoría propia**: publicar un evento, crear los avisos que produce y anotar cada
  intento de correo son escrituras técnicas del worker (`notification_delivery` en
  `apps/api/src/platform/database/tenant-context.ts`): el hecho que se avisa ya quedó en la
  auditoría al ocurrir y `ntf_deliveries` es el registro de cada envío.
- **Bandeja de salida**: los comentarios con menciones emiten `comment.mentioned`
  (`comment_id`, `author_id`, `mention_ids`, `record_label`, `link`).

## Tipos de aviso

| Tipo              | Lo produce                                | A quién                                                  | Urgente al empezar |
| ----------------- | ----------------------------------------- | -------------------------------------------------------- | ------------------ |
| `task_assigned`   | `wf.task.assigned`                        | La persona asignada, salvo que se lo haya asignado ella  | No                 |
| `task_escalated`  | `wf.task.escalated`                       | El jefe inmediato al que se escaló                       | No                 |
| `comment_mention` | `comment.mentioned`                       | Cada colaborador mencionado                              | No                 |
| `security_alert`  | `security.alert`                          | Las personas con rol Administrador de plataforma o Dirección | Sí             |

Un evento que nadie consume se marca publicado sin avisos.

## ntf_templates · Plantillas de aviso

| Columna          | Tipo    | Nulo | Por defecto | Regla                                                                |
| ---------------- | ------- | ---- | ----------- | -------------------------------------------------------------------- |
| `id`             | uuid    | No   | UUID v7     | Llave primaria                                                       |
| `tenant_id`      | uuid    | No   |             | Empresa                                                              |
| `key`            | text    | No   |             | Tipo de aviso (tabla anterior)                                       |
| `version_number` | integer | No   |             | 1, 2, 3…; la vigente es la mayor. Único con `(tenant_id, key)`       |
| `channel`        | text    | No   | `email`     | Por ahora solo correo                                                |
| `subject`        | text    | No   |             | 3 a 150 caracteres; solo las variables del tipo, entre `{{ }}`       |
| `body`           | text    | No   |             | 10 a 2000 caracteres; solo las variables del tipo                    |
| `urgent`         | boolean | No   | `false`     | Excepción al envío diferido (PT-GTH-001); llega siempre por correo   |
| control          |         |      |             | Columnas de control                                                  |

## ntf_notifications · Avisos en la aplicación

| Columna      | Tipo        | Nulo | Regla                                                                         |
| ------------ | ----------- | ---- | ----------------------------------------------------------------------------- |
| `id`         | uuid        | No   | Llave primaria                                                                |
| `tenant_id`  | uuid        | No   | Empresa                                                                       |
| `user_id`    | uuid        | No   | A quién                                                                       |
| `event_id`   | uuid        | No   | Evento de la bandeja de salida. Único con `(tenant_id, user_id)`: no se duplica |
| `kind`       | text        | No   | Tipo de aviso                                                                 |
| `title`      | text        | No   | Asunto con la plantilla aplicada                                              |
| `body`       | text        | No   | Texto con la plantilla aplicada                                               |
| `link`       | text        | Sí   | Ruta de la aplicación, por ejemplo `/app/mis-tareas/{id}`                     |
| `deliver_at` | timestamptz | No   | Desde cuándo se ve: al instante o al inicio de la siguiente jornada           |
| `read_at`    | timestamptz | Sí   | Cuándo lo leyó                                                                |
| control      |             |      | Columnas de control                                                           |

Índice `(tenant_id, user_id, deliver_at)` para el centro de avisos.

## ntf_deliveries · Envíos por correo

| Columna               | Tipo        | Nulo | Regla                                                                    |
| --------------------- | ----------- | ---- | ------------------------------------------------------------------------ |
| `id`                  | uuid        | No   | Llave primaria                                                           |
| `tenant_id`           | uuid        | No   | Empresa                                                                  |
| `notification_id`     | uuid        | No   | El aviso que envía (llave foránea en la misma empresa)                   |
| `template_key`        | text        | No   | Tipo de aviso                                                            |
| `template_version`    | integer     | No   | Versión de la plantilla con que se escribió                              |
| `recipient`           | text        | No   | Correo de destino                                                        |
| `subject` · `body`    | text        | No   | El texto ya escrito; un reintento envía exactamente lo mismo             |
| `link`                | text        | Sí   | Ruta de la aplicación; el worker le antepone `APP_URL`                   |
| `status`              | text        | No   | `pending` → `sent` o `failed`; `sent` exige `sent_at`                    |
| `deliver_at`          | timestamptz | No   | Hora a la que debía salir                                                |
| `next_attempt_at`     | timestamptz | No   | Próximo intento; al enviarse se reserva 10 minutos                       |
| `attempts`            | integer     | No   | Intentos hechos; al quinto fallo queda `failed`                          |
| `provider_message_id` | text        | Sí   | Identificador que dio el servidor de correo                              |
| `sent_at`             | timestamptz | Sí   | Cuándo salió                                                             |
| `error`               | text        | Sí   | Último error, hasta 300 caracteres                                       |
| control               |             |      | Columnas de control                                                      |

Reintentos: 1, 5, 15 y 60 minutos.

## ntf_preferences · Preferencias

| Columna     | Tipo    | Nulo | Regla                                                              |
| ----------- | ------- | ---- | ------------------------------------------------------------------ |
| `id`        | uuid    | No   | Llave primaria                                                     |
| `tenant_id` | uuid    | No   | Empresa                                                            |
| `user_id`   | uuid    | No   | La persona                                                         |
| `event_key` | text    | No   | Tipo de aviso                                                      |
| `channel`   | text    | No   | `email`. Sin fila, el correo está activo                           |
| `enabled`   | boolean | No   | Si quiere el correo. Un aviso urgente llega aunque esté apagado    |
| control     |         |      | Columnas de control                                                |

Único `(tenant_id, user_id, event_key, channel)`. El horario personal de desconexión
(`quiet_hours` del numeral 12.3) no existe todavía: todos usan el horario laboral de la empresa.

## core_comments · Comentarios

| Columna       | Tipo        | Nulo | Regla                                                             |
| ------------- | ----------- | ---- | ----------------------------------------------------------------- |
| `id`          | uuid        | No   | Llave primaria                                                    |
| `tenant_id`   | uuid        | No   | Empresa                                                           |
| `entity_type` | text        | No   | `party` (tercero), `wf_instance` (trámite) o `ctr_contract` (B24) |
| `entity_id`   | uuid        | No   | El registro                                                       |
| `body`        | text        | No   | 1 a 4000 caracteres                                               |
| `visibility`  | text        | No   | `internal` por ahora; `public` llegará con el portal              |
| `mention_ids` | uuid[]      | No   | Hasta 10 colaboradores mencionados                                |
| control       |             |      | Columnas de control                                               |

El disparador `core_keep_comments()` impide cambiar el texto, el registro, las menciones o la
visibilidad, y que un comentario retirado vuelva. Índice `(tenant_id, entity_type, entity_id,
created_at)`.

## core_attachments · Adjuntos

| Columna       | Tipo | Nulo | Regla                                                         |
| ------------- | ---- | ---- | ------------------------------------------------------------- |
| `id`          | uuid | No   | Llave primaria                                                |
| `tenant_id`   | uuid | No   | Empresa                                                       |
| `entity_type` | text | No   | `party`, `wf_instance` o `ctr_contract` (B24)                 |
| `entity_id`   | uuid | No   | El registro                                                   |
| `file_id`     | uuid | No   | Archivo de `doc_files`, subido por quien adjunta y disponible |
| `label`       | text | No   | 1 a 120 caracteres                                            |
| control       |      |      | Columnas de control                                           |

## Quién ve y quién escribe

Lo decide el módulo dueño del registro (`apps/api/src/modules/ntf/application/record-access.ts`):

| Registro      | Para ver                              | Para comentar y adjuntar        |
| ------------- | ------------------------------------- | ------------------------------- |
| `party`       | `party.read` y ver el tercero         | `party.create` o `party.update` |
| `wf_instance` | `wf.task.work` o `wf.task.read_all` y ver el trámite | `wf.task.work`   |

Sin el permiso responde 403; si la persona no ve el registro, 404 `NTF_RECORD_NOT_FOUND`. Solo
quien escribió un comentario o adjuntó un archivo lo retira.

## Publicación y entrega

El worker corre el trabajo `ntf.dispatch` cada 15 segundos. Primero publica la bandeja de salida:
cada evento en su propia transacción, bloqueado con `FOR UPDATE SKIP LOCKED`, con sus avisos y la
marca de publicado juntos; si falla, queda pendiente con un intento más (máximo cinco). Después
envía los correos cuya hora llegó. Para saber qué empresas tienen trabajo usa
`ntf_tenants_with_pending_events()` y `ntf_tenants_with_due_deliveries(at)`, que solo devuelven
identificadores de empresa, como `wf_tenants_with_overdue_tasks` (B15).
