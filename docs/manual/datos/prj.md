# Diccionario de datos · Proyectos (prj\_)

Tipos exactos, restricciones e índices de las tablas de Proyectos (ficha 17.8, numeral 12.4). Se
actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).
Migraciones: `20261101000000_prj_projects_members_milestones_sprints_items_links` (B26) y
`20261105000000_prj_time_deliverables_acceptances_control` (B27).

## Reglas comunes

- **Alcance**: estructura y tablero (B26); horas, entregables con su acta firmada, riesgos,
  liberaciones, revisiones de código, incidentes, indicadores y cierre (B27).
- **Columnas de control** en las trece tablas: las fija `core_set_control_columns()`
  ([core.md](core.md)).
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las trece tablas.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`; sin `DELETE`. Retirar un miembro o
  quitar un enlace marca `deleted_at` y queda en la auditoría. `prj_code_reviews` y `prj_releases`
  son históricas: solo `SELECT` e `INSERT`.
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
  `plan`. Desde el B27: `project.time.log` · `update` · `remove` · `approve` · `return`,
  `project.deliverable.create` · `update` · `deliver`, `project.acceptance.send` · `accepted` ·
  `tacit` · `returned` · `unanswered` · `cancelled`, `project.milestone.billable`,
  `project.review.create`, `project.risk.create` · `update`, `project.release.create`,
  `project.incident.report` · `resolve`, `project.settings.update`, `project.closing` y
  `project.close`.
- **Bandeja de salida**: `project.created` (numeral 13.3; avisa al líder y lo usarán el portal y
  las tareas de arranque), `project.started`, `project.status.changed`,
  `project.authorization.requested` · `granted` · `denied`, `project.member.added` (avisa a quien
  entra) · `updated` · `removed`, `project.milestone.*`, `project.link.*`, `project.sprint.*` y
  `project.item.created` · `updated` · `moved` · `planned`. Desde el B27, `project.time.*`,
  `project.deliverable.*`, `project.acceptance.*`, `project.milestone.billable` (el que usará
  Facturación, B31: proyecto, contrato, cliente, hito, porcentaje y valor), `project.review.created`,
  `project.risk.*` (`project.risk.high` avisa al líder), `project.release.published`,
  `project.incident.*` y `project.closed`. Los datos del evento son identificadores y códigos,
  nunca datos personales.
- **Consecutivos**: `INC-AAAA-NNNN` (`prj.incident`) para los incidentes;
  `PRY-AAAA-NNNN` (`prj.project`). Los ítems se numeran dentro de su proyecto con
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
| `status`                   | text          | No   | `planning`, `in_progress`, `at_risk`, `paused`, `closing` o `closed`              |
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
| `hour_cost`                | numeric(18,2) | Sí   | Costo promedio de una hora del equipo, para la rentabilidad (B27)                 |
| `respond_days`             | smallint      | No   | Días que tiene el cliente para responder un acta: 1 a 30, por omisión 10          |
| `tacit_acceptance`         | boolean       | No   | El contrato prevé la aceptación tácita                                            |
| `tacit_clause`             | text          | Sí   | Cláusula que la prevé; obligatoria si `tacit_acceptance`                          |
| `portal_visible`           | boolean       | No   | Se ve en el portal del cliente desde que inicia; por omisión `true` (B30)        |
| `closing_started_at`       | timestamptz   | Sí   | Desde cuándo está en cierre; obligatoria en cierre y cerrado                      |
| `closed_at`, `closing_note`|               | Sí   | Cuándo se cerró y las lecciones aprendidas; obligatorias en cerrado               |

Índices: `(tenant_id, code)` único, `(tenant_id, contract_id)` único cuando hay contrato
(`prj_projects_contract_once`), `(tenant_id, status)` y `(tenant_id, party_id)` (B30: el portal
busca los proyectos de cada cliente).

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
| `status`      | text         | No   | `pending`, `done` o `billable` (con `done_at`); uno cumplido no cambia  |
| `billable_at`, `billable_amount` | | Sí | Listo para facturar (B27): cuándo y por cuánto, el porcentaje sobre el valor del contrato o el presupuesto |

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
| `review_url`          | text         | Sí   | Enlace `https://` a la revisión de código (B26); desde el B27, opcional       |
| `test_note`           | text         | Sí   | Pruebas hechas, 3 a 2000 letras; obligatoria para terminar                    |
| `done_at`             | timestamptz  | Sí   | Solo en terminados                                                            |

