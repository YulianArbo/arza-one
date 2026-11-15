# Activos (M11) — datos

> Bloque B34. Ficha 17.12 del Manual Maestro. Ejecuta RE-ADM-003 (Activos Fijos) y CT-ADM-001
> (Contrato de Comodato).

Importes en `numeric(18,2)`; columnas de control, RLS por `tenant_id` y acceso sin `DELETE` (quitar
un mantenimiento programado marca `deleted_at`). Los colaboradores se leen por la interfaz pública
de Identidad; su persona y su documento, por la de Terceros; el formato CT-ADM-001 y su PDF, por la
de Documentos; la firma, por la de Contratos. Ningún otro módulo lee las tablas `ast_`.

## Regla central: todo activo asignado tiene comodato firmado

1. Al asignar, la plataforma llena el formato **CT-ADM-001** con los datos de la empresa, del
   colaborador y del activo. La asignación queda `preparing` y el activo `reserved` («Pendiente de
   firma»).
2. Cuando el PDF está listo, el worker (`ast.loan-work`, cada 20 segundos) lo envía a firma
   electrónica de nivel 2: enlace y código al correo de trabajo del colaborador. La asignación
   pasa a `in_signature`.
3. Solo cuando el colaborador firma y el documento firmado está sellado, la asignación queda
   `active` con su `contract_document_id`, y el activo `assigned`.
4. Si el colaborador rechaza, vence el plazo (15 días) o quien asigna anula, la asignación queda
   `cancelled` con su motivo y el activo vuelve a `available`.

Lo garantizan, además de la API:

- la restricción `ast_assignments_signed_loan_check`: una asignación `active` o `returned` exige
  `contract_document_id`, `envelope_id` y `activated_at`;
- el disparador `ast_assets_require_signed_loan`: un activo no pasa a `assigned` sin una
  asignación `active` con su comodato firmado;
- el índice único parcial `ast_assignments_one_open`: una sola asignación abierta por activo.

Solo firma el colaborador que recibe (decisión 5 del B34); la empresa queda representada por quien
asigna, que queda registrado. Para firmar, el colaborador debe estar **vinculado con su persona en
Terceros, con su número de documento**; si no, la API responde `AST_HOLDER_NOT_READY`.

## Tablas

| Tabla | Datos y reglas principales |
| --- | --- |
| `ast_assets` | Activo con código `ACT-AAAA-NNNN`, nombre, categoría (`computer`, `peripheral`, `furniture`, `software_license`, `other`), serie, fecha de compra (no futura), costo, vida útil en meses (1 a 600) y ubicación. Estados: `available`, `reserved`, `assigned` y `retired`. La baja guarda fecha, motivo (`damage`, `obsolescence`, `loss`, `sale`, `donation`), detalle y quién la registró; solo se da de baja un activo `available` y un activo dado de baja no se edita. |
| `ast_assignments` | Asignación en comodato: activo, colaborador (`user_id`), su persona en Terceros (`signer_party_id`), fecha de entrega (ni futura ni anterior a la compra), plazo para firmar (`sign_by`), registro CT-ADM-001 (`form_record_id`, `record_code`), proceso de firma (`envelope_id`, `envelope_code`) y comodato firmado (`contract_document_id`). Estados: `preparing` → `in_signature` → `active` → `returned`, o `cancelled` con motivo. La devolución guarda fecha, estado del bien y quién la registró. |
| `ast_maintenance` | Mantenimiento `preventive` o `corrective` de un activo: fecha programada y, al hacerlo, fecha (no futura) y costo. No cambia el estado del activo. Uno pendiente se puede quitar; uno hecho, no. |

Diferencias con el capítulo 12, por la decisión 4 del B34: la tabla de colaboradores
(`hr_employees`) llega en el B35, así que la asignación guarda la cuenta interna (`user_id`) en
lugar de `employee_id`; el B35 las unirá.

## Depreciación (solo informativa)

Línea recta: el costo se reparte por igual en los meses de vida útil, contando meses completos
desde la compra hasta hoy (o hasta la baja), sin pasar del costo. Se muestra como depreciación
acumulada y valor en libros. **No se contabiliza ni crea movimientos en Finanzas** (ficha 17.12).

## Libro de activos (RE-ADM-003)

`POST /v1/assets/book/export` entrega un CSV en UTF-8 con BOM, separado por punto y coma, con coma
decimal y fechas dd/mm/aaaa (igual que el archivo contable del B32). Columnas, **propuestas y
pendientes de validar contra el RE-ADM-003 original**: código, nombre, categoría, serie, fecha de
compra, costo, vida útil (meses), depreciación acumulada, valor en libros, estado, ubicación,
responsable, fecha de asignación, comodato y fecha de baja. Responsable, fecha de asignación y
comodato solo aparecen con asignación vigente. Cada descarga queda en la auditoría.

## API

| Recurso | Puntos |
| --- | --- |
| Inventario | `GET /v1/assets` (`?holder_id=`) · `GET …/{id}` · `POST` · `PUT …/{id}` · `POST …/{id}/retirement` · `POST …/book/export` |
| Asignaciones | `GET /v1/asset-assignees` · `POST /v1/assets/{id}/assignments` · `POST /v1/asset-assignments/{id}/cancellation` · `…/return` |
| Mantenimientos | `GET /v1/asset-maintenance` · `POST /v1/assets/{id}/maintenance` · `POST /v1/asset-maintenance/{id}/completion` · `DELETE /v1/asset-maintenance/{id}` |

Las escrituras sobre un registro existente llevan `If-Match` con su versión; las creaciones de
activo, asignación y mantenimiento llevan `Idempotency-Key`. Errores propios: `AST_RECORD_NOT_FOUND`,
`AST_RECORD_INVALID`, `AST_STATUS_INVALID`, `AST_HOLDER_NOT_READY` y `AST_FORM_UNAVAILABLE` (la
empresa no tiene publicado el CT-ADM-001).

## Auditoría y eventos

`asset.create|update|retire`, `asset.book.export`,
`asset.assignment.create|send|activate|cancel|return` y
`asset.maintenance.schedule|complete|remove`. Bandeja de salida: `ast.asset.*`,
`ast.book.exported`, `ast.assignment.*` y `ast.maintenance.*`. Los pasos del worker (enviar a
firma, activar o anular según la firma) quedan a nombre del sistema.

## Permisos

Los cuatro del anexo G, sin permisos nuevos:

- `asset.read` — «Ver activos». Dirección, Calidad, Administrativo y financiero, Contador y
  Auditor ven todo el inventario y descargan el libro. Los demás roles lo tienen como **solo lo
  propio**: ven únicamente los activos que tienen a su cargo o están por recibir, sin la historia
  de otras personas y sin el libro.
- `asset.manage` — registrar y editar activos, y programar, registrar y quitar mantenimientos.
- `asset.assign` — asignar, anular antes de la firma y registrar la devolución.
- `asset.retire` — dar de baja.

## Lo que otros módulos pueden preguntar

`assetsHeldBy(tx, userId)` (índice del módulo): los activos con asignación vigente de una persona.
Talento humano lo usará en el retiro de un colaborador para listar lo que debe devolver.
