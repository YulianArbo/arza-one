# Diccionario de datos · Gestión documental (doc\_)

Tipos exactos, restricciones e índices de las tablas del dominio `doc_` (capítulo 12.3, ficha
17.4). Se actualiza en el mismo pull request que cambia el modelo
(`apps/api/prisma/schema.prisma`). Migraciones: `20261015000000_doc_files` (B14) y
`20261019000000_doc_documents_versions_folders` (B18),
`20261020000000_doc_change_requests_acknowledgements` (B19) y
`20261021000000_doc_forms_and_output_templates` (B20).

Desde B18 existen las carpetas y expedientes (`doc_folders`), el documento lógico
(`doc_documents`), sus versiones (`doc_versions`), los vínculos con registros de otros módulos
(`doc_links`) y el registro de accesos a lo confidencial y restringido (`doc_access_log`). Desde
B19, la Solicitud de Acción Documental (`doc_change_requests`) y la constancia de lectura
(`doc_acknowledgements`). Desde B20, los formatos digitales (`doc_form_templates`), sus registros
diligenciados (`doc_form_records`) y las plantillas de salida (`doc_output_templates`). La retención
llega en B21.

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

## doc_versions · Cambios de B19

| Columna                | Tipo | Nulo | Por defecto | Regla                                                                                        |
| ---------------------- | ---- | ---- | ----------- | -------------------------------------------------------------------------------------------- |
| `origin`               | text | No   | `platform`  | `platform` (elaborada en ARZA ONE) o `import` (carga inicial del Listado Maestro). No cambia |
| `change_request_id`    | uuid | Sí   |             | Solicitud que la originó; única por versión. No cambia                                        |
| `workflow_instance_id` | uuid | Sí   |             | Su trámite de revisión en el motor de flujos; solo cambia en el borrador                      |

Una versión `import` ya se aprobó en papel: no lleva aprobador (`approved_by` nulo) pero sí
`approved_at` (la fecha del listado), no tiene solicitud ni trámite, y pasa del borrador a vigente
cuando su PDF está listo. `doc_keep_versions` admite ese paso solo para ella.

En `doc_documents`, un documento del SGC sin proceso solo puede ser del tipo `RIT` (Reglamento
Interno de Trabajo) y su código es `TIPO-NNN` (`RIT-001`). El catálogo «Tipos de documento» suma
`RIT`.

## doc_change_requests · Solicitudes de Acción Documental (B19)

FT-SGC-001: pedir crear, modificar o eliminar un documento del SGC. Ciclo: `filed` (radicada) →
`in_analysis` → `approved` o `rejected` → `executed`. El trámite lo lleva el flujo
`doc.change_request` del motor (ADR-023).

| Columna                      | Tipo        | Nulo | Por defecto | Regla                                                                                     |
| ---------------------------- | ----------- | ---- | ----------- | ----------------------------------------------------------------------------------------- |
| `code`                       | text        | No   |             | `SAD-AAAA-NNNN`, del servicio de consecutivos; único por empresa                          |
| `action`                     | text        | No   |             | `create`, `update` u `obsolete`                                                           |
| `document_id`                | uuid        | Sí   |             | Documento afectado; en una creación, el que se creó con ella (se fija una sola vez)       |
| `doc_type`, `process_id`     |             | Sí   |             | Solo en una creación: tipo y proceso del documento nuevo (el RIT no lleva proceso)        |
| `title`                      | text        | No   |             | 3 a 200 caracteres                                                                        |
| `justification`              | text        | No   |             | 10 a 2000 caracteres                                                                      |
| `status`                     | text        | No   | `filed`     | Estado del ciclo                                                                          |
| `requested_by`               | uuid        | No   |             | Quien la pidió                                                                            |
| `workflow_instance_id`       | uuid        | Sí   |             | Su trámite; único                                                                         |
| `decided_by`, `decided_at`   |             | Sí   |             | Desde aprobada o rechazada; `decided_by` distinto de `requested_by` (quien pide no decide) |
| `decision_note`              | text        | Sí   |             | Obligatorio al rechazar; 5 a 2000 caracteres                                              |
| `executed_at`                | timestamptz | Sí   |             | Solo en ejecutada                                                                         |
| control                      |             |      |             | Columnas de control                                                                       |