Reglas en la base: `prj_items_sprint_check` (una épica o un ítem sin criterios no entra a una
iteración), `prj_items_done_check` (terminado con fecha y pruebas; desde el B27 la API exige
además que la última revisión de `prj_code_reviews` esté aprobada) y `prj_items_keep`
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

## prj_time_entries · Horas (B27)

| Columna         | Tipo         | Nulo | Regla                                                                   |
| --------------- | ------------ | ---- | ----------------------------------------------------------------------- |
| `project_id`    | uuid         | No   | Llave foránea a `prj_projects`                                          |
| `item_id`       | uuid         | Sí   | Ítem del proyecto; vacío para trabajo general                           |
| `user_id`       | uuid         | No   | Quien trabajó: miembro activo del equipo                                |
| `work_date`     | date         | No   | Hoy o hasta siete días atrás (lo revisa la API, `workDateProblem()`)    |
| `hours`         | numeric(4,2) | No   | De 0,25 a 24, en cuartos de hora; por persona y día, máximo 24 (API)    |
| `billable`      | boolean      | No   | Se cobra al cliente; por omisión sí                                     |
| `note`          | text         | Sí   | Qué se hizo, 3 a 500 letras                                             |
| `status`        | text         | No   | `registered`, `approved` o `returned`                                   |
| `decided_*`     |              | Sí   | Quién aprobó o devolvió y cuándo; nunca quien registró                  |
| `decision_note` | text         | Sí   | Qué debe corregir; obligatorio al devolver                              |

## prj_deliverables · Entregables (B27)

| Columna                         | Tipo        | Nulo | Regla                                                          |
| ------------------------------- | ----------- | ---- | -------------------------------------------------------------- |
| `project_id`                    | uuid        | No   | Llave foránea a `prj_projects`                                 |
| `milestone_id`                  | uuid        | Sí   | Hito (llave foránea a `prj_milestones`), pendiente al elegirlo |
| `name`, `description`           | text        |      | 3 a 160 letras; descripción opcional, 3 a 2000                 |
| `version_label`, `evidence_url` | text        | Sí   | Versión entregada y enlace `https://` opcional                 |
| `status`                        | text        | No   | `preparing`, `delivered`, `accepted` (con `accepted_at`) o `returned` |

## prj_acceptances · Actas de entrega FT-TEC-001 (B27)

| Columna                     | Tipo        | Nulo | Regla                                                                                       |
| --------------------------- | ----------- | ---- | ------------------------------------------------------------------------------------------- |
| `deliverable_id`            | uuid        | No   | Llave foránea a `prj_deliverables`; a lo sumo un acta abierta (`prj_acceptances_open_key`)  |
| `status`                    | text        | No   | `preparing`, `in_signature`, `accepted`, `tacit`, `returned`, `unanswered` o `cancelled`    |
| `signer_party_id`, `signer_name` |        | No   | Firmante autorizado del cliente en Terceros                                                 |
| `environment`               | text        | No   | `test` o `production`                                                                       |
| `pending_note`, `message`   | text        | Sí   | Pendientes del acta y mensaje del correo                                                    |
| `respond_by`                | date        | No   | Entrega más `respond_days` del proyecto                                                     |
| `form_record_id`, `record_code` |         | Sí   | Registro FT-TEC-001 (`doc_form_records`), por identificador                                 |
| `envelope_id`, `envelope_code`  |         | Sí   | Proceso de firma (`sig_envelopes`, fuente `acceptance`), por identificador                  |
| `signed_file_id`            | uuid        | Sí   | Acta firmada con su certificado; obligatoria si `accepted`                                  |
| `delivered_by`, `delivered_at` |          | No   | Quién entregó y cuándo                                                                      |
| `answered_at`, `accepted_at`, `client_note` | | Sí | Cuándo respondió el cliente, cuándo quedó aceptada y su motivo al devolver           |

