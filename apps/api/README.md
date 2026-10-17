# @arza/api

API del backend de ARZA ONE (NestJS 11). Es el único componente que escribe en la base de datos
(capítulo 8.2). Este documento describe la plataforma transversal: la cadena de petición (B02),
la base de datos con contexto de empresa y seguridad por fila (B03), Valkey con las colas de
trabajos (B06) y la identidad (B08). Los módulos se agregan en `src/modules/`.

## Cómo se ejecuta

| Comando                                                          | Qué hace                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm --filter @arza/api dev`                                    | Arranca la API en http://localhost:4000; al guardar un cambio se recompila y reinicia sola  |
| `pnpm --filter @arza/api start`                                  | Arranca la versión ya compilada (`dist/`)                                                   |
| `pnpm --filter @arza/api test`                                   | Pruebas unitarias y de la cadena de petición con cobertura                                  |
| `pnpm --filter @arza/api test -u`                                | Regenera `openapi.json` después de cambiar un contrato                                      |
| `pnpm test:int`                                                  | Pruebas con PostgreSQL y Valkey reales (requiere Docker)                                    |
| `pnpm db:migrate`                                                | Aplica las migraciones pendientes, como `migration_user`                                    |
| `pnpm db:seed`                                                   | Datos semilla (empresa de la plataforma); idempotente                                       |
| `pnpm db:seed:demo`                                              | Semilla más dos empresas ficticias; nunca en producción (`pnpm infra:up` la carga en local) |
| `pnpm --filter @arza/api db:generate`                            | Regenera el cliente de Prisma tras cambiar el modelo                                        |
| `pnpm iam:invitar --empresa demo-uno --correo ana@demo-uno.test` | Invita a una persona (B08); ver «Identidad»                                                 |
| `pnpm iam:reiniciar-segundo-factor --correo ana@demo-uno.test`   | Reinicia el segundo factor de quien perdió el celular y los códigos (B09)                   |

Las variables de entorno se leen del archivo `.env` de la raíz del proyecto (ver `.env.example`).
Los servicios locales se encienden con `pnpm infra:up` ([guía](../../docs/runbooks/entorno-local.md)).

## Puntos de la API

| Ruta                                                                    | Acceso                                          | Respuesta                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                           | Público                                         | 200 si la base de datos, las colas y los archivos responden; 503 si alguno no. Sin límite de peticiones (ver «Límite de peticiones»)                                                                    |
| `GET /version`                                                          | Público                                         | Versión, ambiente (`local`, `staging`, `production`) y commit                                                                                                                                           |
| `GET /api/docs`                                                         | Público                                         | Documentación interactiva. Solo en local y pruebas; no existe en producción                                                                                                                             |
| `GET /api/docs/openapi.json`                                            | Público                                         | El mismo documento en formato OpenAPI 3.1                                                                                                                                                               |
| `POST /v1/auth/login`                                                   | Público                                         | Inicia sesión; entrega la cookie y el código antifalsificación. Mismo mensaje exista o no el correo                                                                                                     |
| `POST /v1/auth/mfa/verify`                                              | A medias                                        | Segundo paso: código de la aplicación o de recuperación. Completa la sesión con una llave nueva                                                                                                         |
| `POST /v1/auth/mfa/setup`                                               | A medias                                        | Empieza a configurar el segundo factor: secreto y dirección para el QR (15 minutos para confirmar)                                                                                                      |
| `POST /v1/auth/mfa/setup/confirm`                                       | A medias                                        | Confirma con el primer código y entrega los diez códigos de recuperación (una sola vez)                                                                                                                 |
| `POST /v1/auth/reauthenticate`                                          | Sesión                                          | «Confirme que es usted»: contraseña y código. Vale 30 minutos para las acciones de alto riesgo                                                                                                          |
| `GET /v1/auth/session`                                                  | A medias                                        | Sesión actual, su etapa (`stage`) y su código antifalsificación                                                                                                                                         |
| `POST /v1/auth/logout`                                                  | A medias                                        | Cierra la sesión actual                                                                                                                                                                                 |
| `POST /v1/auth/password/forgot`                                         | Público                                         | Pide el enlace de recuperación; siempre responde 202 con el mismo mensaje                                                                                                                               |
| `POST /v1/auth/password/reset`                                          | Público                                         | Cambia la contraseña con el enlace y cierra todas las sesiones                                                                                                                                          |
| `POST /v1/auth/invitation/accept`                                       | Público                                         | Activa la cuenta con el enlace de la invitación                                                                                                                                                         |
| `GET /v1/me`                                                            | Sesión                                          | Perfil propio                                                                                                                                                                                           |
| `POST /v1/me/password`                                                  | Sesión                                          | Cambia la contraseña propia y cierra todas las sesiones, incluida la actual                                                                                                                             |
| `GET /v1/me/mfa`                                                        | Sesión                                          | Estado del segundo factor propio: obligatorio, activo, desde cuándo y cuántos códigos quedan                                                                                                            |
| `POST /v1/me/mfa/recovery-codes`                                        | Sesión + confirmación                           | Diez códigos de recuperación nuevos; los anteriores dejan de servir                                                                                                                                     |
| `POST /v1/me/mfa/disable`                                               | Sesión + confirmación                           | Desactiva el segundo factor, solo si es opcional; cierra las demás sesiones                                                                                                                             |
| `GET /v1/me/sessions`                                                   | Sesión                                          | Sesiones abiertas propias, con navegador, sistema, IP y cuál es la actual                                                                                                                               |
| `POST /v1/me/sessions/{id}/revoke`                                      | Sesión                                          | Cierra una sesión propia; surte efecto en la siguiente petición de ese equipo. La de otra persona responde 404                                                                                          |
| `POST /v1/me/sessions/revoke-others`                                    | Sesión                                          | Cierra todas las demás sesiones propias                                                                                                                                                                 |
| `GET /v1/me/permissions`                                                | Sesión                                          | Roles y permisos vigentes propios (todo o «solo lo propio»), para que la web decida qué mostrar                                                                                                         |
| `GET /v1/users`                                                         | `iam.user.read`                                 | Usuarios por páginas (`limit`, `cursor`), con búsqueda (`q`) y filtros (`status`, `kind`)                                                                                                               |
| `GET /v1/users/{id}`                                                    | `iam.user.read`                                 | Ficha con roles vigentes, cargo y versión; los datos de seguridad solo para quien tiene `iam.user.lock` o `iam.user.reset_mfa`                                                                          |
| `PATCH /v1/users/{id}`                                                  | `iam.user.update` + If-Match                    | Cambia el cargo (`position_id`, o null) de una persona interna; el cargo debe estar activo. Nunca sobre la propia cuenta                                                                                |
| `POST /v1/users`                                                        | `iam.user.invite`                               | Invita a una persona; las internas reciben COLABORADOR y los roles elegidos                                                                                                                             |
| `POST /v1/users/{id}/actions/invite`                                    | `iam.user.invite`                               | Reenvía la invitación de una cuenta que sigue invitada                                                                                                                                                  |
| `POST /v1/users/{id}/actions/lock`                                      | `iam.user.lock`                                 | Bloquea la cuenta y cierra sus sesiones                                                                                                                                                                 |
| `POST /v1/users/{id}/actions/unlock`                                    | `iam.user.lock` + conf.                         | Quita el bloqueo del administrador o el de los intentos fallidos                                                                                                                                        |
| `POST /v1/users/{id}/actions/reset-mfa`                                 | `iam.user.reset_mfa` + conf.                    | Reinicia el segundo factor de otra persona y cierra sus sesiones                                                                                                                                        |
| `POST /v1/users/{id}/actions/revoke-sessions`                           | `iam.session.revoke` + conf.                    | Cierra todas las sesiones de una persona                                                                                                                                                                |
| `POST /v1/sessions/actions/revoke-all`                                  | `iam.session.revoke` + conf.                    | Cierra todas las sesiones de la empresa salvo la propia (numeral 15.7)                                                                                                                                  |
| `POST /v1/users/{id}/roles`                                             | `iam.role.assign` + conf.                       | Asigna un rol, con vencimiento opcional (obligatorio para AUDITOR, 90 días como máximo)                                                                                                                 |
| `POST /v1/users/{id}/roles/{assignmentId}/actions/revoke`               | `iam.role.assign` + conf.                       | Retira un rol                                                                                                                                                                                           |
| `GET /v1/permissions`                                                   | `iam.role.read`                                 | Catálogo del anexo G por módulo                                                                                                                                                                         |
| `GET /v1/roles`                                                         | `iam.role.read`                                 | Roles del sistema y personalizados, con cuántos permisos y personas tienen                                                                                                                              |
| `GET /v1/roles/{id}`                                                    | `iam.role.read`                                 | Un rol con sus permisos                                                                                                                                                                                 |
| `POST /v1/roles`                                                        | `iam.role.manage` + conf.                       | Crea un rol personalizado                                                                                                                                                                               |
| `PATCH /v1/roles/{id}`                                                  | `iam.role.manage` + conf.                       | Edita un rol personalizado con la versión en `If-Match`; nunca uno del sistema ni uno que usted tenga                                                                                                   |
| `GET /v1/delegations`                                                   | `iam.delegation.manage`                         | Todas con el permiso completo; si no, las que la persona hizo o recibió                                                                                                                                 |
| `POST /v1/delegations`                                                  | `iam.delegation.manage` + conf.                 | Delega aprobaciones propias hasta 60 días (el administrador, las de otros, nunca a su favor)                                                                                                            |
| `POST /v1/delegations/{id}/actions/revoke`                              | `iam.delegation.manage`                         | Retira una delegación vigente o programada; la ajena responde 404                                                                                                                                       |
| `GET /v1/access-review`                                                 | `iam.access_review.read`                        | Informe de revisión de accesos; cada consulta queda en la auditoría                                                                                                                                     |
| `GET /v1/audit-events`                                                  | `audit.event.read`                              | Eventos de auditoría del más reciente al más antiguo, por páginas (`cursor` es el lugar en la cadena); filtros `from`, `to`, `actor_id`, `action` (o su comienzo), `entity_type`, `entity_id`, `result` |
| `GET /v1/entities/{type}/{id}/history`                                  | `audit.event.read`                              | Historial de un registro, por ejemplo `iam_user` o `iam_role`                                                                                                                                           |
| `GET /v1/security-events`                                               | `audit.security.read`                           | Eventos de seguridad por páginas; filtros `from`, `to`, `severity`, `user_id`                                                                                                                           |
| `GET /v1/audit-exports`                                                 | `audit.event.read`                              | Exportaciones hechas: quién, cuándo, con qué filtros y cuántos eventos                                                                                                                                  |
| `POST /v1/audit-exports`                                                | `audit.event.export` + conf.                    | Descarga un CSV con los filtros de la consulta (máximo 10.000 eventos; si no, 422 `AUDIT_EXPORT_TOO_LARGE`)                                                                                             |
| `POST /v1/audit-events/verify-chain`                                    | `audit.chain.verify`                            | Verifica la cadena de la empresa; un daño queda como evento de seguridad crítico                                                                                                                        |
| `GET /v1/tenant`                                                        | `core.tenant.read`                              | Datos legales de la empresa                                                                                                                                                                             |
| `PATCH /v1/tenant`                                                      | `core.tenant.update`                            | Cambia razón social, nombre comercial o NIT con la versión en `If-Match`; un NIT de otra empresa responde 409 `CORE_TAX_ID_TAKEN`                                                                       |
| `GET /v1/sites` · `POST` · `PATCH /{id}` · `DELETE /{id}`               | `core.org.read` / `core.org.manage`             | Sedes; la primera queda como principal y solo hay una                                                                                                                                                   |
| `GET /v1/org-units` · `POST` · `PATCH /{id}` · `DELETE /{id}`           | `core.org.read` / `core.org.manage`             | Procesos y áreas con su jerarquía y cargo líder                                                                                                                                                         |
| `GET /v1/positions` · `POST` · `PATCH /{id}` · `DELETE /{id}`           | `core.org.read` / `core.org.manage`             | Cargos y a quién reporta cada uno                                                                                                                                                                       |
| `GET /v1/cost-centers` · `POST` · `PATCH /{id}` · `DELETE /{id}`        | `core.org.read` / `core.org.manage`             | Centros de costo                                                                                                                                                                                        |
| `GET /v1/catalogs` · `GET /v1/catalogs/{key}`                           | `core.parameter.read`                           | Catálogos y sus opciones                                                                                                                                                                                |
| `POST /v1/catalogs/{key}/items` · `PATCH .../items/{id}`                | `core.catalog.manage`                           | Agrega, edita, reordena o inactiva opciones                                                                                                                                                             |
| `GET /v1/parameters` · `GET /v1/parameters/{key}/history`               | `core.parameter.read`                           | Parámetros con la vigencia de hoy y la programada; historial                                                                                                                                            |
| `POST /v1/parameters/{key}/versions`                                    | `core.parameter.manage`                         | Crea una vigencia nueva (hoy o más adelante); la anterior se conserva                                                                                                                                   |
| `GET /v1/sequences` · `POST` · `PATCH /{id}`                            | `core.sequence.manage`                          | Tipos de consecutivo con el siguiente código; el número no se edita                                                                                                                                     |
| `GET /v1/holidays?year=` · `POST` · `DELETE /{id}`                      | `core.parameter.read` / `core.parameter.manage` | Festivos de un año                                                                                                                                                                                      |
| `GET /v1/business-days?from=&days=`                                     | `core.parameter.read`                           | Fecha en que vence un plazo en días hábiles                                                                                                                                                             |
| `GET /v1/parties` · `GET /v1/parties/{id}`                              | `party.read`                                    | Terceros con búsqueda, filtros por papel y estado, y su ficha. El equipo de proyecto solo ve los que registró                                                                                           |
| `GET /v1/parties/search`                                                | `party.read`                                    | Posibles duplicados: mismo documento, correo, teléfono o nombre                                                                                                                                         |
| `POST /v1/parties` · `PATCH /{id}`                                      | `party.create` / `party.update`                 | Registra o edita un tercero; una persona nueva trae su autorización (`consent`, B17). Documento repetido: 409 `PARTY_DUPLICATE`                                                                         |
| `POST /v1/parties/{id}/actions/change-status`                           | `party.update`                                  | Activa, inactiva, bloquea (con motivo) o desbloquea, con la versión en `If-Match`                                                                                                                       |
| `POST /v1/parties/{id}/roles` · `DELETE .../roles/{role}`               | `party.update`                                  | Agrega o termina un papel                                                                                                                                                                               |
| `GET /v1/parties/{id}/contacts` · `POST` · `PATCH` · `DELETE`           | `party.read` / `party.update`                   | Contactos y firmantes de una organización                                                                                                                                                               |
| `GET /v1/parties/{id}/bank-accounts`                                    | `party.bank_account.read`                       | Cuentas con los cuatro últimos dígitos                                                                                                                                                                  |
| `POST /v1/parties/{id}/bank-accounts`                                   | `party.bank_account.manage` + conf.             | Registra una cuenta pendiente; el número se cifra                                                                                                                                                       |
| `POST .../bank-accounts/{accountId}/actions/approve` · `reject`         | `party.bank_account.approve` + conf.            | Aprueba o rechaza; quien la registró responde 403 `PARTY_SAME_REVIEWER`                                                                                                                                 |
| `POST .../bank-accounts/{accountId}/actions/reveal`                     | `party.bank_account.read` + conf.               | Número completo; cada consulta queda en la auditoría                                                                                                                                                    |
| `GET /v1/parties/{id}/due-diligence` · `POST`                           | `party.read` / `party.due_diligence.manage`     | Conocimiento del tercero y nivel de riesgo                                                                                                                                                              |
| `POST .../due-diligence/{reviewId}/actions/approve` · `reject`          | `party.due_diligence.approve`                   | Aprueba (próxima revisión en 12 meses si no se indica) o rechaza; nunca quien lo registró                                                                                                               |
| `POST /v1/parties/{id}/merge`                                           | `party.merge`                                   | Fusiona un duplicado en este tercero; evento `party.merged` en la bandeja de salida                                                                                                                     |
| `GET /v1/parties/{id}/timeline`                                         | `party.read`                                    | Línea de tiempo con lo que el rol puede ver                                                                                                                                                             |
| `POST /v1/files`                                                        | `doc.document.create`                           | Pide subir un archivo (lista blanca y hasta 20 MB); devuelve el enlace de subida de un solo uso, válido 15 minutos                                                                                      |
| `PUT /v1/files/uploads/{token}`                                         | El enlace                                       | Recibe el archivo con el tipo y el tamaño declarados; queda en análisis                                                                                                                                 |
| `GET /v1/files` · `GET /v1/files/{id}`                                  | `doc.document.read`                             | Archivos con su estado y su huella. Quien solo ve lo propio ve los que subió                                                                                                                            |
| `POST /v1/files/{id}/download-link`                                     | `doc.document.read`                             | Enlace de descarga de cinco minutos, solo si el archivo está disponible                                                                                                                                 |
| `GET /v1/files/downloads/{token}`                                       | El enlace                                       | Entrega el archivo como adjunto y deja la descarga en la auditoría                                                                                                                                      |
| `GET /v1/workflows` · `GET /v1/workflows/{id}`                          | `wf.definition.manage`                          | Flujos y sus versiones; una versión trae sus estados, transiciones y los problemas que impiden publicarla                                                                                               |
| `POST /v1/workflows` · `PATCH /v1/workflows/{id}`                       | `wf.definition.manage`                          | Crea un borrador (versión 1) o edita un borrador con If-Match; una versión publicada no cambia (409 `WF_DEFINITION_NOT_DRAFT`)                                                                          |
| `POST /v1/workflows/{id}/actions/publish`                               | `wf.definition.manage`                          | Publica el borrador sin problemas (If-Match); la versión anterior queda retirada                                                                                                                        |
| `POST /v1/workflows/{id}/actions/new-version`                           | `wf.definition.manage`                          | Copia una versión en un borrador con el número siguiente                                                                                                                                                |
| `POST /v1/workflows/{id}/actions/start-test`                            | `wf.definition.manage`                          | Trámite de prueba con la versión publicada, para ensayar el flujo                                                                                                                                       |
| `GET /v1/tasks/mine`                                                    | `wf.task.work` (lo propio)                      | «Mis tareas»: asignadas, de sus roles, delegadas, escaladas o sin responsable (si reasigna). `?view=open · overdue · closed`                                                                            |
| `GET /v1/tasks`                                                         | `wf.task.read_all`                              | Tablero de todas las tareas, por páginas; `?status=` y `?escalated=true`                                                                                                                                |
| `GET /v1/tasks/{id}`                                                    | `wf.task.work`                                  | La tarea, sus acciones y el historial del trámite; a quien no participa le responde 404                                                                                                                 |
| `POST /v1/tasks/{id}/actions/start` · `complete` · `approve` · `reject` | `wf.task.work`                                  | Tomar, completar con una transición, aprobar o rechazar (con motivo)                                                                                                                                    |
| `POST /v1/tasks/{id}/actions/delegate`                                  | `wf.task.work`                                  | El responsable la entrega a otro colaborador (`to_user_id` o `to_email`); el plazo sigue                                                                                                                |
| `POST /v1/tasks/{id}/actions/reassign`                                  | `wf.task.reassign`                              | La entrega a otra persona con un plazo nuevo                                                                                                                                                            |
| `GET /v1/workflow-instances/{id}`                                       | `wf.task.work`                                  | Trámite: paso actual, acciones posibles, tareas e historial                                                                                                                                             |
| `POST /v1/workflow-instances/{id}/actions/{action}`                     | `wf.task.work`                                  | Transición del flujo; una no definida responde 409 `WF_TRANSITION_NOT_ALLOWED`                                                                                                                          |
| `GET /v1/me/notifications`                                              | Sesión                                          | Mis avisos ya entregados, los más recientes primero; `?unread=true` y el total sin leer                                                                                                                 |
| `POST /v1/me/notifications/{id}/read` · `read-all`                      | Sesión                                          | Marca uno o todos sus avisos como leídos                                                                                                                                                                |
| `GET /v1/me/notification-preferences` · `PUT`                           | Sesión                                          | Qué tipos de aviso recibe también por correo; los urgentes siempre llegan                                                                                                                               |
| `GET /v1/notification-templates` · `PATCH /{kind}`                      | `ntf.template.manage`                           | Plantillas de aviso; cada cambio (If-Match) es una versión nueva. Datos no permitidos: 422 `NTF_TEMPLATE_INVALID`                                                                                       |
| `GET /v1/comments` · `POST` · `DELETE /{id}`                            | Según el registro                               | Comentarios de un tercero o trámite (`?entity_type=&entity_id=`); menciones por correo; solo el autor retira                                                                                            |
| `GET /v1/attachments` · `POST` · `DELETE /{id}`                         | Según el registro                               | Adjuntos de un registro: archivos propios ya revisados; solo quien adjuntó retira                                                                                                                       |
| `GET /v1/parties/authorization-notices`                                 | `party.read`                                    | Textos de autorización publicados, para el componente de autorización de los formularios (B17)                                                                                                          |
| `POST /v1/parties/{id}/consents`                                        | `party.update`                                  | Autorización nueva de una persona con el texto vigente; un texto reemplazado mientras se llenaba responde 409 `PRIVACY_NOTICE_OUTDATED`                                                                 |
| `GET /v1/notices` · `POST` · `GET /{id}` · `PATCH /{id}`                | `privacy.notice.manage`                         | Avisos y políticas con sus versiones; un borrador a la vez por clase (409 `PRIVACY_NOTICE_DRAFT_EXISTS`); lo publicado no cambia (409 `PRIVACY_NOTICE_NOT_EDITABLE`)                                    |
| `POST /v1/notices/{id}/actions/publish`                                 | `privacy.notice.manage`                         | Publica el borrador (If-Match) y reemplaza la versión vigente de su clase                                                                                                                               |
| `GET /v1/consents` · `GET /{id}`                                        | `privacy.consent.read`                          | Autorizaciones con su evidencia; `?party_id=&status=&notice_key=`. Quien solo ve lo propio ve las que registró                                                                                          |
| `POST /v1/consents/{id}/actions/revoke`                                 | `privacy.request.manage`                        | Revoca una sola vez y con motivo; la autorización no se borra                                                                                                                                           |
| `GET /v1/processing-activities` · `POST` · `GET /{id}` · `PATCH /{id}`  | `privacy.activity.manage`                       | Registro de actividades de tratamiento con sus encargados (If-Match al editar)                                                                                                                          |
| `GET /v1/processors` · `POST` · `GET /{id}` · `PATCH /{id}`             | `privacy.processor.manage`                      | Encargados: una organización de Terceros, su país y su contrato de transmisión (`has_contract`)                                                                                                         |
| `POST /v1/attachments/{id}/download-link`                               | Según el registro                               | Enlace de descarga de cinco minutos para quien ve el registro                                                                                                                                           |

«Sesión» quiere decir cualquier sesión completa, sobre la cuenta propia (`@OwnAccount()`). «Según el
registro» es `@RequireRecordAccess()` (B16): el permiso lo define el módulo dueño del registro
(ver [ntf.md](../../docs/manual/datos/ntf.md)). Un
permiso como `iam.user.read` quiere decir que la ruta lo exige (`@RequirePermission()`, B10): sin
él responde 403 `PERMISSION_DENIED`. «A medias» quiere decir que también la atiende una sesión que solo verificó la contraseña
(`@SigningIn()`); cualquier otra ruta le responde 403 `SECOND_FACTOR_REQUIRED`. «Confirmación» es
`@RecentAuthentication()` («conf.» en la tabla): sin una confirmación de identidad de los últimos 30 minutos responde
403 `REAUTHENTICATION_REQUIRED`.

`/health` y `/version` están fuera de `/v1` porque son de operación (los consultan Caddy y
Docker). Los recursos de negocio van bajo `/v1`; en los servidores Caddy les antepone `/api`, así
que desde el navegador son `/api/v1/...` (capítulo 14.1).

El documento OpenAPI se genera desde los esquemas Zod de `packages/contracts` (ADR-010) y se
guarda en [`openapi.json`](openapi.json). Una prueba falla si el archivo no coincide con el código.

## Cadena de petición (capítulo 13.1)

Cada petición pasa por los mismos eslabones, definidos una sola vez en `src/platform/`:

| Paso | Eslabón                      | Dónde                                     | Si falla                    |
| ---- | ---------------------------- | ----------------------------------------- | --------------------------- |
| —    | Cabeceras de seguridad       | `platform/security/security-headers.ts`   | —                           |
| 2    | Identificador de correlación | `platform/correlation/correlation-id.ts`  | —                           |
| 3    | Límite de peticiones         | `ThrottlerGuard` en `app.module.ts`       | 429 `RATE_LIMITED`          |
| 4    | Acceso y sesión              | `platform/access/access.guard.ts`         | 401 `UNAUTHENTICATED`       |
| 5    | Antifalsificación (CSRF)     | `platform/security/csrf.guard.ts`         | 403 `CSRF_INVALID`          |
| 8    | Autorización (B10)           | `platform/access/authorization.guard.ts`  | 403 `PERMISSION_DENIED`     |
| 7    | Validación con Zod           | `ZodValidationPipe` en `app.module.ts`    | 422 `VALIDATION_FAILED`     |
| 12   | Respuesta validada con Zod   | `ZodSerializerInterceptor`                | 500 `INTERNAL_ERROR`        |
| —    | Formato único de error       | `platform/errors/api-exception.filter.ts` | Siempre el formato del 14.2 |

El paso 6 (contexto de empresa) lo fija cada caso de uso con la empresa de la sesión. El paso 11
(auditoría) existe en versión mínima desde B08 (`platform/audit/`); B11 lo completa. El paso 8
(autorización) llega en B10 y corre antes de la validación (paso 7): quien no tiene el permiso no
llega a saber qué datos acepta la ruta. El paso 9 (idempotencia) llega con los módulos que la
necesiten.

### Configuración

`platform/config/env-schema.ts` valida las variables al arrancar. Si falta una obligatoria o
tiene formato inválido, la API no arranca y lista las variables con problema, nunca sus valores.
Solo se exigen las variables que la API usa hoy; cada bloque agrega las suyas.

### Registros

JSON con Pino. Cada línea de una petición lleva `correlation_id`, `service` y `environment`.
Se ocultan los encabezados `Authorization`, `Cookie` y `X-CSRF-Token`, la cookie de respuesta y
los campos `password`, `token`, `otp_code` y `verification_code`. Los cuerpos de las peticiones
no se registran.

### Identificador de correlación

Si la petición trae `X-Correlation-Id` con un UUID válido, se reutiliza; si no, se genera un
UUID v7. Se devuelve siempre en la cabecera `X-Correlation-Id` y en todo error.

### Errores

Todo error sale con el formato del numeral 14.2:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "El recurso solicitado no existe.",
    "details": [],
    "correlation_id": "01a10f6d-79a4-73f1-94d9-da2a6f95a5d5"
  }
}
```

