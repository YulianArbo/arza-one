# Multiempresa · B48

El núcleo (M00) permite que varias empresas usen ARZA ONE sin ningún dato cruzado. Cada tabla de negocio lleva `tenant_id` y seguridad por fila (ADR-007). B48 agrega lo que faltaba para operar varias empresas: **alta, plan y límites, marca propia, suspensión, exportación completa y eliminación**. En la web está en **Administración → Empresas de la plataforma** (solo el operador) y en **Administración → Empresa y sedes** (marca y exportación).

## Quién hace qué

| Quién | Dónde | Qué |
| --- | --- | --- |
| Operador de la plataforma (`OPERADOR_PLATAFORMA`) | Solo en la empresa que opera ARZA ONE (ARZA TECH, `core_operator_tenant_id()`) | Da de alta empresas, cambia su plan, las suspende o reactiva y pide o cancela su eliminación. Ve la ficha de cada empresa (datos legales, plan, uso, estado), **nunca su contenido**. |
| Dirección de cada empresa (`core.tenant.export`) | Su empresa | Pide y descarga la exportación completa, con su identidad confirmada. |
| Administración de cada empresa (`core.tenant.update`) | Su empresa | Cambia la marca: nombre para mostrar, color principal y logo. |
| Toda persona de la empresa | Su empresa | Ve la marca en la barra superior (`/v1/me/branding`). |

## Dónde vive cada parte

- **Núcleo** (`apps/api/src/modules/core`): `application/tenant-plan.ts` (estado y plan de la empresa del contexto), `application/tenant-branding.ts` y `interface/branding.controller.ts` (marca), `infrastructure/platform-store.ts` (funciones de la plataforma) y `infrastructure/export-store.ts` (registro de exportaciones y lectura de tablas). `interface/tenant-gate.module.ts` le presta a identidad la pregunta «¿la empresa está activa?».
- **Multiempresa** (`apps/api/src/modules/tenancy`): casos de uso del operador (`platform-tenants.ts`), de la exportación (`tenant-exports.ts`) y los trabajos del worker (`export-work.ts`, `purge-work.ts`). El ZIP se escribe por partes sin biblioteca (`infrastructure/zip-writer.ts`).
- **Identidad**: el inicio de sesión y cada petición preguntan por `TENANT_GATE`; una empresa suspendida no entra y sus sesiones se cierran con el motivo `tenant_suspended`.
- **Worker**: `core.tenant-export-work` cada 5 minutos (genera las pedidas y borra las vencidas) y `core.tenant-purge-work` cada día a las 2:30 (elimina las que vencieron).
- **Web** (`apps/web/src/features/tenancy`): lista de empresas con sus ventanas, panel de marca, panel de exportación y la marca en la barra superior de la aplicación y del portal.

## Tablas y columnas

| Tabla | Qué agrega B48 |
| --- | --- |
| `core_tenants` | Plan (`plan`) y límites que rigen (`limit_internal_users`, `limit_portal_users`, `limit_storage_mb`, `limit_ai_assistant`); marca (`brand_display_name`, `brand_color`, `brand_logo_file_id`); suspensión (`suspended_at`, `suspension_reason`); eliminación (`deletion_requested_at`, `deletion_due_on`, `deletion_reason`, `deletion_export_id`); cierre (`closed_at`, `files_purged_at`, `closing_manifest_sha256`). La aplicación solo puede cambiar los datos legales y la marca; el plan y el estado los cambian las funciones de la plataforma. |
| `core_tenant_exports` | Cada exportación: estado (en cola, generándose, lista, fallida, vencida), quién y cuándo la pidió, tamaño, tablas, filas, archivos y huella del índice. Una sola en curso por empresa. |

Migración `20261130000000_core_multi_tenant`.

## Planes (decisión 9, valores de ejemplo)

