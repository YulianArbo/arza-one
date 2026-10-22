# Diccionario de datos · Terceros (pty\_)

Tipos exactos, restricciones e índices de las tablas del dominio `pty_` (capítulo 12.3, ficha
17.3). Se actualiza en el mismo pull request que cambia el modelo
(`apps/api/prisma/schema.prisma`). Migración: `20261014000000_pty_parties_contacts_bank_accounts`.

## Reglas comunes

- **Columnas de control** (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`,
  `deleted_at`): las fija el disparador `core_set_control_columns()`, igual que en el núcleo
  ([core.md](core.md)). `created_by` es la persona de la sesión: en las revisiones de dos personas
  la base de datos la usa para saber quién registró.
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()`, como en el núcleo.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`. Sin `DELETE`: el borrado es lógico.
- **Llaves foráneas compuestas** `(tenant_id, …)`: una fila nunca apunta a un tercero de otra
  empresa, aunque el código se equivoque.
- **Auditoría**: cada escritura deja su evento (`party.*`) en `aud_events`; la línea de tiempo del
  tercero se arma con esos eventos. Nunca se registra el número de una cuenta bancaria.

## pty_parties · Terceros

Registro único de cada persona u organización. Un duplicado fusionado conserva su fila con
`merged_into_id` y `deleted_at`: su historial sigue a la vista desde el tercero que se conservó.

| Columna              | Tipo     | Nulo | Por defecto | Regla                                                                          |
| -------------------- | -------- | ---- | ----------- | ------------------------------------------------------------------------------ |
| `id`                 | uuid     | No   | UUID v7     | Llave primaria                                                                 |
| `tenant_id`          | uuid     | No   |             | Empresa                                                                        |
| `kind`               | text     | No   |             | `person` u `organization`                                                      |
| `legal_name`         | text     | Sí   |             | Razón social: obligatoria en organizaciones (2 a 160), vacía en personas       |
| `trade_name`         | text     | Sí   |             | Nombre comercial; solo organizaciones                                          |
| `first_name`         | text     | Sí   |             | Nombres: obligatorios en personas (2 a 80), vacíos en organizaciones           |
| `last_name`          | text     | Sí   |             | Apellidos: igual que los nombres                                               |
| `id_type`            | text     | Sí   |             | Código del catálogo `identification_types` (CC, CE, NIT, PA, TI, PPT…). Vacío solo en un prospecto (B22) |
| `id_number`          | text     | Sí   |             | 3 a 20 letras mayúsculas o números, sin puntos ni guiones. Va junto con `id_type` |
| `check_digit`        | smallint | Sí   |             | Solo el NIT, y debe ser `pty_nit_check_digit(id_number)`; vacío en los demás   |
| `email`              | text     | Sí   |             | Correo                                                                         |
| `phone`              | text     | Sí   |             | Teléfono, guardado sin espacios                                                |
| `city`, `address`    | text     | Sí   |             | Ciudad y dirección                                                             |
| `status`             | text     | No   | `active`    | `prospect`, `active`, `inactive` o `blocked`                                   |
| `status_reason`      | text     | Sí   |             | Obligatorio si está bloqueado                                                  |
| `data_purpose`       | text     | Sí   |             | Sin uso desde B17 (ver prv_consents); se borrará en una fase de contraer         |
| `data_authorization` | text     | Sí   |             | Sin uso desde B17                                                                |
| `data_authorized_on` | date     | Sí   |             | Sin uso desde B17                                                                |
| `merged_into_id`     | uuid     | Sí   |             | Tercero en que se fusionó; exige `deleted_at` y no puede ser él mismo          |
| control              |          |      |             | Columnas de control                                                            |

Índices: únicos `(tenant_id, id)` y `(tenant_id, id_type, id_number)` (el documento no se repite
en la empresa, ni siquiera con un duplicado fusionado); `(tenant_id, merged_into_id)`,
`(tenant_id, status)`, `(tenant_id, email)` y `(tenant_id, phone)` para listar y buscar duplicados.

Desde B17 la autorización de tratamiento de una persona no vive aquí: se registra en
`prv_consents` con la versión exacta del texto aceptado ([prv.md](prv.md)). Las columnas
`data_purpose`, `data_authorization` y `data_authorized_on` se trasladaron allá y quedan sin uso
hasta una migración posterior de contraer (numeral 10.6); ya no son obligatorias.

Desde B22 un **prospecto** puede registrarse sin documento: a quien apenas pregunta no se le pide la
cédula (Ley 1581, principio de finalidad). Dos reglas de la base lo cuidan:
`pty_parties_document_pair_check` (el tipo y el número van juntos, y sin documento no hay dígito) y
`pty_parties_document_required_check` (solo un prospecto queda sin documento). Para pasarlo a
activo, o para ganarle una oportunidad en el CRM, se completa el documento.

La función `pty_nit_check_digit(text)` calcula el dígito de verificación con los pesos de la DIAN
(3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71) y módulo 11. La web y la API usan el
mismo cálculo (`packages/contracts/src/party/nit.ts`).

## pty_party_roles · Papeles

Un papel por tercero; al terminar queda `ended` y la auditoría guarda cuándo.

| Columna    | Tipo | Nulo | Por defecto | Regla                                                         |
| ---------- | ---- | ---- | ----------- | ------------------------------------------------------------- |
| `id`       | uuid | No   | UUID v7     | Llave primaria                                                |
| `party_id` | uuid | No   |             | Tercero                                                       |
| `role`     | text | No   |             | `customer`, `supplier`, `employee`, `contact` o `candidate`   |
| `since`    | date | No   |             | Desde cuándo está vigente                                     |
| `status`   | text | No   | `active`    | `active` o `ended`                                            |
| control    |      |      |             | Columnas de control                                           |

Índice único `(tenant_id, party_id, role)`.

## pty_contacts · Contactos y firmantes

| Columna           | Tipo    | Nulo | Por defecto | Regla                                                            |
| ----------------- | ------- | ---- | ----------- | ---------------------------------------------------------------- |
| `id`              | uuid    | No   | UUID v7     | Llave primaria                                                   |
| `organization_id` | uuid    | No   |             | Tercero organización                                             |
| `person_id`       | uuid    | No   |             | Tercero persona; distinto de la organización                     |
| `job_title`       | text    | Sí   |             | Cargo, 2 a 120                                                   |
| `is_primary`      | boolean | No   | `false`     | Contacto principal; la API deja uno solo por organización         |
| `can_sign`        | boolean | No   | `false`     | Firmante autorizado                                              |
| control           |         |      |             | Columnas de control; retirar un contacto llena `deleted_at`      |

Índices: único `(tenant_id, organization_id, person_id)` (una persona que vuelve a ser contacto
reutiliza su fila) y `(tenant_id, person_id)`.

## pty_bank_accounts · Cuentas bancarias

Dato restringido (numeral 12.4). El número se cifra con AES-256-GCM y la llave
`FIELD_ENCRYPTION_KEY` (fuera de la base), atado a la empresa y a la fila: copiado a otra fila no
se descifra.

| Columna                    | Tipo        | Nulo | Por defecto | Regla                                                                    |
| -------------------------- | ----------- | ---- | ----------- | ------------------------------------------------------------------------ |
| `id`                       | uuid        | No   | UUID v7     | Llave primaria                                                           |
| `party_id`                 | uuid        | No   |             | Tercero                                                                  |
| `bank`                     | text        | No   |             | Código del catálogo `banks`                                              |
| `account_type`             | text        | No   |             | `savings` o `checking`                                                   |
| `account_number_encrypted` | text        | No   |             | Número cifrado; empieza por `v1.`                                        |
| `account_last4`            | text        | No   |             | Cuatro últimos dígitos, lo único en claro                                |
| `status`                   | text        | No   | `pending`   | `pending`, `approved`, `rejected` o `replaced`                           |
| `replaces_id`              | uuid        | Sí   |             | Cuenta aprobada que reemplaza al aprobarse                               |
| `reviewed_by`              | uuid        | Sí   |             | Quién aprobó o rechazó; **nunca igual a `created_by`**                   |
| `reviewed_at`              | timestamptz | Sí   |             | Obligatorio si ya no está pendiente                                      |
| `review_note`              | text        | Sí   |             | Motivo del rechazo                                                       |
| control                    |             |      |             | Columnas de control                                                      |

El disparador `pty_keep_reviews()` impide cambiar el número, el banco o el tipo de una cuenta, y
reabrir una revisión: una aprobada solo puede pasar a reemplazada. Índices: único
`(tenant_id, id)`, `(tenant_id, party_id)` y `(tenant_id, replaces_id)`.

## pty_due_diligence · Conocimiento del tercero

Versión mínima del FT-FIN-007 aprobada en B13. El formulario completo se enlazará cuando existan
los formularios dinámicos.

| Columna          | Tipo        | Nulo | Por defecto | Regla                                                         |
| ---------------- | ----------- | ---- | ----------- | ------------------------------------------------------------- |
| `id`             | uuid        | No   | UUID v7     | Llave primaria                                                |
| `party_id`       | uuid        | No   |             | Tercero                                                       |
| `risk_level`     | text        | No   |             | `low`, `medium` o `high`                                      |
| `summary`        | text        | No   |             | Qué se revisó y qué se encontró, 10 a 4000                    |
| `status`         | text        | No   | `pending`   | `pending`, `approved` o `rejected`                            |
| `reviewed_by`    | uuid        | Sí   |             | Nunca igual a `created_by`                                    |
| `reviewed_at`    | timestamptz | Sí   |             | Obligatorio si ya no está pendiente                           |
| `review_note`    | text        | Sí   |             | Motivo del rechazo                                            |
| `next_review_on` | date        | Sí   |             | Obligatoria al aprobar; por defecto, doce meses después       |
| control          |             |      |             | Columnas de control                                           |

El mismo disparador `pty_keep_reviews()` impide cambiar el riesgo, el resumen o reabrir una
revisión. Índice `(tenant_id, party_id)`. Un tercero está **apto** si su último conocimiento está
aprobado y su próxima revisión no ha pasado.

## Evento de la bandeja de salida

| Evento         | Datos                          | Para qué                                                      |
| -------------- | ------------------------------ | ------------------------------------------------------------- |
| `party.merged` | `survivor_id`, `duplicate_id`  | Que los módulos que guardan `party_id` reasignen sus registros |
