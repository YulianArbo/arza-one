# Diccionario de datos · Firma electrónica (sig\_)

Tipos exactos, restricciones e índices de las tablas de la firma electrónica (capítulo 19, ficha
17.7, numeral 12.4). Se actualiza en el mismo pull request que cambia el modelo
(`apps/api/prisma/schema.prisma`). Migración: `20261031000000_sig_envelopes_signers_events_verifications`
(B25).

## Reglas comunes

- **Nivel**: solo el nivel 2 del numeral 19.1 (enlace único y código al correo). El nivel 3 (firma
  digital certificada) llega con un proveedor externo.
- **Sello de integridad de la empresa (B43)**: el PDF firmado por todos se sella con el certificado
  de la empresa (firma CMS separada, PAdES básico) antes de calcular su huella. Cualquier lector de
  PDF muestra quién lo selló y avisa si el archivo cambió. El certificado llega al worker en
  `PDF_SEAL_PKCS12` y `PDF_SEAL_PASSPHRASE` (obligatorios en producción); fuera de producción se usa
  uno temporal sin validez. Los procesos firmados antes de B43 no se vuelven a sellar.
- **Columnas de control** en `sig_envelopes` y `sig_signers`: las fija `core_set_control_columns()`
  ([core.md](core.md)). `sig_events` y `sig_verifications` solo se agregan: no tienen versión.
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()` en las cuatro tablas.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE` en procesos y firmantes; solo `SELECT` e
  `INSERT` en eventos y verificaciones, que además un disparador (`sig_append_only`) protege contra
  cambios y borrados aunque alguien los intente directo en la base.
- **Otros módulos**: el contrato tiene llave foránea (`contract_id`, del mismo módulo M06). El
  otrosí (`amendment_id`), el PDF (`document_file_id`, `signed_file_id`, `evidence_file_id`), la
  persona de Terceros (`party_id`), la cuenta (`user_id`) y el trámite (`workflow_instance_id`) se
  guardan por identificador, sin llave a tablas de otros módulos.
- **Diferencia con el numeral 12.4**: el manual nombra `document_version_id`. Los contratos del B24
  guardan su PDF aprobado como archivo, no como versión documental; por eso el proceso guarda el
  archivo (`document_file_id`) y su huella (`document_sha256`), que no cambian.
- **Llaves y códigos**: la llave del enlace, el código de seis números y la confirmación del código
  nunca se guardan: solo su huella SHA-256. El código del correo dura 10 minutos y admite 5 intentos
  por enlace; la confirmación, 30 minutos.
- **Auditoría** (`aud_events`): `signature.envelope.create` · `send` · `cancel` · `reject` ·
  `expire` · `complete` · `seal`, `signature.sign`, `signature.code.request` · `issue` · `email` ·
  `verify` · `fail` · `lock`, `signature.link.issue` · `open` · `resend`, `signature.email`,
  `signature.document.view` · `download`, `signature.reminder.schedule`,
  `signature.certificate.store`, `signature.verify` y, sobre el contrato,
  `contract.signature.electronic`.
- **Bandeja de salida**: `signature.envelope.created` · `sent` · `signed` · `rejected` · `expired` ·
  `cancelled`, `signature.signer.signed` y `envelope.completed` (numeral 13.3), que avisa al
  responsable y al autor y que usará Proyectos (B26) para proponer el proyecto.
- **Consecutivo**: `FE-AAAA-NNNN` (`sig.envelope`).

## sig_envelopes · Procesos de firma

| Columna                     | Tipo        | Nulo | Regla                                                                      |
| --------------------------- | ----------- | ---- | -------------------------------------------------------------------------- |
| `id`, `tenant_id`           | uuid        | No   | Llave primaria y empresa                                                   |
| `code`                      | text        | No   | `FE-2026-0001`; único por empresa                                          |
| `source`                    | text        | No   | `contract` o `amendment` (con `amendment_id`)                              |
| `contract_id`               | uuid        | No   | El contrato (llave foránea a `ctr_contracts`)                              |
| `amendment_id`              | uuid        | Sí   | El otrosí, si es lo que se firma                                           |
| `document_file_id`          | uuid        | No   | El PDF aprobado que se envió a firma                                       |
| `document_sha256`           | text        | No   | Su huella; también es el origen de la cadena de eventos                    |
| `document_code`, `_title`   | text        | No   | Código y título, como los ve quien firma                                   |
| `level`                     | smallint    | No   | Siempre `2`                                                                |
| `status`                    | text        | No   | `draft`, `sent`, `completed`, `rejected`, `expired` o `cancelled`          |
| `message`                   | text        | Sí   | Mensaje para los firmantes (1 a 1000 letras)                               |
| `expires_at`                | timestamptz | No   | 11:59:59 p. m. (Colombia) del último día para firmar; 30 días como máximo  |
| `sent_at`, `sent_by`        |             | Sí   | Cuándo y quién lo envió                                                    |
| `send_key`                  | text        | Sí   | La llave `Idempotency-Key` del envío: repetirlo con ella no cambia nada    |
| `completed_at`              | timestamptz | Sí   | Cuando firmó el último                                                     |
| `closed_at`, `closed_reason`|             | Sí   | Cerrado sin firmar: por qué (rechazo, vencimiento o anulación)             |
| `last_event_hash`           | text        | No   | Huella del último evento de la cadena                                      |
| `event_count`               | integer     | No   | Cuántos eventos tiene la cadena                                            |
| `workflow_instance_id`      | uuid        | Sí   | La tarea «Firmar … por la empresa» (flujo `sig.company`)                   |
| `seal_status`               | text        | No   | `none`, `pending` (el worker arma el firmado) o `ready`                    |
| `signed_file_id`, `_sha256` |             | Sí   | El PDF firmado (original + página de firmas + certificado) y su huella     |
| `seal_certificate_sha256`   | text        | Sí   | Huella del certificado que selló el PDF (B43); no cambia una vez escrita   |
| `evidence_file_id`          | uuid        | Sí   | El certificado de evidencia, aparte                                        |
| `verification_code`         | text        | Sí   | `XXXX-XXXX-XXXX`, único; para la verificación pública                      |
| control                     |             |      | Columnas de control                                                        |