Un error inesperado responde 500 con un mensaje genérico que incluye el identificador; la traza
queda solo en el registro interno. Códigos de la plataforma: `BAD_REQUEST`, `UNAUTHENTICATED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `VALIDATION_FAILED`, `RATE_LIMITED` e
`INTERNAL_ERROR` (`packages/contracts/src/platform/error-response.ts`).

### Acceso

Toda ruta debe declarar cómo se accede a ella con `@Public()`, `@SigningIn()`, `@OwnAccount()` o
`@RequirePermission()` (`platform/access/access.decorators.ts`). Sin declaración, la ruta queda
cerrada. Una prueba (`test/access.test.ts`) falla si alguna ruta de la API no lo declara (ver
«Roles, permisos y autorización»). Las rutas con sesión exigen una sesión válida (ver «Identidad»);
la persona llega al controlador con `@CurrentPrincipal()` y sus permisos con `@CurrentAbility()`.

### Límite de peticiones

`RATE_LIMIT_MAX_REQUESTS` peticiones por dirección IP cada `RATE_LIMIT_WINDOW_SECONDS` segundos.
Detrás de Caddy, la IP real se toma de `X-Forwarded-For` (solo de proxies de red local). Las
rutas de acceso (iniciar sesión, recuperar y restablecer la contraseña, activar la cuenta) tienen
un límite más estricto: 10 por minuto por IP. Además, cada correo tiene su propia espera
progresiva y su bloqueo (ver «Identidad»).

Desde B06 el conteo vive en Valkey (`platform/valkey/valkey-throttler-storage.ts`): un guion de
Valkey cuenta y bloquea en un solo paso, así que no se lo saltan peticiones simultáneas, se
conserva si la API se reinicia y es el mismo para todas sus copias. Si Valkey no responde, toda
petición con límite falla con 500: el límite es un control de seguridad y no se omite. `/health`
no tiene límite (`@SkipThrottle`) para poder informar justamente esa caída; sus revisiones son
baratas y tienen tiempo máximo, y en los servidores Caddy limita el tráfico antes (B07).

### Cabeceras de seguridad (numeral 15.6)

`Strict-Transport-Security`, `Content-Security-Policy` (`default-src 'none'`),
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`,
`Cache-Control: no-store` y `X-Robots-Tag: noindex`. La página `/api/docs` permite estilos en
línea porque Swagger UI los necesita. CORS solo admite `APP_URL`, `PORTAL_URL` y `PUBLIC_URL`.

