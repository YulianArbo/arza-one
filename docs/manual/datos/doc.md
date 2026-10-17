# Diccionario de datos · Gestión documental (doc\_)

Tipos exactos, restricciones e índices de las tablas del dominio `doc_` (capítulo 12.3, ficha
17.4). Se actualiza en el mismo pull request que cambia el modelo
(`apps/api/prisma/schema.prisma`). Migraciones: `20261015000000_doc_files` (B14) y
`20261019000000_doc_documents_versions_folders` (B18).

Desde B18 existen las carpetas y expedientes (`doc_folders`), el documento lógico
(`doc_documents`), sus versiones (`doc_versions`), los vínculos con registros de otros módulos
(`doc_links`) y el registro de accesos a lo confidencial y restringido (`doc_access_log`). La
solicitud de acción documental, la constancia de lectura y la retención llegan en B19 a B21.

## Reglas comunes

- **Columnas de control** (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`,
  `deleted_at`): las fija el disparador `core_set_control_columns()`, igual que en el núcleo
  ([core.md](core.md)). `created_by` es quien pidió subir el archivo: con él se decide «lo propio».
- **Seguridad por fila**: activada y forzada con `core_current_tenant_id()`.
- **Permisos de `app_user`**: `SELECT`, `INSERT` y `UPDATE`. Sin `DELETE`: el borrado es lógico.
- **Auditoría**: `doc.file.create`, `doc.file.upload`, `doc.file.scan` (del sistema),
  `doc.file.download_link` y `doc.file.download` en `aud_events`. Un virus deja además el evento de
  seguridad `doc.file.virus_detected` (severidad alta). Nunca se registra la llave de un enlace.

## doc_files · Archivos

Un archivo guardado en el almacenamiento privado (Garage, ADR-013). El contenido nunca está en la
base de datos: `storage_key` dice dónde está.

| Columna       | Tipo        | Nulo | Por defecto      | Regla                                                                                       |
| ------------- | ----------- | ---- | ---------------- | ------------------------------------------------------------------------------------------- |
| `id`          | uuid        | No   | UUID v7          | Llave primaria                                                                              |
| `tenant_id`   | uuid        | No   |                  | Empresa                                                                                     |
| `storage_key` | text        | No   |                  | `<tenant_id>/<id>`: cada empresa en su propia carpeta del depósito. Única                   |
| `file_name`   | text        | No   |                  | Nombre original (1 a 200, sin barras ni caracteres de control); su extensión debe corresponder al tipo |
| `mime_type`   | text        | No   |                  | Lista blanca: PDF, PNG, JPEG, Word (.docx) y Excel (.xlsx)                                  |
| `size_bytes`  | integer     | No   |                  | De 1 byte a 20 MB (20 971 520)                                                              |
| `sha256`      | text        | Sí   |                  | Huella SHA-256 en hexadecimal (64 caracteres); la calcula el worker al analizar             |
| `scan_status` | text        | No   | `pending_upload` | `pending_upload` → `scanning` → `available` o `rejected`                                   |
| `rejection`   | text        | Sí   |                  | Solo si fue rechazado: `virus`, `type_mismatch` o `size_mismatch`                           |
| `scanned_at`  | timestamptz | Sí   |                  | Cuándo terminó el análisis; obligatorio si está disponible                                  |
| control       |             |      |                  | Columnas de control                                                                         |

Índices: únicos `(tenant_id, id)` y `(storage_key)`; `(tenant_id, created_by, created_at)` para la
lista de «lo propio», la más reciente primero.

Restricciones: `mime_type`, `size_bytes`, `scan_status`, `rejection` y el formato de `sha256` se
revisan en la base de datos, igual que en el contrato (`packages/contracts/src/doc/files.ts`). Un
archivo disponible tiene siempre huella y fecha de análisis.

El disparador `doc_keep_analyzed_files()` impide cambiar la huella, la llave, el tamaño, el tipo,
el estado o el motivo de un archivo ya analizado (disponible o rechazado): la huella siempre
corresponde al contenido que pasó por el antivirus.

## Ciclo de un archivo

1. `POST /v1/files` crea la fila en `pending_upload` y entrega un enlace de subida de un solo uso
   (15 minutos).
2. `PUT /v1/files/uploads/{llave}` guarda el contenido en Garage, pasa la fila a `scanning` y encola
   el trabajo `doc.file-scan`, todo o nada.
3. El worker pasa el contenido por ClamAV, revisa que sea del tipo y tamaño declarados y calcula la
   huella. Queda `available` o `rejected`; el contenido rechazado se borra del almacenamiento.
4. `POST /v1/files/{id}/download-link` entrega un enlace de cinco minutos, solo de un archivo
   disponible que la persona puede ver.

Los enlaces viven en Valkey (`doc:file-link:<huella de la llave>`) y se borran solos al vencer.

## doc_folders · Carpetas y expedientes (B18)

Árbol de carpetas del explorador. Un **expediente** (`case_file`) es la carpeta de un registro de
otro módulo; por ahora, de un tercero. La semilla crea `SGC` («Sistema de Gestión de Calidad»), una
carpeta `SGC-<proceso>` por proceso y `EXP` («Expedientes»).

| Columna          | Tipo | Nulo | Por defecto | Regla                                                                                  |
| ---------------- | ---- | ---- | ----------- | -------------------------------------------------------------------------------------- |
| `parent_id`      | uuid | Sí   |             | Carpeta que la contiene; null en la raíz. No cambia                                    |
| `code`           | text | Sí   |             | Solo las del sistema (`SGC`, `SGC-COM`, `EXP`); único por empresa                      |
| `name`           | text | No   |             | 2 a 120 caracteres                                                                     |
| `kind`           | text | No   | `folder`    | `folder` o `case_file`. No cambia                                                      |
| `entity_type`    | text | Sí   |             | `party` en un expediente. Único con `entity_id` por empresa: un expediente por tercero |
| `entity_id`      | uuid | Sí   |             | El tercero, por identificador (sin relación con las tablas `pty_`)                     |
| `classification` | text | No   | `internal`  | Clasificación sugerida para sus documentos                                             |
| control          |      |      |             | Columnas de control                                                                    |

Disparador `doc_keep_folders`: una carpeta no cambia de lugar, de código ni de registro.

## doc_documents · Documentos (B18)

| Columna              | Tipo    | Nulo | Por defecto | Regla                                                                                    |
| -------------------- | ------- | ---- | ----------- | ---------------------------------------------------------------------------------------- |
| `folder_id`          | uuid    | No   |             | Carpeta del documento. No cambia                                                         |
| `code`               | text    | No   |             | SGC: `TIPO-PROCESO-NNN` (PR-SGC-001); expediente: `DOC-AAAA-NNNN`. Único; no cambia      |
| `title`              | text    | No   |             | 3 a 200 caracteres; el de la versión vigente                                             |
| `doc_type`           | text    | No   |             | Catálogo `document_types`: MN, PR, PL, PT, IN, MP, DC, PVE, FT, RE, CT, OS, AN           |
| `process_id`         | uuid    | Sí   |             | Proceso del núcleo; obligatorio en los del SGC                                           |
| `classification`     | text    | No   |             | `public`, `internal`, `confidential` o `restricted`                                      |
| `status`             | text    | No   | `draft`     | `draft` (sin publicar), `current` (vigente) u `obsolete`                                 |
| `current_version_id` | uuid    | Sí   |             | Última versión publicada; null solo mientras el documento está `draft`                   |
| `owner_position_id`  | uuid    | Sí   |             | Cargo responsable                                                                        |
| `is_controlled`      | boolean | No   |             | Documento controlado del SGC                                                             |
| control              |         |      |             | Columnas de control                                                                      |

Disparador `doc_keep_documents`: el código, el tipo, el proceso y la carpeta no cambian; con una
versión publicada, el título, la clasificación y el responsable solo cambian al publicar otra
versión (ficha 17.4: un documento vigente es inmutable).

## doc_versions · Versiones (B18)

Ciclo: `draft` → `in_review` → `approved` → `current` → `obsolete`; desde `in_review` se puede
devolver a `draft`.

| Columna                                     | Tipo        | Nulo | Por defecto | Regla                                                              |
| ------------------------------------------- | ----------- | ---- | ----------- | ------------------------------------------------------------------ |
| `document_id`                               | uuid        | No   |             | El documento                                                       |
| `number`                                    | integer     | No   |             | 0 a 99; único por documento                                        |
| `version_label`                             | text        | No   |             | `number` con dos dígitos: 00, 01…                                  |
| `status`                                    | text        | No   | `draft`     | Estado del ciclo                                                   |
| `source_file_id`                            | uuid        | No   |             | Archivo fuente (PDF, Word o Excel) en `doc_files`                  |
| `pdf_file_id`                               | uuid        | Sí   |             | Su PDF: el mismo archivo si es PDF; el que genera Gotenberg si no  |
| `render_status`                             | text        | No   | `pending`   | `pending`, `ready` o `failed`; fuera del borrador siempre `ready`  |
| `title`, `classification`, `owner_position_id` |          |      |             | Datos que el documento toma al publicarla                          |
| `change_summary`                            | text        | No   |             | Qué cambia; 3 a 1000 caracteres                                    |
| `review_note`                               | text        | Sí   |             | Motivo de la última devolución                                     |
| `submitted_at`                              | timestamptz | Sí   |             | Presente fuera del borrador                                        |
| `approved_by`, `approved_at`                |             | Sí   |             | Desde aprobada; `approved_by` distinto de `created_by`             |
| `effective_date`, `published_at`            |             | Sí   |             | En vigente y obsoleta                                              |
| `obsoleted_at`                              | timestamptz | Sí   |             | Solo en obsoleta                                                   |
| control                                     |             |      |             | Columnas de control; `created_by` es quien elaboró la versión      |

Disparador `doc_keep_versions`: solo los pasos del ciclo; fuera del borrador el contenido, el
archivo y el PDF no cambian; por documento hay a lo más una versión `current` y una en trámite
(`draft`, `in_review` o `approved`). El caso de uso además bloquea el documento mientras crea o
publica una versión.

## doc_links · Vínculos (B18)

| Columna       | Tipo | Nulo | Regla                                                      |
| ------------- | ---- | ---- | ---------------------------------------------------------- |
| `document_id` | uuid | No   | El documento                                               |
| `entity_type` | text | No   | `position`, `process` o `party`                            |
| `entity_id`   | uuid | No   | El registro, por identificador. Único con el documento     |
| `relation`    | text | No   | `applies_to`, `supports` o `related`                       |
| control       |      |      | Retirar un vínculo es lógico; volver a vincular lo revive  |

## doc_access_log · Registro de accesos (B18)

Una fila por cada descarga de un documento confidencial o restringido y por cada consulta de uno
restringido (numeral 15.4). `app_user` solo puede agregar y leer: las filas no cambian ni se
borran, y no llevan columnas de control.

| Columna       | Tipo        | Nulo | Regla                 |
| ------------- | ----------- | ---- | --------------------- |
| `document_id` | uuid        | No   | El documento          |
| `version_id`  | uuid        | Sí   | La versión descargada |
| `user_id`     | uuid        | No   | Quién                 |
| `action`      | text        | No   | `view` o `download`   |
| `occurred_at` | timestamptz | No   | Cuándo                |

**Auditoría de B18:** `doc.folder.create · update`, `doc.document.create · view`,
`doc.version.create · update · render (del sistema) · submit · reject · approve · publish ·
obsolete · download_link` y `doc.link.create · delete`. Una huella alterada deja el evento de
seguridad `doc.file.integrity_failed` (severidad alta).