El worker (`prj.acceptance-work`, cada 20 s) envía a firma el acta cuando su PDF está listo y lee
cómo terminó la firma; `prj_tenants_with_acceptances()` dice qué empresas tienen actas abiertas.

## prj_risks · Riesgos (B27)

| Columna                  | Tipo     | Nulo | Regla                                                                  |
| ------------------------ | -------- | ---- | ---------------------------------------------------------------------- |
| `description`, `response`| text     |      | Riesgo (3 a 1000) y respuesta opcional (3 a 2000)                      |
| `probability`, `impact`  | smallint | No   | 1 a 5. Nivel = producto: bajo hasta 6, medio hasta 14, alto desde 15   |
| `owner_id`               | uuid     | No   | Responsable: miembro del equipo                                        |
| `status`                 | text     | No   | `open`, `mitigating` o `closed` (con `closed_at`)                      |

## prj_releases · Liberaciones (B27)

| Columna               | Tipo | Nulo | Regla                                                            |
| --------------------- | ---- | ---- | ---------------------------------------------------------------- |
| `version_label`       | text | No   | 1 a 40 letras                                                    |
| `environment`         | text | No   | `test` o `production`                                            |
| `released_on`         | date | No   | No después de hoy                                                |
| `notes`               | text | No   | Qué cambia, 3 a 4000 letras                                      |
| `test_report_file_id` | uuid | No   | Informe de pruebas en PDF (PR-TEC-003), subido y sin virus       |
| `released_by`         | uuid | No   | Quién liberó                                                     |

## prj_code_reviews · Revisiones de código FT-TEC-002 (B27)

| Columna                                  | Tipo  | Nulo | Regla                                                                  |
| ---------------------------------------- | ----- | ---- | ---------------------------------------------------------------------- |
| `item_id`                                | uuid  | No   | Ítem revisado (llave foránea a `prj_items`), en revisión o en pruebas  |
| `reference_url`                          | text  | No   | Solicitud de cambios, `https://`                                       |
| `reviewer_id`                            | uuid  | No   | Nunca quien tiene asignado el ítem                                     |
| `answers`                                | jsonb | No   | `yes`, `no` o `na` por cada punto de `CODE_REVIEW_CHECKLIST`           |
| `result`                                 | text  | No   | `approved` (sin puntos que no cumplen) o `changes_requested`           |
| `checklist_record_id`, `record_code`     |       | Sí   | Registro FT-TEC-002 (`doc_form_records`) con su PDF                    |

## prj_incidents · Incidentes FT-TEC-004 (B27)

| Columna                              | Tipo        | Nulo | Regla                                                              |
| ------------------------------------ | ----------- | ---- | ------------------------------------------------------------------ |
| `code`                               | text        | No   | `INC-AAAA-NNNN`, único por empresa                                 |
| `title`, `description`               | text        | No   | 3 a 160 y 3 a 4000 letras                                          |
| `kind`, `severity`                   | text        | No   | `failure` o `security`; `critical`, `high`, `medium` o `low`       |
| `detected_at`                        | timestamptz | No   | No en el futuro                                                    |
| `personal_data`                      | boolean     | No   | Comprometió datos personales: avisa al Oficial de datos            |
| `status`                             | text        | No   | `open` o `resolved`                                                |
| `resolved_at`, `root_cause`, `actions` |           | Sí   | Obligatorios al resolver; la solución no antes de la detección     |
| `reported_by`                        | uuid        | No   | Quién lo registró                                                  |
| `form_record_id`                     | uuid        | Sí   | Reservado para un formato digital; el FT-TEC-004 es registro nativo |

