# Diccionario de datos · Comercial (crm\_)

Tipos exactos, restricciones e índices de las tablas del CRM (capítulo 12.4, ficha 17.6). Se
actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).
Migración: `20261023010000_crm_leads_opportunities_activities_campaigns` (B22). El portafolio, las
cotizaciones y la revisión de requisitos (`crm_services`, `crm_quotes`, `crm_quote_items`,
`crm_requirement_reviews`) llegan en B23 y siguientes.

## Reglas comunes

- **Columnas de control** (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`,
  `deleted_at`): las fija el disparador `core_set_control_columns()` ([core.md](core.md)).
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las cuatro tablas.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`. Sin `DELETE`: el borrado es lógico.
- **Otros módulos**: la persona o el cliente (`party_id`), la autorización (`consent_id`), los
  responsables (`owner_id`, `assignee_id`) y el trámite (`workflow_instance_id`) se guardan por
  identificador, sin llave foránea a las tablas de terceros, privacidad, identidad o flujos.
- **Dinero**: `numeric(18,2)`; la API calcula con decimal.js y redondea la mitad hacia arriba.
- **Catálogos** (Administración › Catálogos): `crm_lead_sources` (orígenes), `crm_lost_reasons`
  (motivos de pérdida) y `crm_discard_reasons` (motivos de descarte). Los códigos se validan contra
  las opciones activas.
- **Auditoría** (`aud_events`) y **bandeja de salida** (`core_outbox_events`): `crm.lead.create` ·
  `update` · `qualify` · `discard` · `convert`, `crm.opportunity.create` · `update` · `stage` · `win`
  · `lose`, `crm.activity.create` · `update` · `complete` · `remind`, `crm.campaign.create` ·
  `update` y `crm.report.export` (solo auditoría). Los eventos de la bandeja llevan solo
  identificadores y códigos, como `crm.opportunity.won` o `crm.activity.reminder`.

## crm_campaigns · Campañas

| Columna     | Tipo          | Nulo | Por defecto | Regla                                                       |
| ----------- | ------------- | ---- | ----------- | ----------------------------------------------------------- |
| `id`        | uuid          | No   | UUID v7     | Llave primaria                                              |
| `tenant_id` | uuid          | No   |             | Empresa                                                     |
| `name`      | text          | No   |             | 3 a 160 letras; único por empresa                           |
| `channel`   | text          | No   |             | `email`, `social`, `event`, `website`, `ads` u `other`      |
| `starts_on` | date          | No   |             | Primer día (el manual lo llama `starts_at`; es una fecha)   |
| `ends_on`   | date          | Sí   |             | Último día; no antes del primero. Vacío si sigue            |
| `budget`    | numeric(18,2) | Sí   |             | Presupuesto en pesos, no negativo                           |
| control     |               |      |             | Columnas de control                                         |

## crm_leads · Prospectos

| Columna                | Tipo        | Nulo | Por defecto | Regla                                                                          |
| ---------------------- | ----------- | ---- | ----------- | ------------------------------------------------------------------------------ |
| `id`                   | uuid        | No   | UUID v7     | Llave primaria                                                                 |
| `tenant_id`            | uuid        | No   |             | Empresa                                                                        |
| `code`                 | text        | No   |             | `LEA-AAAA-NNNN` del consecutivo `crm.lead`; único por empresa                  |
| `source`               | text        | No   |             | Código de `crm_lead_sources`                                                   |
| `campaign_id`          | uuid        | Sí   |             | Campaña (llave a `crm_campaigns`)                                              |
| `party_id`             | uuid        | No   |             | La persona, tercero de `pty_parties` (nace «prospecto», puede no tener documento) |
| `company_name`         | text        | Sí   |             | Empresa que mencionó; 2 a 160 letras                                           |
| `need`                 | text        | No   |             | Qué necesita; 3 a 2000 letras                                                  |
| `consent_id`           | uuid        | No   |             | Su autorización de tratamiento en `prv_consents` (origen `crm_lead`)           |
| `status`               | text        | No   | `new`       | `new` → `qualified` → `converted`, o `discarded`                               |
| `owner_id`             | uuid        | Sí   |             | Responsable; por defecto, quien lo registra                                    |
| `discard_reason`       | text        | Sí   |             | Código de `crm_discard_reasons`; obligatorio si está descartado               |
| `discard_note`         | text        | Sí   |             | Detalle del descarte; solo si está descartado                                  |
| `workflow_instance_id` | uuid        | Sí   |             | Trámite de la tarea «Contactar al prospecto» (flujo `crm.lead`)                |
| `qualified_at`         | timestamptz | Sí   |             | Obligatorio si está calificado o convertido; vacío si es nuevo                 |
| `closed_at`            | timestamptz | Sí   |             | Obligatorio si está convertido o descartado                                    |
| control                |             |      |             | Columnas de control                                                            |

Disparador `crm_leads_keep`: un prospecto convertido o descartado no cambia. Índices por estado,
persona, campaña y responsable.

## crm_opportunities · Oportunidades (RE-COM-001)

| Columna           | Tipo          | Nulo | Por defecto   | Regla                                                                       |
| ----------------- | ------------- | ---- | ------------- | --------------------------------------------------------------------------- |
| `id`              | uuid          | No   | UUID v7       | Llave primaria                                                              |
| `tenant_id`       | uuid          | No   |               | Empresa                                                                     |
| `code`            | text          | No   |               | `OPO-AAAA-NNNN` del consecutivo `crm.opportunity`; único por empresa        |
| `party_id`        | uuid          | No   |               | Cliente: persona u organización de `pty_parties`                            |
| `lead_id`         | uuid          | Sí   |               | Prospecto del que nació; una oportunidad por prospecto                      |
| `title`           | text          | No   |               | 3 a 200 letras                                                              |
| `stage`           | text          | No   | `prospecting` | `prospecting`, `diagnosis`, `proposal`, `negotiation`, `won` o `lost`       |
| `estimated_value` | numeric(18,2) | No   |               | Valor estimado en pesos, no negativo                                        |
| `probability`     | smallint      | No   |               | 0 a 100; 100 si está ganada, 0 si está perdida                              |
| `expected_close`  | date          | No   |               | Fecha esperada de cierre                                                    |
| `owner_id`        | uuid          | Sí   |               | Responsable                                                                 |
| `lost_reason`     | text          | Sí   |               | Código de `crm_lost_reasons`; obligatorio si está perdida (ficha 17.6)     |
| `lost_note`       | text          | Sí   |               | Detalle de la pérdida; solo si está perdida                                 |
| `closed_at`       | timestamptz   | Sí   |               | Obligatorio si está ganada o perdida                                        |
| control           |               |      |               | Columnas de control                                                         |

Probabilidad con que empieza cada etapa: prospección 10 %, diagnóstico 25 %, propuesta 50 %,
negociación 75 %. Cada oportunidad la puede cambiar. Disparador `crm_opportunities_keep`: ganada o
perdida no cambia. Índices por etapa, cliente, responsable y fecha de creación (para el informe).

## crm_activities · Actividades y recordatorios

| Columna          | Tipo        | Nulo | Por defecto | Regla                                                             |
| ---------------- | ----------- | ---- | ----------- | ----------------------------------------------------------------- |
| `id`             | uuid        | No   | UUID v7     | Llave primaria                                                    |
| `tenant_id`      | uuid        | No   |             | Empresa                                                           |
| `lead_id`        | uuid        | Sí   |             | Prospecto; exactamente uno de `lead_id` u `opportunity_id`        |
| `opportunity_id` | uuid        | Sí   |             | Oportunidad                                                       |
| `type`           | text        | No   |             | `call`, `meeting`, `task` o `email`                               |
| `subject`        | text        | No   |             | 3 a 200 letras                                                    |
| `notes`          | text        | Sí   |             | Hasta 2000 letras                                                 |
| `due_at`         | timestamptz | No   |             | Día y hora (UTC; la pantalla la muestra en hora de Colombia)      |
| `done_at`        | timestamptz | Sí   |             | Cuándo se hizo; va junto con `outcome`                            |
| `outcome`        | text        | Sí   |             | Resultado; 3 a 2000 letras                                        |
| `assignee_id`    | uuid        | Sí   |             | Responsable; recibe el recordatorio                               |
| `reminded_at`    | timestamptz | Sí   |             | Cuándo se avisó; vuelve a vacío si cambia la hora                 |
| control          |             |      |             | Columnas de control                                               |

El worker busca las empresas con avisos pendientes con `crm_tenants_with_due_reminders(until)`
(solo devuelve identificadores de empresa; política `crm_activities_reminder_lookup`).

## Cambios en otras tablas

- `prv_consents.source` acepta también `crm_lead` (`prv_consents_source_check`).
- `pty_parties`: un prospecto puede no tener documento (migración
  `20261023000000_pty_prospects_without_document`, ver [pty.md](pty.md)).