Disparador `doc_keep_change_requests`: lo que se pidió y quién no cambian; solo avanza por los
pasos del ciclo y una decisión no cambia. Seguridad por fila; `app_user` sin `DELETE`.

## doc_acknowledgements · Constancias de lectura (B19)

Al publicar una versión, una fila pendiente por cada persona activa de los cargos destinatarios
(los vinculados al documento con «Aplica a»). Quien confirma sin que se le pidiera queda con su
cargo de ese momento.

| Columna           | Tipo        | Nulo | Regla                                                  |
| ----------------- | ----------- | ---- | ------------------------------------------------------ |
| `document_id`     | uuid        | No   | El documento                                           |
| `version_id`      | uuid        | No   | La versión vigente leída; única con `user_id`          |
| `user_id`         | uuid        | No   | La persona                                             |
| `position_id`     | uuid        | Sí   | Su cargo, para el informe por cargo                    |
| `requested_at`    | timestamptz | Sí   | Cuándo se le pidió (la última vez)                     |
| `acknowledged_at` | timestamptz | Sí   | Cuándo confirmó; al menos uno de los dos está presente |
| control           |             |      | Columnas de control                                    |

Disparador `doc_keep_acknowledgements`: una constancia confirmada no cambia.

**Auditoría de B19:** `doc.change_request.create · analyze · approve · reject · execute`,
`doc.version.review`, `doc.acknowledgement.request · confirm`, `doc.master_list.export` y, en la
carga inicial, `doc.file.import`, `doc.document.import`, `doc.version.import` y `doc.import.run`.
Bandeja de salida: `doc.acknowledgement.requested` y `doc.request.decided` (avisos
`doc_read_requested` y `doc_request_decided`).

## Carga inicial del Listado Maestro (RE-SGC-001)

`pnpm doc:importar-listado --correo <calidad> --listado <archivo.csv> --archivos <carpeta>` revisa
sin cambiar nada; con `--aplicar` carga. El CSV (punto y coma o comas, UTF-8) lleva un encabezado
con estas columnas, sin importar tildes ni mayúsculas:

| Columna       | Obligatoria | Contenido                                                                        |
| ------------- | ----------- | -------------------------------------------------------------------------------- |
| Código        | Sí          | `TIPO-PROCESO-NNN` (`PR-SGC-001`) o `RIT-NNN`                                    |
| Nombre        | Sí          | Nombre del documento                                                             |
| Versión       | Sí          | Número de 0 a 99 (`03`)                                                          |
| Fecha         | Sí          | Desde cuándo rige, dd/mm/aaaa                                                    |
| Tipo, Proceso | No          | Si vienen, deben coincidir con el código                                         |
| Estado        | No          | Solo se cargan las filas «Vigente» (o vacías); las demás se informan             |
| Responsable   | No          | Nombre del cargo responsable, tal como está en Administración › Cargos           |
| Destinatarios | No          | Cargos que deben leerlo, separados por barra vertical o comas: quedan «Aplica a» |
| Clasificación | No          | Pública, Interna (por defecto), Confidencial o Restringida                       |
| Archivo       | No          | Nombre del archivo en la carpeta; si falta, el único que empiece por el código   |

Cada documento pasa por el antivirus y la conversión a PDF del worker; el comando espera hasta 30
minutos y se puede repetir: continúa donde quedó sin duplicar nada. Los consecutivos siguen después
del número más alto cargado. Al final compara la plataforma con el listado y guarda el informe
`informe-carga-listado-maestro-<fecha>.csv` junto al listado.

## Formatos digitales y generación de documentos (B20)

Capítulo 18, formas B (formato digital) y D (plantilla de salida), y numeral 13.2. Las tres tablas
tienen seguridad por fila forzada, columnas de control y `app_user` sin `DELETE`.

### doc_output_templates · Plantillas de salida

Una fila por versión de cada plantilla. Publicada, no cambia (disparador
`doc_keep_output_templates`); al publicar la siguiente del mismo código, la anterior pasa a
`retired`. Un solo borrador y una sola publicada por código (índices parciales).