## prj_client_access · Proyectos que ve cada usuario del cliente (B30)

El administrador del cliente decide desde el portal qué proyectos de su empresa ve cada uno de sus
usuarios (decisión 3). El administrador ve todos los de su empresa y no necesita filas aquí.

| Columna           | Tipo | Nulo | Regla                                                            |
| ----------------- | ---- | ---- | ---------------------------------------------------------------- |
| `id`, `tenant_id` | uuid | No   | Llave primaria y empresa                                         |
| `project_id`      | uuid | No   | Proyecto de la misma empresa (llave `(tenant_id, project_id)`)   |
| `user_id`         | uuid | No   | Cuenta del portal de la misma empresa cliente (lo revisa la API) |
| control           |      |      | Columnas de control; quitar la asignación marca `deleted_at`    |

Índices: `(tenant_id, project_id)`, `(tenant_id, user_id)` y único `(tenant_id, project_id,
user_id)` entre las vigentes (`prj_client_access_live_key`). `app_user`: leer, insertar y
modificar; sin borrar.

## prj_shared_files · Archivos compartidos con el cliente (B30)

Lo que el equipo comparte a propósito en el portal (decisión 5). Nada se comparte por defecto; los
contratos y actas firmados el cliente ya los ve sin estar aquí.

| Columna           | Tipo | Nulo | Regla                                                                         |
| ----------------- | ---- | ---- | ----------------------------------------------------------------------------- |
| `id`, `tenant_id` | uuid | No   | Llave primaria y empresa                                                      |
| `project_id`      | uuid | No   | Proyecto (llave `(tenant_id, project_id)`)                                    |
| `file_id`         | uuid | No   | Archivo que subió quien comparte y que pasó el antivirus                      |
| `title`           | text | No   | Cómo lo ve el cliente, 3 a 160 letras                                         |
| `shared_by`       | uuid | No   | Quién lo compartió                                                            |
| control           |      |      | Columnas de control; dejar de compartir marca `deleted_at` (el archivo queda) |

Índices: `(tenant_id, project_id)` y único `(tenant_id, project_id, file_id)` entre los vigentes
(`prj_shared_files_live_key`). `app_user`: leer, insertar y modificar; sin borrar.

Auditoría: `project.portal.visibility`, `project.file.share` · `unshare` y
`project.client_access.set`. Bandeja de salida: `project.portal.changed`, `project.file.shared` ·
`unshared` y `project.client.access.changed`, con identificadores y códigos.

## Otros módulos tocados por el B27

- `sig_envelopes`: `contract_id` admite vacío y suma `source_id` y `party_id` para la fuente
  `acceptance` (`sig_envelopes_source_check`, `sig_envelopes_open_source_key`).
- `doc_form_templates` y `doc_form_records`: admiten las entidades `prj_acceptance` y
  `prj_code_review`. La semilla publica el FT-TEC-002 en las empresas que no lo tienen.

## Avisos

Tipo nuevo `prj_project_update` (`ntf_templates`, `ntf_notifications`, `ntf_preferences`): al líder
cuando se crea el proyecto o la Dirección decide sobre su inicio, y a quien entra al equipo. Los
avisos de contrato firmado (`contract.signed`, `envelope.completed`) dicen ahora que el Líder
técnico ya puede crear el proyecto. Desde el B27 el mismo tipo avisa al líder cómo respondió el
cliente cada acta y de los riesgos altos, a quien registró horas que se las devolvieron, a
Administrativo y financiero que un hito quedó listo para facturar y al Oficial de datos del
incidente que comprometió datos personales.
