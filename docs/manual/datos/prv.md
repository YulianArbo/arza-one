# Diccionario de datos · Privacidad (prv\_)

Tipos exactos, restricciones e índices de las tablas de privacidad (capítulo 12.3, ficha 17.19,
numeral 20.1). Se actualiza en el mismo pull request que cambia el modelo
(`apps/api/prisma/schema.prisma`). Migración: `20261018000000_prv_notices_consents_activities_processors`
(B17), `20261125000000_web_public_site_legal_cookies` (B41: `prv_cookie_consents`) y
`20261126000000_prv_requests_incidents_exports` (B42: solicitudes, entregas e incidentes).

## Reglas comunes

- **Columnas de control** (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`,
  `deleted_at`): las fija el disparador `core_set_control_columns()`, igual que en el núcleo
  ([core.md](core.md)). En `prv_consents`, `created_by` es quien registró la autorización.
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en todas las tablas.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`. Sin `DELETE`: el borrado es lógico.
- **Terceros y archivos**: se guardan por identificador, sin llave foránea a las tablas de otros
  módulos. Los nombres de los terceros se piden por el puerto `PARTY_DIRECTORY`, que implementa el
  módulo de terceros; los archivos se validan con el índice de `doc` (propio y ya revisado).
- **Auditoría** (`aud_events`): `privacy.notice.create` · `update` · `publish`,
  `privacy.consent.grant` · `revoke`, `privacy.activity.create` · `update` y
  `privacy.processor.create` · `update`. La semilla deja los mismos eventos con actor «sistema».

## prv_notices · Avisos y políticas versionados

| Columna          | Tipo        | Nulo | Por defecto | Regla                                                                         |
| ---------------- | ----------- | ---- | ----------- | ----------------------------------------------------------------------------- |
| `id`             | uuid        | No   | UUID v7     | Llave primaria                                                                |
| `tenant_id`      | uuid        | No   |             | Empresa                                                                       |
| `key`            | text        | No   |             | Clase de texto (tabla siguiente)                                              |
| `version_number` | integer     | No   |             | 1, 2, 3… dentro de la clase. Único con `(tenant_id, key)`                     |
| `title`          | text        | No   |             | 3 a 200 caracteres                                                            |
| `body`           | text        | No   |             | Texto completo, 50 a 20 000 caracteres                                        |
| `purposes`       | text[]      | No   | `{}`        | Autorizaciones: códigos de `personal_data_purposes` que ofrece (1 a 20)       |
| `status`         | text        | No   | `draft`     | `draft`, `published` o `replaced`                                             |
| `effective_from` | timestamptz | Sí   |             | Desde cuándo rige; vacío solo en borrador                                     |
| control          |             |      |             | Columnas de control                                                           |

| Clase                     | Texto                                         | Lleva finalidades |
| ------------------------- | --------------------------------------------- | ----------------- |
| `privacy_policy`          | Política de tratamiento (PL-DG-002)           | No                |
| `privacy_notice`          | Aviso de privacidad                           | No                |
| `portal_terms`            | Términos de uso del portal del cliente (B30)  | No                |
| `authorization_customer`  | Autorización de clientes (FT-DG-003)          | Sí                |
| `authorization_supplier`  | Autorización de proveedores                   | Sí                |
| `authorization_employee`  | Autorización de colaboradores                 | Sí                |
| `authorization_candidate` | Autorización de candidatos                    | Sí                |
| `authorization_contact`   | Autorización de contactos                     | Sí                |
| `authorization_prior`     | Registro anterior a B17 (solo la migración)   | Sí                |

El disparador `prv_keep_notices` impide cambiar la clase, el número o el borrado lógico, y el
texto, las finalidades o la fecha de lo publicado; solo deja pasar de borrador a publicado y de
publicado a reemplazado, y admite a lo más un borrador y un publicado por clase. Índices: únicos
`(tenant_id, id)` y `(tenant_id, key, version_number)`; `(tenant_id, key, status)`.

## prv_consents · Autorizaciones de tratamiento

| Columna             | Tipo        | Nulo | Por defecto | Regla                                                                       |
| ------------------- | ----------- | ---- | ----------- | --------------------------------------------------------------------------- |
| `id`                | uuid        | No   | UUID v7     | Llave primaria                                                              |
| `tenant_id`         | uuid        | No   |             | Empresa                                                                     |
| `party_id`          | uuid        | No   |             | Titular (tercero persona)                                                   |
| `notice_id`         | uuid        | No   |             | Versión exacta del texto aceptado; llave foránea a `prv_notices`            |
| `purposes`          | text[]      | No   |             | Finalidades autorizadas (1 a 20), entre las que ofrece el texto             |
| `channel`           | text        | No   |             | `written`, `digital`, `verbal` o `contract`                                 |
| `granted_on`        | date        | No   |             | Fecha en que el titular autorizó; nunca posterior a hoy                     |
| `source`            | text        | No   |             | `party_create`, `party_consent` o `prior_record` (traslado de B13)          |
| `ip_address`        | text        | Sí   |             | Evidencia: desde dónde se registró                                          |
| `user_agent`        | text        | Sí   |             | Evidencia: navegador                                                        |
| `evidence_file_id`  | uuid        | Sí   |             | Soporte opcional: archivo propio ya revisado por el antivirus               |
| `revoked_at`        | timestamptz | Sí   |             | Revocatoria                                                                 |
| `revoked_by`        | uuid        | Sí   |             | Quién la revocó; obligatorio si está revocada                               |
| `revocation_reason` | text        | Sí   |             | Motivo de 5 a 500 caracteres; obligatorio si está revocada                  |
| control             |             |      |             | Columnas de control                                                         |

El disparador `prv_keep_consents` solo acepta una autorización sobre un texto de autorización
publicado (la de `prior_record`, solo sobre `authorization_prior`), impide cambiar cualquier dato
y deja revocar una sola vez. Índices: único `(tenant_id, id)`; `(tenant_id, party_id)`,
`(tenant_id, notice_id)` y `(tenant_id, created_at)`.

**Traslado de B13.** Las personas que tenían `data_purpose`, `data_authorization` y
`data_authorized_on` en `pty_parties` recibieron una autorización con esa finalidad, ese canal y
esa fecha, ligada al texto «Registro anterior a B17» de su empresa, que nace reemplazado. El
traslado corre empresa por empresa con la seguridad por fila activa. Las tres columnas se
conservan sin uso (numeral 10.6): la versión anterior de la API las usa durante un despliegue.

## prv_processing_activities · Registro de actividades de tratamiento

| Columna                   | Tipo   | Nulo | Por defecto | Regla                                                                      |
| ------------------------- | ------ | ---- | ----------- | -------------------------------------------------------------------------- |
| `id`                      | uuid   | No   | UUID v7     | Llave primaria                                                             |
| `tenant_id`               | uuid   | No   |             | Empresa                                                                    |
| `name`                    | text   | No   |             | 3 a 150 caracteres                                                         |
| `purpose`                 | text   | No   |             | Finalidad, 10 a 1 000 caracteres                                           |
| `data_categories`         | text[] | No   |             | 1 a 10 de: `identification`, `contact`, `demographic`, `financial`, `employment`, `education`, `images`, `location`, `health`, `biometric` (los dos últimos son sensibles) |
| `holder_types`            | text[] | No   |             | 1 a 7 de: `customers`, `suppliers`, `employees`, `candidates`, `contacts`, `visitors`, `users` |
| `legal_basis`             | text   | No   |             | Fundamento legal, 10 a 500 caracteres                                      |
| `retention`               | text   | No   |             | Tiempo de conservación, 5 a 300 caracteres                                 |
| `international_transfers` | text   | Sí   |             | Países y destinatarios, 5 a 500 caracteres; vacío si no hay                |
| `status`                  | text   | No   | `active`    | `active` o `inactive`                                                      |
| control                   |        |      |             | Columnas de control                                                        |

## prv_processors · Encargados del tratamiento

| Columna            | Tipo | Nulo | Por defecto | Regla                                                                       |
| ------------------ | ---- | ---- | ----------- | --------------------------------------------------------------------------- |
| `id`               | uuid | No   | UUID v7     | Llave primaria                                                              |
| `tenant_id`        | uuid | No   |             | Empresa                                                                     |
| `party_id`         | uuid | No   |             | Tercero organización vigente que presta el servicio                         |
| `service`          | text | No   |             | Qué hace con los datos, 3 a 300 caracteres                                  |
| `country`          | text | No   |             | Código ISO 3166-1 de dos letras mayúsculas                                  |
| `contract_file_id` | uuid | Sí   |             | Contrato de transmisión; vacío: la pantalla muestra «Falta contrato»        |
| `review_on`        | date | No   |             | Próxima revisión                                                            |
| `status`           | text | No   | `active`    | `active` o `inactive`                                                       |
| control            |      |      |             | Columnas de control                                                         |

El manual nombra la columna del contrato `contract_document_id`; mientras no exista la gestión
documental de B18 se guarda el archivo (B14), por eso se llama `contract_file_id`.

## prv_activity_processors · Encargados de cada actividad

| Columna        | Tipo | Nulo | Regla                                                                 |
| -------------- | ---- | ---- | --------------------------------------------------------------------- |
| `id`           | uuid | No   | Llave primaria                                                        |
| `tenant_id`    | uuid | No   | Empresa                                                               |
| `activity_id`  | uuid | No   | Llave foránea a `prv_processing_activities`                           |
| `processor_id` | uuid | No   | Llave foránea a `prv_processors`                                      |
| control        |      |      | Un encargado que sale de la actividad queda con `deleted_at`; si vuelve, se recupera |

Índices: únicos `(tenant_id, id)` y `(tenant_id, activity_id, processor_id)`;
`(tenant_id, processor_id)`.

## prv_cookie_consents · Elecciones de cookies (B41; consulta y retención en B42)

Se creó en B41 (decisión 4). La aplicación solo agrega filas. B42 agrega la consulta y el informe
(`/v1/privacy/cookie-consents`) y la retención: el trabajo diario borra las de más de tres años con
la función `prv_purge_cookie_consents(cutoff)`, que corre como dueña del esquema y solo en la
empresa de la transacción.

## prv_requests · Solicitudes de titulares (B42)

| Columna                   | Tipo        | Nulo | Regla                                                                                     |
| ------------------------- | ----------- | ---- | ----------------------------------------------------------------------------------------- |
| `code`                    | text        | No   | PRV-AAAA-NNNN, del servicio de consecutivos; único por empresa                            |
| `right`                   | text        | No   | `know`, `proof`, `usage` (consulta) · `update`, `rectify`, `erase`, `revoke`, `complaint` |
| `kind`                    | text        | No   | `inquiry` o `claim`; debe corresponder al derecho                                         |
| `channel`                 | text        | No   | `web`, `portal`, `email`, `phone`, `in_person`, `written` o `pqrsf`                       |
| `status`                  | text        | No   | `received` → `verifying` → `in_progress` → `responded` → `closed`                         |
| `requester_*`             | text        | Sí   | Nombre (obligatorio), correo y teléfono de quien la presentó                              |
| `document_number`         | text        | Sí   | Documento que dio el titular                                                              |
| `party_id`                | uuid        | Sí   | Titular en Terceros; obligatorio al verificar                                             |
| `portal_user_id`          | uuid        | Sí   | Cuenta del portal que la presentó                                                         |
| `source_code`             | text        | Sí   | Radicado de la PQRSF trasladada                                                           |
| `received_at`             | timestamptz | No   | El plazo corre desde el día hábil siguiente                                               |
| `due_on`                  | date        | Sí   | Fecha límite legal; vacía solo mientras un reclamo espera que lo completen                |
| `extended_at` · `extension_reason` | | Sí | Una sola prórroga, con su motivo                                                          |
| `requirement_*`           |             | Sí   | Texto pedido al titular, cuándo se pidió y cuándo lo completó (solo reclamos)             |
| `verification_*` · `verified_*` |       | Sí   | Cómo se comprobó la identidad (`document`, `email_match`, `in_person`, `portal_session`)  |
| `response` · `responded_*` |            | Sí   | Respuesta enviada                                                                         |
| `closure` · `closed_at`   |             | Sí   | `answered` o `desisted` (dos meses sin completar el reclamo)                              |
| `erasure` · `erased_at`   | jsonb       | Sí   | Resultado de la supresión por módulo                                                      |
| `workflow_instance_id`    | uuid        | Sí   | Trámite `prv.request` con la tarea del Oficial                                            |
| `warned_for` · `breached_for` | date    | Sí   | Fecha límite ya avisada (para no repetir el aviso)                                        |

## prv_request_events · Historia de cada solicitud (B42)

`kind` (`received`, `verification_started`, `verified`, `requirement`, `requirement_answered`,
`extended`, `exported`, `erased`, `responded`, `closed`, `desisted`), `note`, `actor_id`,
`occurred_at`, y `mail_pending` / `mailed_at` para lo que se le envía al titular. Solo se agrega.

## prv_data_exports · Entregas de los datos de un titular (B42)

`request_id`, `party_id`, `status` (`pending`, `ready`, `failed`), `content` (los datos reunidos,
con etiquetas en español), `pdf_file_id` y `ready_at` cuando el worker termina el PDF, `attempts`
de los intentos fallidos (cinco y queda `failed`).

## prv_incidents · Incidentes con datos personales (B42)

`code` (IDP-AAAA-NNNN), `title`, `description`, `detected_at`, `affected_count`,
`data_categories` (1 a 10 del catálogo de la tabla de actividades), `project_incident_ref`,
`status` (`open` → `contained` → `reported` → `closed`), `sic_due_on` (15 días hábiles desde la
detección), contención, reporte (`reported_on` y `sic_reference` juntos), aviso a titulares
(`holders_notified_on` y `holders_notice` juntos) y `not_reportable_reason` (obligatorio para
cerrar sin reporte). La bitácora va en `prv_incident_measures` (`description`, `taken_on`), que
solo se agrega.

## Columnas que B42 agrega en otros módulos

- `pty_parties.data_blocked_at` · `data_block_reason` · `data_erased_at`: el titular bloqueado
  por deber legal o suprimido. Al suprimir, la ficha queda anónima, como prospecto y retirada.
- `web_form_submissions.email` admite vacío y `anonymized_at`: el formulario anónimo a pedido del
  titular o a los dos años.

**Auditoría** de B42: `privacy.request.receive` · `verification_start` · `verify` · `require` ·
`requirement_answer` · `extend` · `respond` · `close` · `desist` · `consult` · `mail` ·
`export_register` · `due_soon` · `due`, `privacy.data.export` · `export_render` · `erase` ·
`account_erase`, `privacy.incident.create` · `update` · `contain` · `report` · `notify_holders` ·
`measure_add` · `close` · `export_register`, `privacy.cookie_consent.purge`,
`party.personal_data.erase` · `block`, `hr.candidate.erase` y `web.form.anonymize`.