## Base de datos (B03)

PostgreSQL 17 con Prisma 7 (ADR-006). El modelo está en [`prisma/schema.prisma`](prisma/schema.prisma)
y las migraciones en `prisma/migrations/`. El cliente de Prisma se genera en `src/generated/`
(fuera del repositorio) al instalar, compilar o ejecutar `db:generate`. El diccionario de las
tablas está en [`docs/manual/datos/core.md`](../../docs/manual/datos/core.md).

### Dos usuarios de base de datos

[`infra/postgres/init/01-roles-and-database.sh`](../../infra/postgres/init/01-roles-and-database.sh)
crea la base `arza_one` (UTF-8, intercalación ICU `es-CO`, zona UTC) y dos usuarios, con las
contraseñas de `MIGRATION_DB_PASSWORD` y `APP_DB_PASSWORD`:

| Usuario          | Lo usa                                       | Puede                                                                                                               |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `migration_user` | `pnpm db:migrate` (`DATABASE_MIGRATION_URL`) | Es dueño del esquema y de las tablas; aplica migraciones                                                            |
| `app_user`       | La API y los datos semilla (`DATABASE_URL`)  | Solo lo que cada migración le concede. No es dueño ni superusuario, no salta la seguridad por fila y no borra filas |

### Contexto de empresa y seguridad por fila (ADR-007)

