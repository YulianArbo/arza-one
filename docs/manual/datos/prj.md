# Diccionario de datos · Proyectos (prj\_)

Tipos exactos, restricciones e índices de las tablas de Proyectos (ficha 17.8, numeral 12.4). Se
actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).
Migración: `20261101000000_prj_projects_members_milestones_sprints_items_links` (B26).

## Reglas comunes

- **Alcance del B26**: estructura y tablero. Las horas (`prj_time_entries`), los entregables y las
  actas (`prj_deliverables`, `prj_acceptances`), los riesgos, las liberaciones, las revisiones de
  código y los incidentes llegan con el B27.
- **Columnas de control** en las seis tablas: las fija `core_set_control_columns()`
  ([core.md](core.md)).
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las seis tablas.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`; sin `DELETE`. Retirar un miembro o
  quitar un enlace marca `deleted_at` y queda en la auditoría.
- **Otros módulos**: el contrato (`contract_id`), el cliente (`party_id`), las personas
  (`manager_id`, `user_id`, `assignee_id`) y el trámite de la Dirección (`workflow_instance_id`) se
  guardan por identificador, sin llave a tablas de otros módulos (numeral 8.3). Proyectos lee el
  contrato con `contractsForProjects()` del índice de Contratos.
- **Pertenencia**: el Equipo de proyecto ve solo los proyectos donde es miembro activo
  (`prj_members` sin `deleted_at`). Se lee en cada solicitud: retirar a alguien le quita el acceso
  de inmediato.
- **Auditoría** (`aud_events`): `project.create` · `update` · `start` · `risk` · `pause` · `resume`,
  `project.authorization.request` · `grant` · `deny`, `project.member.add` · `update` · `remove`,
  `project.milestone.create` · `update` · `complete`, `project.link.add` · `remove`,
  `project.sprint.create` · `update` · `start` · `close` y `project.item.create` · `update` · `move` ·
  `plan`.
- **Bandeja de salida**: `project.created` (numeral 13.3; avisa al líder y lo usarán el portal y
  las tareas de arranque), `project.started`, `project.status.changed`,
  `project.authorization.requested` · `granted` · `denied`, `project.member.added` (avisa a quien
  entra) · `updated` · `removed`, `project.milestone.*`, `project.link.*`, `project.sprint.*` y
  `project.item.created` · `updated` · `moved` · `planned`. Los datos del evento son
  identificadores y códigos, nunca datos personales.
- **Consecutivo**: `PRY-AAAA-NNNN` (`prj.project`). Los ítems se numeran dentro de su proyecto con
  la fila del proyecto bloqueada: `PRY-2026-0001-12`, que la pantalla muestra como «#12».

## prj_projects · Proyectos

| Columna                    | Tipo          | Nulo | Regla                                                                             |
| -------------------------- | ------------- | ---- | --------------------------------------------------------------------------------- |
| `id`, `tenant_id`          | uuid          | No   | Llave primaria y empresa                                                          |
| `code`                     | text          | No   | `PRY-2026-0001`; único por empresa; no cambia (`prj_projects_keep`)               |
| `contract_id`              | uuid          | Sí   | Contrato vigente de origen; a lo sumo un proyecto por contrato; no cambia         |
| `party_id`                 | uuid          | No   | Cliente: el del contrato o, sin contrato, uno de Terceros; no cambia              |
| `name`                     | text          | No   | 3 a 160 letras                                                                    |
| `type`                     | text          | No   | `development`, `support`, `integration` u `other`                                 |
| `methodology`              | text          | No   | `scrum`, `kanban` o `phases`                                                      |
| `description`              | text          | Sí   | Alcance, 3 a 4000 letras                                                          |
| `status`                   | text          | No   | `planning`, `in_progress`, `at_risk` o `paused`                                   |
| `status_reason`            | text          | Sí   | Obligatorio en riesgo y pausado; vacío en los demás estados                      |
| `starts_on`, `ends_on`     | date          | No   | El fin no antes del inicio                                                        |
| `budget_hours`             | numeric(7,1)  | No   | Presupuesto de horas, 0 o más                                                     |
| `budget_amount`            | numeric(18,2) | Sí   | Presupuesto en pesos; con contrato, por omisión su valor                          |
| `manager_id`               | uuid          | No   | Líder del proyecto: siempre en el equipo con el rol `leader`                      |
| `authorization_status`     | text          | No   | `none`, `requested`, `granted` o `denied` (autorización de la Dirección)          |
| `authorization_reason`     | text          | Sí   | Motivo con que se pidió; obligatorio desde que se pide                            |
| `authorization_note`       | text          | Sí   | Comentario de la Dirección                                                        |
| `authorization_decided_*`  |               | Sí   | Quién decidió y cuándo; obligatorio si se autorizó o no                           |
| `workflow_instance_id`     | uuid          | Sí   | Trámite `prj.start` en Mis tareas                                                 |
| `started_at`               | timestamptz   | Sí   | Cuándo pasó a ejecución; vacío solo en planeación                                 |

Índices: `(tenant_id, code)` único, `(tenant_id, contract_id)` único cuando hay contrato
(`prj_projects_contract_once`), `(tenant_id, status)`.

## prj_members · Equipo

| Columna          | Tipo     | Nulo | Regla                                                                     |
| ---------------- | -------- | ---- | ------------------------------------------------------------------------- |
| `project_id`     | uuid     | No   | Llave foránea a `prj_projects`                                            |
| `user_id`        | uuid     | No   | Colaborador activo con rol de Líder técnico, Equipo de proyecto, Dirección, Calidad, Comercial o Servicio |
| `role`           | text     | No   | `leader`, `analysis`, `development`, `design` o `testing`                 |
| `allocation_pct` | smallint | No   | Dedicación de 1 a 100                                                     |
| `deleted_at`     |          | Sí   | Retirado: pierde el acceso y sus ítems abiertos quedan sin asignar        |

Una persona está una sola vez en el equipo (`prj_members_once`, sin contar a los retirados).

## prj_milestones · Hitos

| Columna       | Tipo         | Nulo | Regla                                                                   |
| ------------- | ------------ | ---- | ----------------------------------------------------------------------- |
| `project_id`  | uuid         | No   | Llave foránea a `prj_projects`                                          |
| `name`        | text         | No   | 3 a 160 letras                                                          |
| `due_on`      | date         | No   | Fecha comprometida                                                      |
| `billing_pct` | numeric(5,2) | No   | 0 a 100. Entre todos los hitos del proyecto, máximo 100 (lo revisa la API con decimal.js) |
| `status`      | text         | No   | `pending` o `done` (con `done_at`); uno cumplido no cambia              |

## prj_sprints · Iteraciones

| Columna                | Tipo | Nulo | Regla                                                              |
| ---------------------- | ---- | ---- | ------------------------------------------------------------------ |
| `project_id`           | uuid | No   | Llave foránea a `prj_projects`                                     |
| `name`                 | text | No   | 3 a 80 letras                                                      |
| `starts_on`, `ends_on` | date | No   | Dentro de las fechas del proyecto; el fin no antes del inicio      |
| `goal`                 | text | Sí   | Meta, 3 a 1000 letras                                              |
| `status`               | text | No   | `planned`, `active` o `closed` (con `closed_at`)                   |

Solo una iteración en curso por proyecto (`prj_sprints_one_active`). Al cerrarla, sus ítems no
terminados vuelven a la lista de pendientes (`sprint_id` vacío).

## prj_items · Épicas, historias, tareas y defectos

| Columna               | Tipo         | Nulo | Regla                                                                         |
| --------------------- | ------------ | ---- | ----------------------------------------------------------------------------- |
| `project_id`          | uuid         | No   | Llave foránea a `prj_projects`; no cambia                                     |
| `parent_id`           | uuid         | Sí   | La épica de una historia; la épica o historia de una tarea o un defecto       |
| `type`                | text         | No   | `epic`, `story`, `task` o `defect`; no cambia                                 |
| `number`, `code`      | int, text    | No   | Número dentro del proyecto y `PRY-AAAA-NNNN-N`; únicos; no cambian            |
| `title`               | text         | No   | 3 a 200 letras                                                                |
| `description`         | text         | Sí   | 3 a 8000 letras                                                               |
| `acceptance_criteria` | text         | Sí   | 3 a 4000 letras. Sin criterios, el ítem no entra a una iteración             |
| `status`              | text         | No   | `pending`, `in_progress`, `in_review`, `in_testing` o `done`                  |
| `priority`            | text         | No   | `low`, `normal`, `high` o `urgent`                                            |
| `estimate_hours`      | numeric(4,1) | Sí   | 0,5 a 999                                                                     |
| `assignee_id`         | uuid         | Sí   | Miembro activo del equipo                                                     |
| `sprint_id`           | uuid         | Sí   | Iteración (llave foránea a `prj_sprints`); nunca en una épica                 |
| `review_url`          | text         | Sí   | Enlace `https://` a la revisión de código; obligatorio para terminar          |
| `test_note`           | text         | Sí   | Pruebas hechas, 3 a 2000 letras; obligatoria para terminar                    |
| `done_at`             | timestamptz  | Sí   | Solo en terminados                                                            |