| Columna                        | Tipo  | Nulo | Por defecto | Regla                                                                  |
| ------------------------------ | ----- | ---- | ----------- | ---------------------------------------------------------------------- |
| `code`                         | text  | No   |             | `^[A-Z][A-Z0-9-]{2,39}$`; único con `output_version`                   |
| `name`                         | text  | No   |             | 3 a 200 caracteres                                                     |
| `engine`                       | text  | No   |             | `html` (variables `{{nombre}}`) o `docx` (variables `{nombre}`)        |
| `output_version`               | int   | No   |             | 1, 2…                                                                  |
| `status`                       | text  | No   | `draft`     | `draft`, `published` o `retired`                                       |
| `body`                         | text  | Sí   |             | El HTML (solo `html`), hasta 200 000 caracteres                        |
| `file_id`                      | uuid  | Sí   |             | El Word en `doc_files` (solo `docx`)                                   |
| `variables`                    | jsonb | No   | `[]`        | Variables de primer nivel que usa, anotadas al guardar                 |
| `published_at`, `published_by` |       | Sí   |             | Desde publicada; `published_by` nulo en las que publicó la semilla     |
| `retired_at`                   |       | Sí   |             | Solo en retirada                                                       |

### doc_form_templates · Formatos digitales

Una fila por versión de cada formato. Sus campos van en `schema` (jsonb validado siempre con
`formDefinitionSchema` de `packages/contracts`). La columna del manual «version» se llama
`form_version`, porque `version` es la columna de control. Publicado, no cambia (disparador
`doc_keep_form_templates`); al publicar la siguiente, la anterior pasa a `retired`.

| Columna                        | Tipo  | Nulo | Por defecto | Regla                                                                                       |
| ------------------------------ | ----- | ---- | ----------- | ------------------------------------------------------------------------------------------- |
| `code`                         | text  | No   |             | Código del Listado Maestro: `TIPO-PROCESO-NNN`; único con `form_version`                    |
| `name`                         | text  | No   |             | 3 a 200 caracteres                                                                          |
| `form_version`                 | int   | No   |             | 1, 2…                                                                                       |
| `status`                       | text  | No   | `draft`     | `draft`, `published` o `retired`                                                            |
| `fill_mode`                    | text  | No   | `manual`    | `manual` (lo diligencia una persona) o `system` (lo llena la plataforma: FT-SGC-001)        |
| `schema`                       | jsonb | No   |             | `{ sections: [{ key, title, fields: [...] }] }`                                             |
| `layout`                       | jsonb | No   | `{}`        | `{ orientation: portrait \| landscape }`                                                    |
| `document_id`                  | uuid  | Sí   |             | Su documento FT en el Listado Maestro                                                       |
| `output_template_id`           | uuid  | Sí   |             | La versión exacta de su plantilla de salida; sin ella, la maqueta institucional             |
| `workflow_key`                 | text  | Sí   |             | `doc.form_record.direction` o `doc.form_record.quality`; nulo: el registro termina al enviar |
| `classification`               | text  | No   | `internal`  | `internal` o `confidential`                                                                 |
| `entity_type`                  | text  | Sí   |             | `doc_version`, `party` o `doc_change_request` (este último solo en `system`)                |
| `published_at`, `published_by` |       | Sí   |             | Desde publicado                                                                             |
| `retired_at`                   |       | Sí   |             | Solo en retirado                                                                            |

**Campos de un formato** (cada elemento de `fields`): `key` (nombre interno, minúsculas; no puede
ser `formato`, `registro` ni `empresa`), `label`, `type` (`text`, `textarea`, `number`, `date`,
`boolean`, `select`, `checklist`, `table`), `required`, `help`, `options` (lista), `items`
(puntos de verificación, que se responden Cumple, No cumple o No aplica con su observación) y
`columns` (de una tabla: `key`, `label`, `type` `text`, `number` o `date`).

### doc_form_records · Registros diligenciados

Un formato diligenciado. Ciclo: `draft` → `in_approval` (si su formato tiene flujo) →
`completed`. Al terminar queda `render_status = pending` y el worker genera su PDF.

