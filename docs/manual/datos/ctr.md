# Diccionario de datos · Contratos (ctr\_)

Tipos exactos, restricciones e índices de las tablas de Contratos (capítulo 12.4, ficha 17.7). Se
actualiza en el mismo pull request que cambia el modelo (`apps/api/prisma/schema.prisma`).
Migración: `20261030000000_ctr_contracts_clauses_obligations_amendments` (B24). Las tablas de la
firma electrónica (`sig_*`, B25) están en [sig.md](sig.md); el B25 agrega el estado `in_signature`.

## Reglas comunes

- **Columnas de control** (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`,
  `deleted_at`): las fija el disparador `core_set_control_columns()` ([core.md](core.md)).
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las siete tablas.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`. Sin `DELETE`: el borrado es lógico.
- **Otros módulos**: el cliente (`party_id`), la cotización (`quote_id`), los responsables
  (`responsible_id`), los trámites (`workflow_instance_id`) y los PDF (`pdf_file_id`,
  `signed_file_id`) se guardan por identificador, sin llave foránea a las tablas de terceros, del
  CRM, de identidad, de flujos o de archivos.
- **Dinero**: `numeric(18,2)`. **Fechas** de calendario en `date`; las horas en `timestamptz` (UTC).
- **Variables**: el texto de una cláusula lleva variables `{{así}}` de una lista fija
  (`CONTRACT_VARIABLES` en `packages/contracts/src/contract/contract-text.ts`); la biblioteca no
  acepta otras.
- **Auditoría** (`aud_events`) y **bandeja de salida** (`core_outbox_events`): `contract.create` ·
  `update` · `submit` · `approve` · `return` · `render` · `signature.register` · `terminate` ·
  `expire` · `expiry.alert` · `renew`, `contract.obligation.create` · `update` · `complete` ·
  `remind` · `overdue`, `contract.amendment.create` · `approve` · `return` · `render` ·
  `signature.register`, `contract.clause.create` · `version` · `seed` y `contract.template.seed`.
  Los eventos de la bandeja llevan solo identificadores y códigos, como `contract.approved`,
  `contract.signed` (que usará Proyectos en el B26) o `contract.expiring`.

- **Avisos** ([ntf.md](ntf.md)): tipo nuevo `ctr_contract_update` («Novedad de un contrato a su
  cargo»), para el autor cuando la Dirección aprueba o devuelve, para el responsable cuando se
  registra la firma, se acerca el vencimiento o termina el plazo, y para el responsable de una
  obligación 7 días antes y cuando vence. La cotización aceptada avisa al autor con el enlace al
  asistente del contrato.
- **Expediente**: los comentarios y anexos del contrato usan `core_comments` y `core_attachments`
  con `entity_type = 'ctr_contract'`; los ve quien ve el contrato y los escribe quien lo edita.

## ctr_clause_library · Biblioteca de cláusulas aprobadas

Una fila por versión de cada cláusula. Cambiar una cláusula es crear su versión siguiente: los
contratos conservan la versión que usaron.

| Columna           | Tipo        | Nulo | Por defecto | Regla                                                       |
| ----------------- | ----------- | ---- | ----------- | ----------------------------------------------------------- |
| `id`, `tenant_id` | uuid        | No   | UUID v7     | Llave primaria y empresa                                    |
| `key`             | text        | No   |             | Minúsculas, números y guiones (3 a 60), como `garantia`     |
| `clause_version`  | integer     | No   |             | 1, 2, 3…; con `key`, única por empresa                      |
| `title`           | text        | No   |             | 3 a 120 letras                                              |
| `body`            | text        | No   |             | 10 a 10 000 letras, con variables `{{así}}`                 |
| `numbered`        | boolean     | No   |             | Lleva número (PRIMERA…); el encabezado de las partes no     |
| `legal_validated` | boolean     | No   | `false`     | El asesor jurídico validó el texto (numeral 19.4)           |
| `approved_by`     | uuid        | Sí   |             | La Dirección que la aprobó; vacío en la semilla             |
| `approved_at`     | timestamptz | No   |             | Cuándo                                                      |
| control           |             |      |             | Columnas de control                                         |

Disparador `ctr_clause_library_keep`: el texto de una versión aprobada no cambia.

## ctr_templates y ctr_template_clauses · Plantillas CT-COM y OS-COM

| Columna (`ctr_templates`) | Tipo    | Nulo | Regla                                                         |
| ------------------------- | ------- | ---- | ------------------------------------------------------------- |
| `id`, `tenant_id`         | uuid    | No   | Llave primaria y empresa                                      |
| `code`                    | text    | No   | `CT-COM-001` … `OS-COM-001`; único por empresa                |
| `name`                    | text    | No   | 3 a 160 letras                                                |
| `kind`                    | text    | No   | `contract`, `nda` (confidencialidad) o `service_order`        |
| `format_version`          | text    | No   | Versión del formato del SGC: `01`                             |
| `is_active`               | boolean | No   | Solo una activa se usa en el asistente                        |

| Columna (`ctr_template_clauses`) | Tipo     | Nulo | Regla                                                      |
| -------------------------------- | -------- | ---- | ---------------------------------------------------------- |
| `template_id`                    | uuid     | No   | Plantilla (llave a `ctr_templates`)                        |
| `position`                       | smallint | No   | 1 a 30; única por plantilla                                |
| `clause_key`                     | text     | No   | Cláusula de la biblioteca; única por plantilla             |
| `required`                       | boolean  | No   | No se puede quitar del contrato                            |

Semilla (`seedContracts`): las cuatro plantillas con 28 cláusulas, todas «por validar por el
asesor jurídico». La cláusula `firma-electronica` es obligatoria en todas (numeral 19.4).

## ctr_contracts · Contratos y órdenes de servicio

Estados: `draft` (borrador) → `in_review` (en revisión) → `approved` (aprobado) → `active`
(vigente) → `expiring` (por vencer) → `terminated` (terminado). El estado «en firma» llega con la
firma electrónica (B25); una prórroga firmada devuelve el contrato a `active`.

| Columna                                         | Tipo          | Nulo  | Regla                                                                 |
| ----------------------------------------------- | ------------- | ----- | --------------------------------------------------------------------- |
| `id`, `tenant_id`                               | uuid          | No    | Llave primaria y empresa                                              |
| `code`                                          | text          | No    | `CTR-AAAA-NNNN` u `OS-AAAA-NNNN` (orden de servicio); único           |
| `kind`                                          | text          | No    | El de su plantilla                                                    |
| `template_id`                                   | uuid          | No    | Plantilla (llave a `ctr_templates`)                                   |
| `party_id`, `quote_id`                          | uuid          | No/Sí | Cliente y cotización aceptada de origen, por identificador            |
| `title`, `object`                               | text          | No    | 3 a 160 y 10 a 4000 letras                                            |
| `value`                                         | numeric(18,2) | Sí    | Obligatorio salvo en un acuerdo de confidencialidad                   |
| `payment_terms`                                 | text          | Sí    | 3 a 1000 letras                                                       |
| `starts_on`, `ends_on`                          | date          | No    | El fin no antes del inicio                                            |
| `renewal`                                       | text          | No    | `none`, `automatic` o `by_agreement`                                  |
| `responsible_id`                                | uuid          | Sí    | Quien vigila el contrato y recibe las alertas                         |
| `client_signer_name`, `client_signer_document`  | text          | No    | Quién firma por el cliente                                            |
| `variable_values`                               | jsonb         | No    | Los valores con que se llenaron las variables, tal como se imprimieron |
| `has_modified_clauses`                          | boolean       | No    | Alguna cláusula se aparta de la biblioteca                            |
| `status`, `workflow_instance_id`, `submitted_at`|               | No/Sí | Estado y trámite de aprobación en Mis tareas                          |
| `decided_by`, `decided_at`, `decision_note`     |               | Sí    | Decisión de la Dirección                                              |
| `legal_note`                                    | text          | Sí    | Concepto jurídico que dejó la Dirección al aprobar                    |
| `pdf_status`, `pdf_file_id`, `pdf_sha256`       |               | No/Sí | `none`, `pending` o `ready`; PDF definitivo y su huella SHA-256       |
| `signed_file_id`, `signed_on`, `signed_by`      |               | Sí    | Copia firmada a mano (PDF escaneado), fecha y quién la registró       |
| `terminated_on`, `termination_reason`, `terminated_by` |        | Sí    | Terminación (anticipada o por fin de plazo)                           |
| `last_alert_days`                               | smallint      | Sí    | Última alerta de vencimiento: 90, 60 o 30                             |
| `closed_at`                                     | timestamptz   | Sí    | Terminado                                                             |
| control                                         |               |       | Columnas de control                                                   |

Índices: único `(tenant_id, code)`; `(tenant_id, status)`, `(tenant_id, party_id)`,
`(tenant_id, quote_id)`, `(tenant_id, responsible_id)` y `(tenant_id, created_at)`.

Restricciones `ctr_contracts_*_check`: código según el tipo, fechas en orden, valor salvo en
confidencialidad, aprobado con decisión y PDF, vigente con copia firmada y terminado con fecha y
motivo. Disparador `ctr_contracts_keep`: **fuera de borrador el contenido no cambia**; la fecha de
fin y el valor solo cambian sobre un contrato vigente (por un otrosí o una prórroga firmados); el
PDF aprobado no se reemplaza y uno terminado no cambia nada más.

## ctr_contract_clauses · El texto del contrato

| Columna                          | Tipo     | Nulo | Regla                                                          |
| -------------------------------- | -------- | ---- | -------------------------------------------------------------- |
| `contract_id`                    | uuid     | No   | Contrato (llave a `ctr_contracts`)                             |
| `position`                       | smallint | No   | 1 a 30                                                         |
| `clause_key`, `clause_version`   |          | Sí   | La cláusula y la versión de la biblioteca; vacías si es nueva   |
| `title`, `body`                  | text     | No   | El texto final, con las variables llenas                       |
| `origin`                         | text     | No   | `library`, `modified` o `added`                                |
| `numbered`, `required`           | boolean  | No   | Lleva número; no se puede quitar                               |

Disparador `ctr_contract_clauses_keep`: las cláusulas solo se escriben mientras el contrato es
borrador. Al guardar el borrador, las anteriores quedan borradas lógicamente.

## ctr_obligations · Obligaciones e hitos

| Columna                            | Tipo        | Nulo | Regla                                                  |
| ---------------------------------- | ----------- | ---- | ------------------------------------------------------ |
| `contract_id`                      | uuid        | No   | Contrato                                               |
| `description`                      | text        | No   | 3 a 1000 letras                                        |
| `responsible_id`                   | uuid        | No   | Colaborador activo                                     |
| `due_on`                           | date        | No   | Fecha en que debe cumplirse                            |
| `status`                           | text        | No   | `pending`, `done` o `overdue`                          |
| `done_at`, `done_by`, `done_note`  |             | Sí   | Cuándo, quién y cómo se cumplió                        |
| `reminded_at`                      | timestamptz | Sí   | Cuándo se avisó 7 días antes                           |

Índices `(tenant_id, contract_id)` y `(tenant_id, status, due_on)`.

## ctr_amendments · Otrosíes y prórrogas

| Columna                                         | Tipo          | Nulo  | Regla                                                       |
| ----------------------------------------------- | ------------- | ----- | ----------------------------------------------------------- |
| `contract_id`                                   | uuid          | No    | Contrato                                                    |
| `code`, `sequence`                              | text, smallint| No    | Código del contrato más `-OT01`; único                      |
| `kind`                                          | text          | No    | `amendment` (otrosí) o `extension` (prórroga)               |
| `status`                                        | text          | No    | `in_review`, `approved`, `returned` o `signed`              |
| `summary`, `body`                               | text          | No    | 3 a 500 y 10 a 10 000 letras                                |
| `effective_on`                                  | date          | No    | Desde cuándo rige                                           |
| `new_ends_on`, `new_value`                      |               | Sí    | Lo que cambia; una prórroga siempre trae la nueva fecha     |
| `workflow_instance_id`, `decided_by`, `decided_at`, `decision_note` | | Sí | Aprobación de la Dirección                                 |
| `pdf_status`, `pdf_file_id`, `pdf_sha256`       |               | No/Sí | PDF del otrosí                                              |
| `signed_file_id`, `signed_on`, `signed_by`      |               | Sí    | Copia firmada; al registrarla, el otrosí rige               |

Disparador `ctr_amendments_keep`: el texto no cambia después de creado y uno firmado no cambia
nada más.

## Funciones del worker

`ctr_tenants_with_pdf_work()` (contratos y otrosíes con el PDF pendiente) y
`ctr_tenants_with_follow_up()` (contratos que rigen y obligaciones pendientes), `SECURITY DEFINER`:
solo devuelven identificadores de empresas. Las políticas `*_system_lookup` les dejan leer las
filas de todas las empresas dentro de esas funciones, como en las cotizaciones (B23).