Toda lectura o escritura de datos de negocio pasa por `DatabaseService.withTenant`:

```ts
await database.withTenant({ tenantId, userId }, async (transaction) => {
  await transaction.outboxEvent.create({
    data: { tenantId, eventType: 'quote.accepted', payload },
  });
});
```

`withTenant` valida que los identificadores sean UUID, abre una transacción y fija
`app.tenant_id` y `app.user_id` solo para ella (`set_config(..., true)`, equivalente a `SET LOCAL`,
con parámetros). Las políticas RLS comparan cada fila con `core_current_tenant_id()`. Sin contexto
no se ve ni se escribe ninguna fila; al terminar la transacción el contexto desaparece, así que una
conexión reutilizada no lo hereda. Si el trabajo lanza un error, se revierte todo.

### Reglas para cada tabla nueva de negocio

Prisma no expresa estas piezas; van en el SQL de la migración (ver la primera migración):

1. Columna `tenant_id` (primera en los índices compuestos) y las columnas de control.
2. `ENABLE` y `FORCE ROW LEVEL SECURITY` y una política `USING` y `WITH CHECK` con
   `core_current_tenant_id()`.
3. El disparador `core_set_control_columns()`: fija `created_*`, `updated_*` y `version` (sube en
   cada cambio) y ese valor no se puede falsificar desde el código.
