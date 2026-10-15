# Diccionario de datos · Gestión documental (doc\_)

Tipos exactos, restricciones e índices de las tablas del dominio `doc_` (capítulo 12.3, ficha
17.4). Se actualiza en el mismo pull request que cambia el modelo
(`apps/api/prisma/schema.prisma`). Migración: `20261015000000_doc_files` (B14).

Por ahora solo existe `doc_files`, el archivo físico. Las carpetas, los documentos, sus versiones y
`doc_access_log` llegan con el bloque de documentos; mientras tanto, el registro de accesos a los
archivos es la auditoría (`aud_events`).

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