| Plan | Usuarios internos | Usuarios del portal | Archivos | Asistente de IA |
| --- | --- | --- | --- | --- |
| Básico | 10 | 20 | 5 GB | No |
| Profesional (por defecto) | 50 | 200 | 50 GB | Sí |
| Empresarial | Sin tope | Sin tope | 500 GB | Sí |

Los valores viven en `packages/contracts/src/tenancy/plans.ts`. El operador puede fijar otro tope de usuarios internos al cambiar el plan. Los límites los hace cumplir la base de datos con disparadores (`iam_users_plan_limit`, `doc_files_plan_limit`); la API responde `PLAN_LIMIT_REACHED` con un mensaje claro. El asistente revisa `limit_ai_assistant` antes de cada uso.

## Reglas

- **Solo la empresa operadora administra empresas.** Las funciones `core_platform_*` lo exigen en la base de datos (`TENANCY_OPERATOR_ONLY`), además del permiso y la confirmación de identidad en la API.
- **La empresa operadora no se suspende ni se elimina** (`core_tenants_operator_active_check`).
- **Suspender** cierra todas las sesiones, impide entrar (`TENANT_SUSPENDED`) y detiene las tareas automáticas: las 31 funciones `*_tenants_with_*` que eligen a qué empresas atiende el worker se envolvieron para filtrar con `core_tenant_runs_jobs`. La verificación diaria de la auditoría sigue para todas. Una función nueva de ese tipo debe filtrar con `core_tenant_runs_jobs`.
- **Exportación completa.** Una hoja CSV por tabla con `tenant_id` (la lista sale del catálogo de PostgreSQL), los archivos de la empresa y `manifest.json` con las filas de cada tabla y la huella SHA-256 de cada archivo. Nunca salen: sesiones, enlaces de un solo uso, códigos de recuperación, llaves del segundo factor, huellas de dispositivos ni las columnas de contraseñas, llaves cifradas y huellas de enlaces (`core_export_omissions`, `core_export_omits_column`). Queda disponible 7 días. La descarga queda en la auditoría con el número de filas y dispara la alerta de exportación masiva.
- **Eliminación** (ADR-028): empresa suspendida, exportación lista de los últimos 30 días y el NIT escrito; los datos se borran 30 días después. Queda la constancia mínima (razón social, NIT, fechas y huella de la exportación).
- **Toda tabla nueva con `tenant_id` debe crear su política `<tabla>_purge`** (ver ADR-028). La prueba `tenant-purge.int.test.ts` falla si falta.

## Rutas

| Ruta | Permiso |
| --- | --- |
| `GET /v1/platform/tenants` | `platform.tenant.read` |
| `POST /v1/platform/tenants` · `PUT …/{id}/plan` · `POST …/{id}/suspend` · `POST …/{id}/reactivate` | `platform.tenant.manage` (alta, suspensión y reactivación con identidad confirmada) |
| `POST /v1/platform/tenants/{id}/deletion` · `DELETE …/{id}/deletion` | `platform.tenant.delete` |
| `GET /v1/tenant/exports` · `POST /v1/tenant/exports` · `POST /v1/tenant/exports/{id}/download` | `core.tenant.export` (pedir y descargar con identidad confirmada) |
| `PUT /v1/tenant/branding` · `POST /v1/tenant/branding/logo/uploads` · `PUT` y `DELETE /v1/tenant/branding/logo` | `core.tenant.update` |
| `GET /v1/me/branding` · `GET /v1/me/branding/logo` | Sesión propia |

## Auditoría

Lo que hace el operador queda en la auditoría de la empresa operadora (`platform.tenant.*`) y, como nota del sistema con el identificador del operador, en la de la empresa afectada (`core.tenant.create`, `plan_change`, `suspend`, `reactivate`, `deletion_request`, `deletion_cancel`). La exportación deja `core.tenant.export_request`, `export_start`, `export_ready`, `export_download`, `export_fail` y `export_expire`. La eliminación deja `platform.tenant.purge` y `platform.tenant.files_purge` en la empresa operadora.