Índices: un solo proceso abierto (`draft` o `sent`) por contrato y por otrosí
(`sig_envelopes_open_contract_key`, `sig_envelopes_open_amendment_key`); por la huella del
firmado, para verificar un archivo. Disparador `sig_envelopes_keep`: el documento no cambia; un
proceso cerrado no cambia; uno firmado solo agrega su documento firmado, que después no se
reemplaza.

## sig_signers · Firmantes

| Columna                         | Tipo        | Nulo | Regla                                                                |
| ------------------------------- | ----------- | ---- | -------------------------------------------------------------------- |
| `id`, `tenant_id`, `envelope_id`| uuid        | No   | Llave primaria, empresa y proceso                                    |
| `kind`                          | text        | No   | `client` (con `party_id`) o `company` (con `user_id`)                |
| `party_id`, `user_id`           | uuid        | Sí   | La persona de Terceros; la cuenta de la Dirección                    |
| `name`, `email`, `id_number`    | text        | No   | Copiados al preparar; no cambian después de firmar                   |
| `role`                          | text        | No   | «Por Comercializadora Andina S.A.S.», «En nombre propio»…            |
| `sign_order`                    | smallint    | No   | 1 a 6; único por proceso. La empresa, de última                      |
| `status`                        | text        | No   | `waiting`, `pending`, `signed` o `rejected`                          |
| `link_token_hash`, `_expires_at`|             | Sí   | Huella de la llave del último enlace enviado; única                  |
| `mail_pending`                  | text        | Sí   | Correo por enviar: `invitation`, `reminder` o `copy`                 |
| `code_*`                        |             |      | Pedido, huella, vencimiento, envío, intentos (0 a 5) y bloqueo       |
| `ticket_hash`, `_expires_at`    |             | Sí   | Confirmación del código (30 minutos)                                 |
| `opened_at`                     | timestamptz | Sí   | Primera vez que abrió el enlace                                      |
| `reminders`, `last_notified_at` |             |      | Recordatorios enviados (0 a 3) y último correo                       |
| `method`                        | text        | Sí   | `email_code` o `session_mfa`                                         |
| `signed_at`, `sign_ip`, `sign_user_agent`, `acceptance_text` | | Sí | La evidencia de la firma                                  |
| `rejected_at`, `reject_reason`  |             | Sí   | El rechazo y su motivo                                               |
| control                         |             |      | Columnas de control                                                  |

Disparador `sig_signers_keep`: quién firma y su turno no cambian; una firma o un rechazo
registrados no cambian.

## sig_events · Cadena de eventos

| Columna                           | Tipo        | Nulo | Regla                                                            |
| --------------------------------- | ----------- | ---- | ---------------------------------------------------------------- |
| `id`, `tenant_id`, `envelope_id`  | uuid        | No   | Llave primaria, empresa y proceso                                |
| `signer_id`                       | uuid        | Sí   | El firmante, si el evento es suyo                                |
| `sequence`                        | integer     | No   | 1, 2, 3…; único por proceso                                      |
| `type`                            | text        | No   | `created`, `sent`, `invited`, `reminded`, `opened`, `code_sent`, `code_verified`, `code_failed`, `code_locked`, `viewed`, `downloaded`, `signed`, `rejected`, `cancelled`, `expired`, `completed`, `sealed` o `copy_sent` |
| `ip`, `user_agent`                | text        | Sí   | Desde dónde                                                      |
| `occurred_at`                     | timestamptz | No   | Hora del servidor                                                |
| `details`                         | jsonb       | No   | Datos mínimos, como el método o la huella del documento          |
| `prev_hash`, `hash`               | text        | No   | Huella del evento anterior y la propia (`linkHash()`)            |

La huella de cada evento se calcula sobre sus datos y la huella anterior; la primera parte de la
huella del documento. `chainIntact()` comprueba que la cadena esté completa y sin cambios.

## sig_verifications · Consultas a la verificación pública

| Columna                          | Tipo        | Nulo | Regla                                   |
| -------------------------------- | ----------- | ---- | --------------------------------------- |
| `id`, `tenant_id`, `envelope_id` | uuid        | No   | Llave primaria, empresa y proceso       |
| `method`                         | text        | No   | `code` o `file`                         |
| `result`                         | text        | No   | `valid` o `mismatch`                    |
| `ip`                             | text        | Sí   | Desde dónde                             |
| `verified_at`                    | timestamptz | No   | Cuándo                                  |

Solo se guardan las consultas que encontraron un documento: una consulta que no encuentra nada no
pertenece a ninguna empresa.

## Funciones del sistema

Son de `migration_user` (`SECURITY DEFINER`) y solo devuelven identificadores:
`sig_find_signer_link(huella)` (la página de firma), `sig_find_signed_document(código, huella)` (la
verificación pública), `sig_tenants_with_work()` y `sig_tenants_with_follow_up()` (el worker).

## Cambios en Contratos

`ctr_contracts.status` y `ctr_amendments.status` admiten `in_signature` («En firma»). Al firmar
todos, el contrato queda `active` con el PDF firmado como su copia firmada (`signed_file_id`), o el
otrosí queda `signed` y rige como con la firma manuscrita.