4. `GRANT` explícito a `app_user` solo de lo necesario. Sin `DELETE` salvo que el borrado físico
   esté justificado (capítulo 12.1).
5. Pruebas de aislamiento entre empresas y de permiso denegado en `test/int/`.

Las migraciones nuevas se escriben con `prisma migrate diff` y se completan a mano con lo anterior;
`migration_user` no puede crear la base auxiliar que usa `prisma migrate dev`. Una prueba falla si
la base migrada no coincide con el modelo.

## Valkey y colas de trabajos (B06)

`platform/valkey/valkey.module.ts` abre **una sola conexión** a Valkey para toda la API (límite de
peticiones y `/health`). Sin conexión, cada comando falla de inmediato en lugar de quedar en
espera, y ioredis reintenta conectarse solo. La API arranca aunque Valkey no responda.

`platform/queues/` define las colas y los trabajos (ADR-014): el nombre de cada trabajo, el
esquema Zod de sus datos (todo trabajo lleva `tenantId`, `userId` y `correlationId`) y la
política de reintentos (`DEFAULT_JOB_OPTIONS`: 6 intentos con espera creciente). `JobQueue`
valida los datos antes de encolar. El worker procesa los trabajos ([`apps/worker`](../worker/README.md)).

### Interfaz pública para el worker

[`src/platform/index.ts`](src/platform/index.ts) se publica como `@arza/api/platform` y el
módulo de identidad como `@arza/api/iam` (campo `exports` de `package.json`). Es lo único que el worker puede importar de la API (ADR-004):
configuración, `DatabaseService`, empresas semilla, datos que no se registran y colas. Agregar algo
ahí es ampliar ese contrato.

## Identidad (B08, módulo `src/modules/iam`)

Cuentas, inicio de sesión, sesiones y contraseñas según el numeral 15.1 y la ADR-008. Las tablas
están en [`docs/manual/datos/iam.md`](../../docs/manual/datos/iam.md).

| Regla                        | Cómo se cumple                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta solo por invitación     | `pnpm iam:invitar` crea la cuenta invitada y encola el correo; el enlace vence en 72 horas y sirve una vez. Desde B10 también la pantalla de usuarios, con `iam.user.invite` |
| Contraseñas                  | De 12 a 128 caracteres, sin reglas de composición, fuera de la lista de filtradas ([`data/`](data/README.md)). Argon2id de Node.js, parámetros de OWASP, sal propia          |
| Sesión                       | 256 bits al azar en la cookie `__Host-arza_session` (HttpOnly, Secure, SameSite=Lax); en la base solo su huella. Vence a las 8 horas sin uso y a las 12 en total             |
| Antifalsificación            | Código por sesión (HMAC con `CSRF_SECRET`) en la cabecera `X-CSRF-Token` y origen propio en toda operación que modifica datos                                                |
| Espera y bloqueo             | 1, 2, 4 y 8 segundos tras cada fallo; al quinto, 15 minutos con evento de seguridad, alerta en la bandeja de salida y auditoría. Igual para correos sin cuenta               |
| El error no revela el correo | Mismo código y mensaje para correo inexistente, contraseña equivocada o cuenta no activa; sin cuenta se calcula igual un hash para gastar el mismo tiempo                    |
| Recuperación                 | Enlace de 30 minutos; al usarlo se cierran todas las sesiones y se avisa por correo                                                                                          |
| Cambio de contraseña         | Pide la actual; cierra todas las sesiones, incluida la actual, y avisa por correo                                                                                            |

Los correos los envía el worker (trabajo `iam.account-email`). El trabajo solo lleva el usuario y
el propósito: el enlace se crea al enviarlo, así su llave nunca queda guardada en la cola.

**Cómo encuentra la empresa.** Al iniciar sesión todavía no se sabe la empresa. Unas funciones
estrechas de la base de datos (`iam_find_login_user`, `iam_find_session`, `iam_find_token`) dicen
a qué usuario y empresa pertenece un correo, una sesión o un enlace; todo lo demás ocurre dentro de
la transacción de esa empresa. Por eso el correo es único en toda la plataforma.

## Segundo factor y seguridad de sesión (B09)

| Regla                           | Cómo se cumple                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Obligatorio por tipo de usuario | Siempre para los internos (no se puede desactivar). En el portal, para quien tenga `mfa_required` (asignar el rol `CLIENTE_ADMIN` lo activa, B10); opcional para los demás |
| Dos pasos                       | La contraseña correcta abre una sesión a medias de 10 minutos que solo atiende el segundo paso; al completarlo la sesión recibe una llave nueva y sus 12 horas             |
| TOTP                            | `otpauth` (MIT): seis dígitos cada 30 segundos, se acepta el anterior y el siguiente, y cada código sirve una sola vez (se guarda el último paso usado)                    |
| Secreto cifrado                 | AES-256-GCM con `FIELD_ENCRYPTION_KEY` (`src/platform/crypto/field-cipher.ts`), atado a la empresa y la persona; la base rechaza un secreto sin cifrar                     |
| Códigos de recuperación         | Diez de 16 caracteres, de un solo uso; solo su huella SHA-256. Usar uno deja evento de seguridad y aviso por correo                                                        |
| Cinco códigos equivocados       | Cierran la sesión y bloquean la cuenta 15 minutos, con evento de seguridad grave, alerta en la bandeja de salida y auditoría (también al confirmar la identidad)           |
| Confirmar la identidad          | `POST /v1/auth/reauthenticate`; vale 30 minutos. Lo exigen: códigos nuevos, cambiar de celular y desactivar                                                                |
| Sesiones activas                | La lista y el cierre remoto; como cada petición valida la sesión en la base, el cierre surte efecto en la siguiente petición                                               |
| Dispositivo nuevo (15.5)        | Marca aleatoria en la cookie `__Host-arza_device` (400 días; solo su huella en `iam_known_devices`). El primer equipo no avisa; los siguientes dejan evento y correo       |
| Avisos por correo               | Activó, cambió, desactivó o reiniciaron el segundo factor; códigos nuevos; código usado; equipo nuevo. Nunca llevan códigos ni secretos                                    |

**Reiniciar el segundo factor de alguien** que perdió el celular y los códigos (desde B10 también
en la pantalla de usuarios, con el permiso `iam.user.reset_mfa`). Antes, confirme la identidad de la persona
por otro medio:

```bash
pnpm iam:reiniciar-segundo-factor --correo ana@demo-uno.test
```

