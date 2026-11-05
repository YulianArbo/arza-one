# Diccionario de datos · Comercial (crm\_)

Tipos exactos, restricciones e índices de las tablas del CRM (capítulo 12.4, ficha 17.6). Se
actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).
Migraciones: `20261023010000_crm_leads_opportunities_activities_campaigns` (B22) y
`20261028000000_crm_services_quotes_and_tax_parameters` (B23: portafolio y cotizaciones). La
revisión de requisitos (`crm_requirement_reviews`) llega en un bloque siguiente.

## Reglas comunes

- **Columnas de control** (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`,
  `deleted_at`): las fija el disparador `core_set_control_columns()` ([core.md](core.md)).
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las siete tablas.
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
  `update` y `crm.report.export` (solo auditoría). Desde B23: `crm.service.create` · `update`,
  `crm.quote.create` · `update` · `submit` · `approve` · `return` · `render` · `send` ·
  `link_issue` · `email` · `client_view` · `client_download` · `accept` · `reject` · `expire` ·
  `new_version`. Los eventos de la bandeja llevan solo identificadores y códigos, como
  `crm.opportunity.won`, `crm.activity.reminder` o `crm.quote.accepted` (que usará Contratos).

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

## crm_services · Portafolio de servicios (B23)

| Columna       | Tipo          | Nulo | Por defecto | Regla                                                          |
| ------------- | ------------- | ---- | ----------- | -------------------------------------------------------------- |
| `id`          | uuid          | No   | UUID v7     | Llave primaria                                                 |
| `tenant_id`   | uuid          | No   |             | Empresa                                                        |
| `code`        | text          | No   |             | `SRV-NNNN`, por el servicio de consecutivos; único por empresa |
| `name`        | text          | No   |             | 3 a 160 letras; único por empresa                              |
| `description` | text          | Sí   |             | Hasta 2000 letras; sale en la cotización                       |
| `unit`        | text          | No   |             | `hour`, `day`, `month`, `project`, `unit` o `license`          |
| `base_price`  | numeric(18,2) | No   |             | Tarifa vigente en pesos, antes de impuestos; no negativa       |
| `tax_key`     | text          | No   |             | Clave del impuesto en `fin_tax_parameters` (ver la nota)       |
| `is_active`   | boolean       | No   | `true`      | Inactivo: ya no se ofrece en el asistente                      |
| control       |               |      |             | Columnas de control                                            |

El manual nombra la columna `tax_rate`; por decisión del dueño (B23) el servicio guarda la **clave**
del impuesto y la tarifa se lee de [fin.md](fin.md) al cotizar, así un cambio de tarifa no obliga a
editar cada servicio. La cotización sí guarda la tarifa que usó.

## crm_quotes · Cotizaciones y sus versiones (B23)

Una fila por versión; todas las versiones de una cotización comparten `code`. Estados: `draft`
(borrador) → `in_approval` (en aprobación) → `approved` (aprobada) → `sent` (enviada) →
`accepted`, `rejected` o `expired`; `superseded` (reemplazada) cuando se crea la versión siguiente
de una aprobada o enviada.

| Columna                                                     | Tipo          | Nulo  | Regla                                                         |
| ----------------------------------------------------------- | ------------- | ----- | ------------------------------------------------------------- |
| `id`, `tenant_id`                                           | uuid          | No    | Llave primaria y empresa                                      |
| `code`                                                      | text          | No    | `COT-AAAA-NNNN`; con `version_number`, único por empresa     |
| `version_number`                                            | integer       | No    | 1, 2, 3…; la 1 no tiene `previous_id` y las demás sí          |
| `previous_id`                                               | uuid          | Sí    | Versión anterior (llave a la misma tabla)                     |
| `opportunity_id`                                            | uuid          | No    | Oportunidad (llave a `crm_opportunities`)                     |
| `party_id`                                                  | uuid          | No    | Cliente en Terceros, por identificador                        |
| `status`                                                    | text          | No    | Uno de los ocho estados                                       |
| `valid_until`                                               | date          | No    | Último día en que el cliente puede aceptarla                  |
| `payment_terms`, `delivery_terms`                           | text          | No    | 3 a 500 letras                                                |
| `warranty`, `notes`                                         | text          | Sí    | Hasta 500 y 2000 letras                                       |
| `subtotal`, `discount_total`, `tax_total`, `total`          | numeric(18,2) | No    | `total = subtotal − discount_total + tax_total`               |
| `largest_discount`, `discount_cap`                          | numeric(5,2)  | No/Sí | Mayor descuento de las líneas; tope vigente al pedir el envío |
| `requires_approval`, `workflow_instance_id`                 | boolean, uuid | No/Sí | Si fue a la Dirección y su trámite en Mis tareas              |
| `submitted_at`, `decided_by`, `decided_at`, `decision_note` |               | Sí    | Pedido de envío (vacío = borrador) y decisión de la Dirección |
| `pdf_status`, `pdf_file_id`, `pdf_sha256`                   |               | No/Sí | `none`, `pending` o `ready`; PDF FT-COM-001 y su huella       |
| `recipient_name`, `recipient_email`, `sent_by`, `sent_at`   |               | Sí    | A quién y cuándo se envió                                     |
| `email_sent_at`                                             | timestamptz   | Sí    | Cuándo salió el correo con el enlace                          |
| `link_token_hash`, `link_expires_at`                        |               | Sí    | Huella SHA-256 de la llave del enlace (única) y su vencimiento |
| `response`, `responded_at`, `responded_by_name`             |               | Sí    | Aceptada o rechazada, cuándo y quién                          |
| `response_reason`, `response_ip`, `response_user_agent`     |               | Sí    | Motivo del rechazo, IP y navegador de quien respondió         |
| `response_pdf_sha256`                                       | text          | Sí    | Huella del PDF que el cliente tenía al responder              |
| `closed_at`                                                 | timestamptz   | Sí    | Aceptada, rechazada, vencida o reemplazada                    |
| control                                                     |               |       | Columnas de control                                           |

Restricciones `crm_quotes_*_check`: totales que cuadran, estados con sus fechas, evidencia
completa al responder y PDF listo para enviar. Disparador `crm_quotes_keep`: **fuera de borrador
el contenido no cambia** y una cerrada no cambia nada más. Funciones `SECURITY DEFINER`:
`crm_find_quote_link(hash)` (el enlace del cliente, sin sesión), `crm_tenants_with_quote_work()` y
`crm_tenants_with_expired_quotes(fecha)` (el worker); solo devuelven identificadores.

## crm_quote_items · Ítems de la cotización (B23)

| Columna                                                    | Tipo          | Nulo | Regla                                                     |
| ---------------------------------------------------------- | ------------- | ---- | --------------------------------------------------------- |
| `id`, `tenant_id`                                          | uuid          | No   | Llave primaria y empresa                                  |
| `quote_id`                                                 | uuid          | No   | Cotización (llave a `crm_quotes`)                         |
| `position`                                                 | smallint      | No   | 1 a 100                                                   |
| `service_id`                                               | uuid          | Sí   | Servicio del portafolio; vacío si es un ítem libre        |
| `description`                                              | text          | No   | 3 a 500 letras                                            |
| `unit`                                                     | text          | No   | Las mismas unidades del portafolio                        |
| `quantity`                                                 | numeric(9,2)  | No   | Mayor que cero                                            |
| `unit_price`                                               | numeric(18,2) | No   | No negativo                                               |
| `discount_percent`                                         | numeric(5,2)  | No   | 0 a 100                                                   |
| `tax_key`, `tax_rate`                                      |               | No   | Impuesto y **tarifa usada**, guardada al calcular         |
| `line_subtotal`, `line_discount`, `line_tax`, `line_total` | numeric(18,2) | No   | Al centavo, mitad hacia arriba; el total de la línea cuadra |
| control                                                    |               |      | Columnas de control                                       |

Disparador `crm_quote_items_keep`: solo se escriben mientras la cotización es borrador. Al guardar
un borrador, los ítems anteriores quedan borrados lógicamente (`deleted_at`).

## Cambios en otras tablas

- `prv_consents.source` acepta también `crm_lead` (`prv_consents_source_check`).
- `pty_parties`: un prospecto puede no tener documento (migración
  `20261023000000_pty_prospects_without_document`, ver [pty.md](pty.md)).
- B23: `ntf_templates`, `ntf_notifications` y `ntf_preferences` aceptan el aviso
  `crm_quote_update` («Novedad de una cotización suya»).
- B23: la tabla `fin_tax_parameters` (parámetros tributarios) se documenta en [fin.md](fin.md).