Reglas en la base: `prj_items_sprint_check` (una épica o un ítem sin criterios no entra a una
iteración), `prj_items_done_check` (terminado con fecha, enlace y pruebas) y `prj_items_keep`
(proyecto, número, código y tipo no cambian). Regla en la API: un ítem avanza de a una columna o
vuelve a cualquiera anterior (`canMoveItem()`, en `packages/contracts`), y solo se mueve con el
proyecto en ejecución o en riesgo.

## prj_external_links · Enlaces

| Columna      | Tipo | Nulo | Regla                                                                                   |
| ------------ | ---- | ---- | --------------------------------------------------------------------------------------- |
| `project_id` | uuid | No   | Llave foránea a `prj_projects`                                                          |
| `kind`       | text | No   | `repository`, `test_environment`, `production`, `design`, `documentation` u `other`     |
| `url`        | text | No   | Solo `https://`, hasta 500 letras. ARZA ONE guarda el enlace, no el código del cliente |
| `label`      | text | No   | 3 a 120 letras                                                                          |

## Avisos

Tipo nuevo `prj_project_update` (`ntf_templates`, `ntf_notifications`, `ntf_preferences`): al líder
cuando se crea el proyecto o la Dirección decide sobre su inicio, y a quien entra al equipo. Los
avisos de contrato firmado (`contract.signed`, `envelope.completed`) dicen ahora que el Líder
técnico ya puede crear el proyecto.