Cierra todas sus sesiones, deja auditoría y evento de seguridad, y le avisa por correo. Al volver a
entrar, la persona configura el segundo factor de nuevo.

**Invitar a una persona** (con `pnpm infra:up` y `pnpm dev` encendidos):

```bash
pnpm iam:invitar --empresa demo-uno --correo ana@demo-uno.test --nombre "Ana Pérez" --tipo interno
```

`--empresa` acepta `plataforma`, `demo-uno`, `demo-dos` o el identificador de la empresa; `--tipo`,
`interno` (aplicación) o `portal`. Si la invitación sigue pendiente, la reenvía. Para un
administrador de cliente agregue `--exige-segundo-factor`.

## Roles, permisos y autorización (B10)

Permisos por rol y por registro con CASL (ADR-009). El catálogo del anexo G, la matriz del numeral
15.3 y los 16 roles del sistema viven en `packages/contracts/src/iam/` y la semilla los carga en
cada empresa. La tabla legible de qué tiene cada rol está en
[`permisos-por-rol.md`](../../docs/manual/datos/permisos-por-rol.md) y las tablas en
[`iam.md`](../../docs/manual/datos/iam.md).

| Regla                                    | Cómo se cumple                                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada punto declara su permiso            | `@RequirePermission('iam.user.lock')`, `@OwnAccount()` (solo en `/v1/me` y `/v1/auth`), `@SigningIn()` o `@Public()`. `test/access.test.ts` falla si alguna ruta no declara nada, si nombra un permiso fuera del catálogo o si usa `@OwnAccount()` fuera de su lugar |
| Permisos de la persona                   | La suma de sus roles vigentes (no retirados, empezados y sin vencer), calculada en cada petición: retirar un rol surte efecto en la siguiente                                                                                                                        |
| «manage» no es comodín                   | CASL trata «manage» como cualquier acción; `buildAbility()` lo desactiva para que `party.due_diligence.manage` no incluya aprobar (B13)                                                                                                                              |
| Sin el permiso                           | 403 `PERMISSION_DENIED`, sin decir qué permiso falta. La guarda va después de la protección CSRF y antes de pedir confirmar la identidad                                                                                                                             |
| «Solo lo propio» (letra P)               | El permiso pasa la ruta; el caso de uso revisa el registro con `canOnRecord()` y responde 404 si no es de la persona (numeral 15.5, BOLA)                                                                                                                            |
| Respuesta según el rol                   | La ficha de un usuario trae sus datos de seguridad solo a quien puede bloquear o reiniciar el segundo factor; a los demás, `security: null`                                                                                                                          |
| Nadie se asigna permisos a sí mismo      | La API responde 403 `SELF_PERMISSION_CHANGE` al asignarse o retirarse un rol, al editar un rol que se tiene y al registrar una delegación a su favor; la base de datos lo impide además con restricciones                                                            |
| Roles del sistema                        | No se editan (422 `SYSTEM_ROLE_READONLY`); la semilla los deja como dice la matriz y audita cada corrección (`iam.role.sync`)                                                                                                                                        |
| Auditor por tiempo limitado              | Su asignación siempre vence, a los 90 días como máximo (422 `ROLE_EXPIRY_INVALID`)                                                                                                                                                                                   |
| Administrador del cliente                | Asignar `CLIENTE_ADMIN` vuelve obligatorio el segundo factor de esa cuenta                                                                                                                                                                                           |
| Toda persona interna                     | Recibe COLABORADOR al ser invitada (por la pantalla o por el comando)                                                                                                                                                                                                |
| Alerta de cada cambio de permisos (15.5) | Auditoría, evento de seguridad `iam.permissions.changed` y alerta `security.alert` en la bandeja de salida, en la misma transacción; correo a la persona cuando cambian sus roles                                                                                    |
| Delegaciones                             | Solo aprobaciones que quien delega tiene hoy, hasta 60 días, nunca a uno mismo. Quien no ve la lista de usuarios indica el correo de quien recibe                                                                                                                    |

Las acciones de alto riesgo («+ conf.» en la tabla de puntos) piden además confirmar la identidad
en los últimos 30 minutos, como en B09.

**Para un módulo nuevo:** declare cada ruta con `@RequirePermission()` y un permiso del catálogo.
Si el permiso tiene «solo lo propio», arme en cada registro el campo `involved_user_ids` con las
personas relacionadas (quien lo creó, sus miembros, a quien está asignado) y revíselo con
`canOnRecord(ability, código, registro)` usando `@CurrentAbility()`. Agregar un permiso exige
agregarlo al catálogo y a la matriz, y regenerar `permisos-por-rol.md` con
`pnpm --filter @arza/contracts test -u`.

**Dar el primer rol de administrador** (desde la pantalla nadie se asigna roles a sí mismo):

```bash
pnpm iam:asignar-rol --correo ana@demo-uno.test --rol ADMIN_PLATAFORMA
```

`--vence dd/mm/aaaa` fija el último día del rol (obligatorio para `AUDITOR`). La asignación queda a
nombre del sistema en la auditoría y la persona recibe un aviso por correo.

## Auditoría y trazabilidad (B11, módulo `src/modules/audit`)

Evidencia inalterable de todo lo que ocurre (ficha 17.20, ADR-012). Las tablas están en
[`aud.md`](../../docs/manual/datos/aud.md).

| Regla                            | Cómo se cumple                                                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toda escritura deja su evento    | El caso de uso llama a `recordAuditEvent()` (o `recordSecurityEvent()`) dentro de su transacción. `DatabaseService.withTenant` revierte la transacción que escribió sin evento; las excepciones van en `UnauditedWrite` con su porqué                     |
| Una prueba lo comprueba          | `test/int/audit/write-routes-audited.int.test.ts` toma del OpenAPI cada ruta `POST`, `PUT`, `PATCH` o `DELETE`, la llama con un identificador de correlación y exige un evento con ese identificador. Una ruta nueva sin su llamada hace fallar la prueba |
| Nadie modifica la auditoría      | `app_user` solo lee e inserta; no tiene acceso a las particiones                                                                                                                                                                                          |
| Cadena de hash                   | La base de datos fija `seq`, `prev_hash` y `hash` al insertar; `aud_verify_chain()` encuentra el primer evento faltante, alterado, desunido o borrado al final                                                                                            |
| Valor anterior y nuevo           | `changesBetween(antes, después, restringidos)`: de los restringidos solo «cambió»                                                                                                                                                                         |
| Consultar también queda auditado | Cada consulta, historial, exportación y verificación deja su evento                                                                                                                                                                                       |
| Verificación diaria              | El worker ejecuta `audit.chain-check` a las 3:00 a. m.: particiones de los próximos meses y verificación de cada empresa                                                                                                                                  |

**Para un módulo nuevo:** en cada caso de uso que escribe, registre el evento con
`recordAuditEvent()` en la misma transacción, con la acción en el formato del permiso
(`crm.quote.approve`) y `changes: changesBetween(...)`, marcando los campos restringidos. Agregue
la llamada de cada ruta nueva que escribe a `test/int/audit/support/write-route-calls.ts`, y el
nombre de la acción a `apps/web/src/features/audit/labels.ts`. Para el historial de una ficha
use `<EntityHistory entityType="..." entityId={...} />` en la web.

## Núcleo: organización, catálogos, consecutivos y parámetros (B12, módulo `src/modules/core`)

Datos maestros de cada empresa (ficha 17.1). Las tablas están en
[`core.md`](../../docs/manual/datos/core.md).