| Columna                       | Tipo        | Nulo | Por defecto | Regla                                                                                         |
| ----------------------------- | ----------- | ---- | ----------- | --------------------------------------------------------------------------------------------- |
| `template_id`                 | uuid        | No   |             | La versión exacta del formato                                                                 |
| `template_version`            | int         | No   |             | Su número; la llave foránea (`tenant_id`, `template_id`, `template_version`) los amarra       |
| `code`                        | text        | No   |             | `FT-COM-002-AAAA-NNNN`, consecutivo anual propio de cada formato; único por empresa           |
| `data`                        | jsonb       | No   | `{}`        | Valores por nombre interno; se validan con los campos de su versión                           |
| `status`                      | text        | No   | `draft`     | `draft`, `in_approval` o `completed`                                                          |
| `classification`              | text        | No   | `internal`  | La del formato al crearse                                                                     |
| `entity_type`, `entity_id`    |             | Sí   |             | Registro al que pertenece; los dos o ninguno                                                  |
| `workflow_instance_id`        | uuid        | Sí   |             | Su trámite de aprobación; único                                                               |
| `submitted_at`                | timestamptz | Sí   |             | Desde enviado                                                                                 |
| `approved_by`, `approved_at`  |             | Sí   |             | Solo terminado con aprobación; `approved_by` distinto de `created_by` (quien diligencia no aprueba) |
| `return_note`                 | text        | Sí   |             | Motivo de la última devolución (5 a 2000 caracteres)                                          |
| `completed_at`                | timestamptz | Sí   |             | Solo en terminado                                                                             |
| `render_status`               | text        | No   | `none`      | `none` mientras no termina; luego `pending`, `ready` o `failed`                               |
| `pdf_file_id`                 | uuid        | Sí   |             | El PDF en `doc_files`, con su huella; solo con `ready`                                        |

Disparador `doc_keep_form_records`: el formato, su versión, el código, la clasificación, el
registro de origen y quién lo diligenció nunca cambian; los datos solo en el borrador; terminado,
solo se le agrega el PDF. Un registro FT-SGC-001 por solicitud (índice parcial).

### doc_versions · Cambios de B20

| Columna        | Tipo | Nulo | Regla                                                                                         |
| -------------- | ---- | ---- | --------------------------------------------------------------------------------------------- |
| `copy_file_id` | uuid | Sí   | Copia de consulta de la vigente: su PDF con el pie de copia no controlada. Se fija una sola vez |

La descarga del PDF de una versión vigente entrega su copia de consulta en cuanto existe.

### Consecutivos

`core_sequences` admite como prefijo anual el código de un formato (`FT-COM-002`): la llave es
`doc.form_record.ft_com_002`.

### Generación en segundo plano

La función `doc_tenants_with_pending_pdfs()` (SECURITY DEFINER, como `wf_tenants_with_overdue_tasks`)
dice qué empresas tienen PDF pendientes; el trabajo programado `doc.pdf-render` (cada 20 s) trabaja
en cada una con su contexto.

### Variables de las plantillas de salida

Cada campo por su nombre interno, ya impreso (fechas dd/mm/aaaa, «Sí» o «No»). Una tabla es una
lista de filas con sus columnas (`{{#each compromisos}}{{actividad}}{{/each}}`); una verificación,
una lista con `punto`, `resultado` y `observacion`. Además:

| Variable                                          | Contenido                                  |
| ------------------------------------------------- | ------------------------------------------ |
| `formato.codigo`, `formato.nombre`                | Código y nombre del formato                |
| `formato.version`, `formato.fecha`                | Versión (01) y fecha de publicación        |
| `registro.codigo`, `registro.estado`              | Código y estado del registro               |
| `registro.elaboro`, `registro.fecha`              | Quién lo diligenció y cuándo               |
| `registro.aprobo`, `registro.fecha_aprobacion`    | Quién lo aprobó y cuándo                   |
| `empresa.razon_social`, `empresa.nit`             | La empresa que emite el documento          |

**Auditoría de B20:** `doc.form_template.create · update · publish · retire · seed`,
`doc.output_template.create · update · publish · seed`, `doc.form_record.create · update · submit
· approve · reject · complete · render · download_link` y `doc.version.copy`. Los eventos de un
registro nunca guardan los valores diligenciados (pueden traer datos personales): solo el código,
el formato, la versión y los nombres de los campos que cambiaron.
