# Diccionario de datos · Servicio al cliente (svc\_ y wf_sla_policies)

Tipos exactos, restricciones e índices de las tablas de la mesa de ayuda (ficha 17.9, numeral
12.4). Se actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).
Migraciones: `20261107000000_svc_tickets_sla_warranties_compensations` (B28) y
`20261108000000_svc_pqrsf_surveys_kb` (B29: PQRSF, encuestas, base de conocimiento y el correo de
quien reporta en `svc_tickets`).

## Reglas comunes

- **Alcance (B28)**: tiquetes con niveles, prioridades y acuerdos de tiempo cuyo reloj se pausa en
  espera del cliente; alerta al 80 % del plazo; escalamiento; conversación con mensajes públicos y
  notas internas; garantías por entregable y compensaciones técnicas RE-SAC-001.
- **Alcance (B29)**: PQRSF con radicado, acuse, plazo en días hábiles, respuesta aprobada por otra
  persona y traslado a Privacidad o a Calidad; encuestas de satisfacción y NPS; base de
  conocimiento. El portal del cliente llega con el B30.
- **Columnas de control** en las cinco tablas: las fija `core_set_control_columns()`
  ([core.md](core.md)).
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las cinco tablas.
  `svc_tickets` tiene además la política de solo lectura `svc_tickets_worker_lookup` para
  `migration_user`, que usa la función `svc_tenants_with_sla_work(at)` del worker.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`; sin `DELETE`. La conversación
  (`svc_ticket_messages`) solo `SELECT` e `INSERT`: un mensaje no se edita ni se borra.
- **Otros módulos**: el cliente (`party_id`), el proyecto (`project_id`), el entregable
  (`deliverable_id`) y las personas (`requester_id`, `assignee_id`, `author_id`, `proposed_by`,
  `approved_by`) se guardan por identificador, sin llave a tablas de otros módulos (numeral 8.3).
  La mesa de ayuda los lee por los índices de Terceros, Proyectos e Identidad.
- **`wf_sla_policies`**: el capítulo 12.3 la ubica con los flujos (`wf_`), pero su dueño es la mesa
  de ayuda, que es quien la usa ([wf.md](wf.md)).
- **Auditoría** (`aud_events`): `service.ticket.create` · `update` · `assign` · `escalate` ·
  `start` · `wait` · `resume` · `resolve` · `reopen` · `close` · `message`, `service.ticket.warn` ·
  `breach` (del sistema), `service.sla.create` (el acuerdo de fábrica que faltaba) · `update`,
  `service.warranty.start` (al aceptar el entregable)
  · `update` y `service.compensation.propose` · `approve` · `reject` · `apply`.
- **Bandeja de salida**: `service.ticket.created` · `updated` · `assigned` · `escalated` ·
  `started` · `paused` · `resumed` · `resolved` (para la encuesta del B29) · `reopened` · `closed`
  · `messaged` · `warned` · `breached`, `service.sla.created` · `updated`, `service.warranty.started` ·
  `updated` y `service.compensation.proposed` · `approved` (para Facturación, B31) · `rejected` ·
  `applied`. Con identificadores y códigos, nunca datos personales.
- **Avisos** (B16): `svc_ticket_update` (asignado, escalado, reabierto, resuelto, compensación por
  decidir o decidida) y `svc_ticket_alert` (80 % del plazo, plazo vencido y tiquete
  crítico, protocolo PT-TEC-003). Es urgente: llega aunque sea fuera de la jornada (decisión del dueño
  del producto, 06/11/2026). Administración › Plantillas puede quitarle la marca.

## El reloj del acuerdo de servicio

El plazo se lleva en **minutos del calendario del acuerdo**: horas hábiles (jornadas del horario
laboral, sin fines de semana ni festivos) o corridas las 24 horas. `sla_consumed_minutes` guarda
lo que ya corrió hasta la última pausa y `sla_resumed_at`, desde cuándo vuelve a correr. Al pausar
(«en espera del cliente») se suma lo corrido y los vencimientos quedan vacíos; al reanudar se
calculan desde ese momento con lo que queda. `warn_at` es el 80 % del plazo de solución. Cambiar
la prioridad conserva lo consumido y recalcula con el acuerdo nuevo. El worker revisa cada cinco
minutos: marca `warned_at` y `breached_at` una sola vez y cierra los resueltos cuyo
`auto_close_at` (fin del quinto día hábil) ya pasó.

## wf_sla_policies · Acuerdos de tiempo

| Columna                | Tipo         | Nulo | Por defecto | Regla                                                       |
| ---------------------- | ------------ | ---- | ----------- | ----------------------------------------------------------- |
| `id`                   | uuid         | No   | UUID v7     | Llave primaria                                              |
| `tenant_id`            | uuid         | No   |             | Empresa                                                     |
| `priority`             | text         | No   |             | `critical`, `high`, `medium` o `low`; única por empresa     |
| `first_response_hours` | numeric(6,2) | No   |             | Mayor que cero                                              |
| `resolution_hours`     | numeric(6,2) | No   |             | Hasta 2000 y no menor que la primera respuesta              |
| `calendar`             | text         | No   | `business`  | `business` (horas hábiles) o `continuous` (corrido)         |
| control                |              |      |             | Columnas de control                                         |

Cada empresa nace con: crítica 1 h / 4 h corridas; alta 4 h / 16 h, media 8 h / 40 h y baja 16 h
/ 80 h hábiles (decisión 2 del B28). Si falta alguno, la mesa de ayuda lo crea al usarlo.

## svc_tickets · Tiquetes (FT-SAC-001)

| Columna                | Tipo        | Nulo | Por defecto | Regla                                                                  |
| ---------------------- | ----------- | ---- | ----------- | ---------------------------------------------------------------------- |
| `id`                   | uuid        | No   | UUID v7     | Llave primaria                                                         |
| `tenant_id`            | uuid        | No   |             | Empresa                                                                |
| `code`                 | text        | No   |             | `TIQ-AAAA-NNNN` del servicio de consecutivos; único por empresa        |
| `subject`              | text        | No   |             | 3 a 160 letras                                                         |
| `description`          | text        | No   |             | 3 a 8000 letras                                                        |
| `category`             | text        | No   |             | `support`, `incident`, `change`, `question`, `platform` u `other`      |
| `priority`             | text        | No   |             | Como en `wf_sla_policies`                                              |
| `level`                | smallint    | No   | 1           | 1 a 3 (N1 Servicio, N2 técnico, N3 especialista o proveedor)           |
| `channel`              | text        | No   | `internal`  | `internal`, `email`, `phone` o `portal` (B30)                          |
| `status`               | text        | No   | `new`       | `new`, `assigned`, `in_progress`, `waiting_customer`, `resolved`, `closed` |
| `party_id`             | uuid        | Sí   |             | Cliente de Terceros; vacío si es interno                               |
| `requester_id`         | uuid        | Sí   |             | Colaborador que lo pidió (quien solo registra lo propio)               |
| `requester_name`       | text        | Sí   |             | Quién reporta en el cliente                                            |
| `project_id`           | uuid        | Sí   |             | Proyecto del cliente                                                   |
| `deliverable_id`       | uuid        | Sí   |             | Entregable del proyecto; exige `project_id`                            |
| `warranty_id`          | uuid        | Sí   |             | Garantía vigente del entregable al registrarlo (llave a `svc_warranties`) |
| `assignee_id`          | uuid        | Sí   |             | Responsable; obligatorio desde «asignado»                              |
| `sla_policy_id`        | uuid        | No   |             | Acuerdo de su prioridad (llave a `wf_sla_policies`)                    |
| `sla_consumed_minutes` | integer     | No   | 0           | Plazo ya consumido hasta la última pausa                               |
| `sla_resumed_at`       | timestamptz | Sí   |             | Desde cuándo corre; lleno solo en `new`, `assigned` e `in_progress`    |
| `response_due_at`      | timestamptz | Sí   |             | Vence la primera respuesta                                             |
| `resolution_due_at`    | timestamptz | Sí   |             | Vence la solución; vacío en pausa                                      |
| `warn_at`              | timestamptz | Sí   |             | 80 % del plazo de solución; vacío en pausa                             |
| `first_response_at`    | timestamptz | Sí   |             | Primer mensaje público del equipo (decisión 6)                         |
| `paused_at`            | timestamptz | Sí   |             | Lleno solo en `waiting_customer`                                       |
| `warned_at`            | timestamptz | Sí   |             | Cuándo se alertó el 80 %                                               |
| `breached_at`          | timestamptz | Sí   |             | Cuándo venció el plazo de solución                                     |
| `resolved_at`          | timestamptz | Sí   |             | Lleno en `resolved` y `closed`                                         |
| `resolution`           | text        | Sí   |             | Cómo se resolvió; lleno en `resolved` y `closed`                       |
| `auto_close_at`        | timestamptz | Sí   |             | Cierre automático; lleno solo en `resolved`                            |
| `closed_at`            | timestamptz | Sí   |             | Lleno solo en `closed`                                                 |
| control                |             |      |             | Columnas de control                                                    |

Índices: `(tenant_id, status)`, `(tenant_id, assignee_id)`, `(tenant_id, requester_id)`,
`(tenant_id, warn_at)`, `(tenant_id, resolution_due_at)`. La regla `svc_tickets_status_check`
amarra cada estado con sus fechas.

## svc_ticket_messages · Conversación

| Columna       | Tipo    | Nulo | Por defecto | Regla                                                       |
| ------------- | ------- | ---- | ----------- | ----------------------------------------------------------- |
| `id`          | uuid    | No   | UUID v7     | Llave primaria                                              |
| `tenant_id`   | uuid    | No   |             | Empresa                                                     |
| `ticket_id`   | uuid    | No   |             | Tiquete (llave con `tenant_id`)                             |
| `author_id`   | uuid    | Sí   |             | Quien lo escribió; vacío si lo dejó el sistema              |
| `body`        | text    | No   |             | 1 a 8000 letras                                             |
| `is_internal` | boolean | No   | false       | Nota interna: la ven solo quienes ven todos los tiquetes    |
| `from_client` | boolean | No   | false       | Lo que respondió el cliente; no puede ser nota interna      |
| control       |         |      |             | Columnas de control                                         |

## svc_warranties · Garantías por entregable

| Columna          | Tipo | Nulo | Por defecto | Regla                                                   |
| ---------------- | ---- | ---- | ----------- | ------------------------------------------------------- |
| `id`             | uuid | No   | UUID v7     | Llave primaria                                          |
| `tenant_id`      | uuid | No   |             | Empresa                                                 |
| `project_id`     | uuid | No   |             | Proyecto del entregable                                 |
| `deliverable_id` | uuid | No   |             | Entregable aceptado; una garantía por entregable        |
| `party_id`       | uuid | Sí   |             | Cliente del proyecto                                    |
| `starts_on`      | date | No   |             | Día de la aceptación (hora de Colombia)                 |
| `ends_on`        | date | No   |             | 90 días después por defecto; no antes de `starts_on`    |
| `scope`          | text | No   |             | Qué cubre, 3 a 2000 letras                              |
| control          |      |      |             | Columnas de control                                     |

Nace en la misma transacción en que Proyectos deja aceptado el entregable (con firma o
tácitamente), por el oyente `onDeliverableAccepted` del índice de Proyectos.

## svc_compensations · Compensaciones técnicas (RE-SAC-001)

| Columna         | Tipo          | Nulo | Por defecto | Regla                                                         |
| --------------- | ------------- | ---- | ----------- | ------------------------------------------------------------- |
| `id`            | uuid          | No   | UUID v7     | Llave primaria                                                |
| `tenant_id`     | uuid          | No   |             | Empresa                                                       |
| `ticket_id`     | uuid          | No   |             | Tiquete (llave con `tenant_id`)                               |
| `type`          | text          | No   |             | `discount`, `support_hours` o `service_extension`             |
| `amount`        | numeric(18,2) | Sí   |             | Pesos; solo en `discount`                                     |
| `hours`         | numeric(6,2)  | Sí   |             | Solo en `support_hours`                                       |
| `days`          | smallint      | Sí   |             | Solo en `service_extension`                                   |
| `reason`        | text          | No   |             | 3 a 2000 letras                                               |
| `status`        | text          | No   | `proposed`  | `proposed`, `approved`, `rejected` o `applied`                |
| `proposed_by`   | uuid          | No   |             | Quien la propuso                                              |
| `approved_by`   | uuid          | Sí   |             | Quien la decidió; nunca quien la propuso                      |
| `decided_at`    | timestamptz   | Sí   |             | Lleno desde que se decide                                     |
| `decision_note` | text          | Sí   |             | Comentario de quien decide                                    |
| `applied_on`    | date          | Sí   |             | Lleno solo en `applied`                                       |
| control         |               |      |             | Columnas de control                                           |

`svc_tickets.requester_email` (B29, texto opcional de 3 a 254 letras): correo de quien reporta en el
cliente; allí llega la encuesta al resolver el tiquete si no lo pidió un usuario de la plataforma.

## Reglas del B29

- **Seguridad por fila**: activada y forzada en `svc_pqrsf`, `svc_surveys`, `svc_survey_responses`
  y `svc_kb_articles`. Sin `DELETE` para `app_user`.
- **Búsquedas sin empresa**: `core_tenant_by_tax_id(nit)` (la empresa del sitio público, variable
  `PUBLIC_SITE_TAX_ID`) y `svc_find_survey_link(huella)` (la invitación de la llave del correo)
  corren como dueñas del esquema y devuelven solo identificadores. `svc_tenants_with_care_work(hoy)`
  dice al worker qué empresas tienen correos por enviar o PQRSF que llegaron a un aviso de plazo;
  usan las políticas de solo lectura `svc_pqrsf_worker_lookup` y
  `svc_survey_responses_link_lookup` para `migration_user`.
- **Plazos**: parámetro con vigencia `service.pqrsf_terms` ([core.md](core.md)); por omisión
  petición, queja y reclamo 15, sugerencia y felicitación 30, consulta sobre datos personales 10 y
  reclamo sobre datos personales 15 días hábiles, contados desde el día siguiente al radicado.
- **Auditoría**: `service.pqrsf.file` · `consult` · `classify` · `transfer` · `assign` · `draft` ·
  `submit` · `approve` · `request_nonconformity` · `return` · `close` · `mail` · `warn` · `breach`,
  `service.survey.create` · `update` · `invite` · `link.issue` · `mail` · `view` · `answer` y
  `service.kb.create` · `update` · `publish` · `archive`. Sin nombre, correo ni teléfono de quien
  presenta la PQRSF.
- **Bandeja de salida**: `service.pqrsf.filed` · `classified` · `transferred` (Privacidad, B42) ·
  `assigned` · `drafted` · `submitted` · `responded` · `nonconforming` (Calidad, B38) · `returned`
  · `closed` · `acknowledged` · `delivered` · `warned` · `breached`, `service.survey.created` ·
  `updated` · `invited` · `sent` · `answered` (indicador de satisfacción, B39) y
  `service.kb.created` · `updated` · `published` · `archived`.
- **Avisos** (B16): `svc_pqrsf_update`, no urgente: PQRSF nueva (al líder de Servicio), asignada,
  por aprobar, devuelta, respondida, trasladada (al Oficial de datos), queja o reclamo procedente (a
  Calidad), por vencer y vencida (al responsable y al líder).

## svc_pqrsf · PQRSF (FT-SAC-002)

| Columna | Tipo | Nulo | Por defecto | Regla |
| --- | --- | --- | --- | --- |
| `id` | uuid | No | UUID v7 | Llave primaria |
| `tenant_id` | uuid | No | | Empresa |
| `code` | text | No | | `PQRSF-AAAA-NNNN`; único por empresa |
| `type` | text | No | | `petition`, `complaint`, `claim`, `suggestion` o `compliment` |
| `privacy_kind` | text | Sí | | `inquiry` o `claim` si trata de datos personales (Ley 1581) |
| `channel` | text | No | | `web`, `email`, `phone`, `in_person` o `portal` |
| `status` | text | No | `filed` | `filed`, `classified`, `in_progress`, `responded` o `closed` |
| `approval` | text | No | `none` | `none`, `pending` o `returned`; distinto de `none` solo en trámite |
| `party_id` | uuid | Sí | | Tercero relacionado |
| `requester_name` | text | No | | 3 a 160 letras |
| `requester_email` | text | Sí | | Obligatorio si llegó por el sitio; correo o teléfono, al menos uno |
| `requester_phone` | text | Sí | | 7 a 20 caracteres |
| `subject` | text | No | | 3 a 160 letras |
| `description` | text | No | | 10 a 8000 letras |
| `received_at` | timestamptz | No | | Radicado |
| `term_days` | smallint | No | | 1 a 60 días hábiles |
| `due_on` | date | No | | Fecha límite; posterior al día del radicado |
| `warn_on` | date | No | | Desde aquí «por vencer»; no después de `due_on` |
| `assignee_id` | uuid | Sí | | Responsable; lleno desde que se clasifica |
| `classified_at` | timestamptz | Sí | | Lleno desde que se clasifica |
| `response_draft` | text | Sí | | Borrador; obligatorio en trámite |
| `well_founded` | boolean | Sí | | Queja o reclamo procedente |
| `drafted_by` | uuid | Sí | | Quien redactó |
| `submitted_at` | timestamptz | Sí | | Lleno solo con `approval = pending` |
| `return_reason` | text | Sí | | Lleno solo con `approval = returned` |
| `response` | text | Sí | | Respuesta aprobada; llena en `responded` y `closed` |
| `approved_by` | uuid | Sí | | Quien aprobó; nunca quien redactó |
| `responded_at` | timestamptz | Sí | | Cuándo se aprobó |
| `transferred_at` | timestamptz | Sí | | Trasladada a Privacidad |
| `nonconformity_at` | timestamptz | Sí | | Se pidió la no conformidad a Calidad |
| `privacy_notice_id` | uuid | Sí | | Aviso de autorización que aceptó (`prv_notices`, por identificador) |
| `privacy_accepted_at` | timestamptz | Sí | | Obligatorio si llegó por el sitio |
| `mail_pending` | text | Sí | | `ack` o `response`: el correo que el worker debe enviar |
| `ack_sent_at` | timestamptz | Sí | | Se envió el acuse |
| `response_sent_at` | timestamptz | Sí | | Se envió la respuesta |
| `warned_at` | timestamptz | Sí | | Se avisó «por vencer» |
| `breached_at` | timestamptz | Sí | | Se avisó «vencida» |
| `closed_at` | timestamptz | Sí | | Lleno solo en `closed` |
| control | | | | Columnas de control |

Índices: únicos (`tenant_id`, `id`) y (`tenant_id`, `code`); (`tenant_id`, `status`),
(`tenant_id`, `assignee_id`) y (`tenant_id`, `due_on`).

## svc_surveys · Encuestas (FT-SAC-003)

| Columna | Tipo | Nulo | Por defecto | Regla |
| --- | --- | --- | --- | --- |
| `id` | uuid | No | UUID v7 | Llave primaria |
| `tenant_id` | uuid | No | | Empresa |
| `key` | text | No | | `ticket_resolution`; única por empresa |
| `name` | text | No | | 3 a 120 letras |
| `trigger` | text | No | | `ticket_resolved` |
| `recommend_question` | text | No | | Pregunta de 0 a 10 (NPS); 5 a 300 letras |
| `satisfaction_question` | text | No | | Pregunta de 1 a 5; 5 a 300 letras |
| `comment_question` | text | No | | Invitación a comentar; 5 a 300 letras |
| `is_active` | boolean | No | `true` | Apagada, no se envía |
| control | | | | Columnas de control |

## svc_survey_responses · Respuestas y NPS

| Columna | Tipo | Nulo | Por defecto | Regla |
| --- | --- | --- | --- | --- |
| `id` | uuid | No | UUID v7 | Llave primaria |
| `tenant_id` | uuid | No | | Empresa |
| `survey_id` | uuid | No | | Encuesta (llave con `tenant_id`) |
| `party_id` | uuid | Sí | | Cliente del tiquete |
| `entity_type` | text | No | | `svc_ticket` |
| `entity_id` | uuid | No | | Tiquete |
| `recipient_email` | text | Sí | | Vacío: «sin correo», no se envía |
| `token_hash` | text | Sí | | Huella SHA-256 de la llave del enlace; única; nunca la llave |
| `expires_at` | timestamptz | Sí | | 30 días después de enviada |
| `mail_pending` | boolean | No | `false` | El worker debe enviarla |
| `sent_at` | timestamptz | Sí | | Lleno junto con `token_hash` y `expires_at` |
| `superseded_at` | timestamptz | Sí | | La reemplazó un enlace más reciente (el tiquete se reabrió) |
| `score` | smallint | Sí | | 0 a 10; lleno solo al responder |
| `satisfaction` | smallint | Sí | | 1 a 5; lleno solo al responder |
| `comment` | text | Sí | | 3 a 2000 letras |
| `answered_at` | timestamptz | Sí | | Una sola vez |
| control | | | | Columnas de control |

NPS: porcentaje de quienes calificaron 9 o 10 menos el de quienes calificaron de 0 a 6 (`npsOf()`
en los contratos).

## svc_kb_articles · Base de conocimiento

| Columna | Tipo | Nulo | Por defecto | Regla |
| --- | --- | --- | --- | --- |
| `id` | uuid | No | UUID v7 | Llave primaria |
| `tenant_id` | uuid | No | | Empresa |
| `title` | text | No | | 3 a 160 letras |
| `summary` | text | No | | 10 a 300 letras |
| `body` | text | No | | Texto sencillo, 10 a 30000 letras: párrafos y listas con «- » |
| `category` | text | No | | `platform`, `support`, `projects`, `billing` o `general` |
| `audience` | text | No | | `internal` o `client` (el portal, B30) |
| `status` | text | No | `draft` | `draft`, `published` o `archived` |
| `published_at` | timestamptz | Sí | | Obligatorio en `published` |
| control | | | | Columnas de control |