| Regla                                            | Cómo se cumple                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un parámetro nunca se sobrescribe                | `POST /v1/parameters/{key}/versions` crea una vigencia que empieza hoy o más adelante y cierra la anterior el día antes; el disparador `core_parameters_keep_history` impide el resto |
| Cambiar un parámetro deja valor anterior y nuevo | El evento `core.parameter.update` guarda `value.from` y `value.to`                                                                                                                    |
| Un cargo o proceso con registros no se elimina   | `DELETE` responde 409 `CORE_RECORD_IN_USE` si tiene subordinados, cargos, procesos a cargo, centros de costo o personas (`usersInPosition()` del módulo de identidad)                 |
| Ninguna jerarquía es circular                    | `createsCycle()` (dominio) antes de guardar; 422 `CORE_HIERARCHY_CYCLE`                                                                                                               |
| Consecutivos sin saltos ni duplicados            | `nextBusinessCode(tx, key, now)` bloquea la fila del tipo y el año dentro de la transacción del caso de uso; si se revierte, el número vuelve                                         |
| Días hábiles con festivos y horario              | `businessDeadline(tx, from, days)`: horario `work.schedule` vigente ese día y festivos de la empresa. Los festivos de Colombia los calcula `colombianHolidays(year)`                  |
| Una sola sede principal                          | Al marcar una, las demás dejan de serlo; la principal no se inactiva ni se elimina                                                                                                    |

**Para un módulo nuevo:** pida el código de cada registro con `nextBusinessCode(tx, 'crm.quote',
now)` dentro de la misma transacción que lo crea (el tipo de consecutivo se crea en la semilla del
módulo o en Administración › Consecutivos), y calcule los vencimientos con
`businessDeadline(tx, desde, días)`. Ambos se importan de `src/modules/core/index.ts`; nunca lea
las tablas `core_` directamente. Un parámetro nuevo se agrega a `PARAMETER_DEFINITIONS` y a
`parameterValueSchema` en `packages/contracts/src/core/calendar.ts`.

`pnpm db:seed` carga en cada empresa: los festivos de 2025 a 2030, el horario laboral, el catálogo
de tipos de documento y el organigrama **provisional** (`core-seed-data.ts`). La semilla solo crea
lo que falta: nunca deshace lo que la empresa cambió.

## Terceros (B13, módulo `src/modules/party`)

Registro único de cada persona u organización (ficha 17.3). Las tablas están en
[`pty.md`](../../docs/manual/datos/pty.md).

| Regla                                            | Cómo se cumple                                                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documento único y NIT con su dígito              | Índice único `(tenant_id, id_type, id_number)` y restricción con `pty_nit_check_digit()`; el contrato valida lo mismo en la web y la API                                         |
| Crear con documento repetido ofrece el existente | 409 `PARTY_DUPLICATE`; `GET /v1/parties/search?id_number=` devuelve el tercero, o el que se conservó si el documento es de un duplicado fusionado                                |
| Datos personales con finalidad y autorización    | Obligatorios en personas (contrato y restricción de la base); la finalidad sale del catálogo `personal_data_purposes`                                                            |
| Cuentas bancarias cifradas con doble aprobación  | `FieldCipher` con contexto de empresa y fila; `reviewed_by <> created_by` en la base; el disparador `pty_keep_reviews` impide cambiar una cuenta revisada                        |
| Conocimiento aprobado por otra persona           | Solo Dirección tiene `party.due_diligence.approve`; quien registró no aprueba. «Apto» = último aprobado y vigente                                                                |
| La fusión conserva el historial de ambos         | El duplicado queda con `merged_into_id` y `deleted_at`; papeles, contactos, cuentas y conocimiento pasan al que se conserva; evento `party.merge` y `party.merged` en la bandeja |
| La línea de tiempo muestra solo lo que el rol ve | `entityHistory()` del módulo de auditoría con los registros del tercero; los de cuentas bancarias solo con `party.bank_account.read`                                             |

**Para un módulo nuevo:** guarde `party_id` con llave foránea `(tenant_id, party_id)` a
`pty_parties`, escuche `party.merged` para reasignar sus registros, y antes de facturar o contratar
exija que la ficha diga `due_diligence.state = 'approved'` (ficha 17.3). Nunca lea las tablas
`pty_` directamente.

`pnpm db:seed:demo` carga en las empresas de demostración tres organizaciones (dos de ellas son la
misma escrita distinto, para ensayar la fusión) y dos personas de contacto, todas ficticias.

## Archivos (B14, módulo `src/modules/doc`)

Carga, análisis y descarga de archivos (numeral 13.2, ADR-013). La tabla está en
[`doc.md`](../../docs/manual/datos/doc.md).

| Regla                                     | Cómo se cumple                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Garage nunca queda expuesto               | Los enlaces temporales son de la API (`/v1/files/uploads/…` y `/downloads/…`): el contenido pasa por ella. La llave tiene 256 bits y Valkey guarda solo su huella            |
| Lista blanca por contenido real           | El contrato revisa tipo, extensión y tamaño; el worker reconoce el tipo por los primeros bytes (`detectFileType()`): un ejecutable renombrado como PDF queda `type_mismatch` |
| Antivirus antes de aceptar                | `scanWithClamav()` usa la orden INSTREAM de clamd. Si ClamAV no responde, el trabajo se reintenta y el archivo sigue «en análisis»: nunca se acepta sin revisar              |
| Huella SHA-256 fija                       | La calcula el worker; el disparador `doc_keep_analyzed_files` no deja cambiarla después                                                                                      |
| Descarga solo con permiso y por 5 minutos | El enlace se emite tras revisar `doc.document.read` (y «lo propio»); vence a los cinco minutos y la respuesta es siempre un adjunto                                          |
| Registro de accesos                       | Pedir el enlace y descargar dejan `doc.file.download_link` y `doc.file.download` en la auditoría; un virus deja además el evento de seguridad `doc.file.virus_detected`      |

**Para un módulo nuevo:** guarde el `file_id` del archivo y decida quién lo ve según sus propios
registros; para servirlo, use el índice del módulo `doc` (nunca la tabla `doc_files` ni Garage
directamente).

Las pruebas de integración levantan Garage y un ClamAV con una sola firma, la del archivo de
ensayo EICAR, que arranca en segundos (`test/int/support/file-services.ts`).

## Flujos y tareas (B15, módulo `src/modules/wf`)

Motor de flujos definido por datos (ficha 17.5, numeral 13.2, ADR-011). Las tablas están en
[`wf.md`](../../docs/manual/datos/wf.md).

| Regla                                   | Cómo se cumple                                                                                                                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una transición no definida es imposible | `transitionProblem()` (dominio) la rechaza antes de escribir: 409 `WF_TRANSITION_NOT_ALLOWED`, también por la API                                                                                                      |
| Permiso, condición y comentario         | La transición exige su permiso del anexo G (o atender el paso), que el registro cumpla su condición (comparaciones con datos, nunca código) y el comentario si lo pide                                                 |
| Versiones                               | Publicar retira la versión anterior; los trámites guardan su `definition_id` y terminan con su versión. Los disparadores `wf_keep_published_definitions` y `wf_only_draft_parts` impiden cambiar una publicada         |
| Aprobaciones en serie y en paralelo     | Cada decisión queda en `wf_approvals`; `approvalOutcome()` crea la tarea del siguiente aprobador, espera o hace la transición `approve` o `reject`                                                                     |
| Delegación                              | Delegar entrega la tarea; además, una delegación de B10 vigente deja aprobar a nombre de quien delegó si cubre el permiso de la transición `approve`                                                                   |
| Plazos y escalamiento                   | Plazos en horas hábiles (`businessHoursDeadline()` del núcleo). El worker escala cada 15 minutos las tareas vencidas al jefe inmediato (cargo superior en el organigrama); sin jefe, las atiende quien reasigna tareas |
| Auditoría y avisos                      | Cada escritura deja su evento `wf.*`; la bandeja de salida recibe `wf.instance.started`, `wf.instance.transitioned`, `wf.task.assigned` y `wf.task.escalated` (B16 los convierte en avisos)                            |

