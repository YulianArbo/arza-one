# Diccionario de datos · Servicio al cliente (svc\_ y wf_sla_policies)

Tipos exactos, restricciones e índices de las tablas de la mesa de ayuda (ficha 17.9, numeral
12.4). Se actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).
Migración: `20261107000000_svc_tickets_sla_warranties_compensations` (B28).

## Reglas comunes

- **Alcance (B28)**: tiquetes con niveles, prioridades y acuerdos de tiempo cuyo reloj se pausa en
  espera del cliente; alerta al 80 % del plazo; escalamiento; conversación con mensajes públicos y
  notas internas; garantías por entregable y compensaciones técnicas RE-SAC-001. PQRSF, encuestas y
  base de conocimiento llegan con el B29; el portal del cliente, con el B30.
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