**Para un módulo nuevo:** inicie el flujo de su registro con `startWorkflow()` y pida los pasos con
`requestTransition()` del índice del módulo `wf`, dentro de la transacción de su caso de uso, y
reaccione a los eventos `wf.instance.*` de la bandeja de salida. Nunca lea las tablas `wf_`.

`pnpm db:seed:demo` carga en las empresas de demostración el flujo «Solicitud de prueba»: hasta
$5.000.000 lo revisan en serie el jefe inmediato y Calidad; más, en paralelo, Dirección y
Administrativo y financiero.

## Avisos, comentarios y adjuntos (B16, módulo `src/modules/ntf`)

Centro de avisos, correo con plantillas institucionales, preferencias y comentarios con menciones
y adjuntos en cualquier registro (ficha 17.5, numeral 13.2). Las tablas están en
[`ntf.md`](../../docs/manual/datos/ntf.md).

| Regla                                        | Cómo se cumple                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ningún evento se pierde                      | `publishOutboxEvents()` publica cada evento en su propia transacción (`FOR UPDATE SKIP LOCKED`): sus avisos y la marca de publicado se guardan juntos o nada; si el worker se detiene, sigue pendiente |
| Un aviso fuera de jornada espera             | `nextBusinessMoment()` del núcleo: el mismo instante si cae en una jornada de un día hábil, o el inicio de la siguiente. Un aviso del sábado se entrega el lunes a las 8:00                            |
| Excepciones                                  | La marca «urgente» de cada plantilla (Administración › Plantillas). Al empezar solo la alerta de seguridad es urgente; las personas del portal no son colaboradores y reciben todo al instante         |
| Correo                                       | `sendDueNoticeEmails()` envía los correos cuya hora llegó, con reserva de 10 minutos y reintentos (1, 5, 15 y 60 minutos; al quinto fallo, `failed`). El worker pone el marco de `@arza/templates`     |
| Comentarios y adjuntos de cualquier registro | `record-access.ts` le pregunta al módulo dueño si la persona ve el registro (`visiblePartyName()`, `visibleInstanceTitle()`); las rutas usan `@RequireRecordAccess()`                                  |

**Para un módulo nuevo:** produzca avisos con un evento en la bandeja de salida y agregue su manejo
en `event-notices.ts`, con su tipo, su plantilla y sus variables en `packages/contracts`. Para que
sus registros tengan comentarios y adjuntos, agregue el tipo a `commentableEntityTypeSchema`, a la
regla de la base de datos y a `RECORD_TYPES`, y ponga `<RecordActivity>` en su ficha.

`pnpm db:seed` carga las plantillas de cada empresa (`seedNotificationTemplates()`); no toca las que
ya existen.

## Privacidad (B17, módulo `src/modules/privacy`)

Avisos y políticas versionados, autorizaciones de tratamiento con la versión aceptada, registro de
actividades de tratamiento y encargados (ficha 17.19, numeral 20.1). Las tablas están en
[`prv.md`](../../docs/manual/datos/prv.md).

| Regla                                        | Cómo se cumple                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ningún formulario se envía sin autorización  | El contrato del formulario exige `consent` con `accepted: true`; el caso de uso llama a `grantConsent()` en su misma transacción: si la autorización no vale, no se guarda nada |
| Cada autorización guarda la versión aceptada | `prv_consents.notice_id` apunta a la versión exacta; el disparador `prv_keep_consents` solo acepta textos de autorización publicados e impide editarla                          |
| Lo publicado no cambia                       | El disparador `prv_keep_notices`: borrador → publicado → reemplazado, uno de cada uno por clase; publicar toma un bloqueo por clase (`pg_advisory_xact_lock`)                   |
| Sin dependencia circular con terceros        | Terceros usa el índice de privacidad; privacidad pide los nombres de los terceros por el puerto `PARTY_DIRECTORY`, que presta `PartyDirectoryModule`                            |

**Para un formulario nuevo con datos personales:** agregue `consent: consentGrantSchema` a su
contrato, muestre `<ConsentFields>` de `apps/web/src/features/privacy` con los textos de
autorización publicados y llame a `grantConsent()` del índice de privacidad dentro de la
transacción de su caso de uso, con su propio `source` (agréguelo al contrato y a la regla de la
base de datos).

`pnpm db:seed` carga en cada empresa un borrador provisional de cada texto
(`seedPrivacyNotices()`), marcado «PENDIENTE DE CONCEPTO JURÍDICO»; mientras no se publique uno,
no se pueden registrar personas. `pnpm db:seed:demo` los publica en las empresas de demostración.

## Imágenes Docker (B05 y B07)

[`Dockerfile`](Dockerfile) produce dos imágenes, sin gestores de paquetes y con usuario sin
privilegios:

| Imagen      | Cómo se construye                                               | Qué lleva                                                                                                                                                                              |
| ----------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API         | `bash infra/scripts/ci/build-image.sh api arza-one/api`         | La API compilada y sus dependencias de producción                                                                                                                                      |
| Migraciones | `bash infra/scripts/ci/build-image.sh migrate arza-one/migrate` | Solo la consola de Prisma ([`infra/migrate`](../../infra/migrate/package.json)), el esquema y las migraciones. El despliegue la ejecuta una vez con `DATABASE_MIGRATION_URL` y termina |

En pruebas la API vive detrás de Caddy en `https://pruebas.[dominio]/api`; Caddy quita el prefijo
`/api` antes de pasarle la petición ([`infra/caddy/Caddyfile`](../../infra/caddy/Caddyfile)).

## Pruebas

- `src/**/*.test.ts`: unitarias (configuración, identificador, registros, revisiones de /health).
- `test/*.test.ts`: la API completa en memoria con Supertest, con la misma cadena que en
  producción. Las piezas externas de `/health` se simulan; `test/support/sample.controller.ts`
  agrega rutas de ensayo que solo existen en las pruebas.
- `test/startup.test.ts`: arranca el programa compilado real y comprueba que no arranca sin
  una variable obligatoria; sin Valkey, atiende `/health` y rechaza el resto (no omite el límite).
  Las demás pruebas en memoria cuentan el límite de peticiones en memoria.
- `test/int/*.int.test.ts` (`pnpm test:int`): con PostgreSQL 17 y Valkey 8 reales en Docker
  (Testcontainers). `test/int/support/global-setup.ts` crea la base con el mismo guion de
  `infra/postgres/init`, contraseñas desechables, y aplica las migraciones desde cero; también
  levanta Valkey con contraseña. Cubren aislamiento entre empresas, permisos denegados a
  `app_user`, columnas de control, transacciones, migraciones, semillas, el límite de peticiones
  en Valkey (429, conteo exacto con peticiones simultáneas, conteo compartido entre dos copias de
  la API) y la cola de trabajos. El worker reutiliza la misma preparación.
- `test/int/iam/`: identidad contra la base real, con un reloj de prueba para adelantar el
  tiempo (bloqueo, inactividad, vencimiento de enlaces): inicio de sesión, sesiones, contraseñas,
  invitación, aislamiento entre empresas y auditoría de solo inserción.
- `test/session-chain.test.ts` y `test/csrf.test.ts`: pasos 4 y 5 de la cadena, sin base de datos.
- Cobertura mínima: 90 % de líneas, funciones e instrucciones y 85 % de ramas (capítulo 21.1).
  [`vitest.shared.ts`](vitest.shared.ts) dice qué se mide en `test:int` (lo que trabaja contra la
  base de datos o Valkey); cada archivo se mide en un solo lado.
  Los datos semilla, el conteo en Valkey y `JobQueue` se miden en `test:int`, con el mismo umbral,
  porque solo se prueban con PostgreSQL y Valkey reales. `@prisma/client` figura como dependencia usada en `knip.json` porque solo lo
  importa el cliente generado, que no está en el repositorio.
