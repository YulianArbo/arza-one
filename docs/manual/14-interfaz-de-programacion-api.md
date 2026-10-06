# 14. Interfaz de programación (API)

## 14.1 Convenciones

| **Aspecto**             | **Convención**                                                                                                                                                                                                                     |
|-------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Estilo**              | REST sobre HTTPS con JSON. Base /api/v1. Documentación OpenAPI 3.1 generada desde los esquemas Zod y publicada solo en local y en pruebas.                                                                                         |
| **Recursos**            | Sustantivos en plural y minúsculas con guiones: /api/v1/quotes, /api/v1/contracts/{id}/amendments.                                                                                                                                 |
| **Acciones de negocio** | Las transiciones de estado son acciones explícitas: POST /contracts/{id}/actions/approve. No se cambia el estado editando el campo.                                                                                                |
| **Métodos**             | GET consulta; POST crea o ejecuta una acción; PATCH modifica parcialmente; DELETE aplica borrado lógico.                                                                                                                           |
| **Concurrencia**        | PATCH y DELETE exigen la versión del registro (cabecera If-Match). Si otro usuario lo modificó primero, responde 409 y la interfaz ofrece recargar.                                                                                |
| **Paginación**          | Por cursor: ?limit=25&cursor=… Respuesta con data, next_cursor y total cuando es barato calcularlo. Máximo 100 por página.                                                                                                         |
| **Filtros y orden**     | Parámetros nombrados y validados por lista blanca: ?status=open&owner_id=…&sort=-created_at. No se aceptan filtros arbitrarios.                                                                                                    |
| **Fechas y dinero**     | Fechas en ISO 8601 con zona; dinero como cadena decimal con moneda: {"amount":"1500000.00","currency":"COP"}.                                                                                                                      |
| **Idempotencia**        | Cabecera Idempotency-Key obligatoria en creación de facturas, pagos, envíos a firma y formularios públicos.                                                                                                                        |
| **Seguridad**           | Cookie de sesión HttpOnly, Secure y SameSite=Lax para las aplicaciones web; token antifalsificación; CORS limitado a los dominios propios. Para integraciones de máquina, credenciales de cliente con alcance limitado y rotación. |
| **Versionado**          | Cambios incompatibles solo en una nueva versión /v2; /v1 se mantiene al menos seis meses.                                                                                                                                          |
| **Webhooks**            | Avisos salientes firmados con HMAC, con reintentos y registro de entrega; entrantes verificados por firma y procesados de forma idempotente.                                                                                       |

## 14.2 Formato de error

{

"error": {

"code": "QUOTE_EXPIRED",

"message": "La cotización venció el 15/10/2026 y no puede aceptarse.",

"details": \[ { "field": "valid_until", "issue": "past_date" } \],

"correlation_id": "0192f3a1-7c2e-7b11-9a55-2d1c6f0e4a10"

}

}

| **Código HTTP** | **Cuándo**                                                                      |
|-----------------|---------------------------------------------------------------------------------|
| **400**         | Petición mal formada                                                            |
| **401**         | Sin sesión válida                                                               |
| **403**         | Sin permiso para la acción                                                      |
| **404**         | No existe o no pertenece a la empresa del usuario                               |
| **409**         | Conflicto de versión, de estado o de idempotencia                               |
| **422**         | Datos válidos en forma pero rechazados por una regla de negocio o de validación |
| **429**         | Límite de peticiones superado                                                   |
| **500**         | Error inesperado; se informa el identificador de correlación                    |

## 14.3 Catálogo de recursos por módulo

Cada recurso ofrece, salvo indicación, listar, consultar, crear, modificar y borrar lógicamente. La columna de acciones enumera las transiciones y operaciones especiales. El catálogo completo con parámetros y ejemplos lo genera OpenAPI a partir del código.

| **Módulo** | **Recursos (/api/v1/…)**                                                                                                                                                                | **Acciones y operaciones especiales**                                                                                                                                                                             |
|------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **M00**    | tenant, sites, org-units, positions, cost-centers, catalogs, parameters, holidays                                                                                                       | parameters/{key}/history                                                                                                                                                                                          |
| **M01**    | auth, users, roles, permissions, sessions, delegations                                                                                                                                  | auth/login, auth/mfa/verify, auth/logout, auth/password/forgot, auth/password/reset, users/{id}/actions/invite · lock · unlock · reset-mfa, sessions/{id}/revoke, me, me/permissions                              |
| **M02**    | parties, parties/{id}/contacts, parties/{id}/bank-accounts, parties/{id}/due-diligence                                                                                                  | parties/search, parties/{id}/merge, parties/{id}/timeline                                                                                                                                                         |
| **M03**    | documents, documents/{id}/versions, folders, files, change-requests, retention-rules, form-templates, form-records, output-templates                                                    | files/upload-url, files/{id}/download-url, versions/{id}/actions/submit · approve · publish · obsolete, versions/{id}/acknowledge, documents/master-list, form-records/{id}/pdf, dispositions/propose             |
| **M04**    | workflows, tasks, notifications, notification-preferences, comments, attachments                                                                                                        | tasks/mine, tasks/{id}/actions/complete · approve · reject · delegate, notifications/read-all                                                                                                                     |
| **M05**    | leads, opportunities, activities, services, quotes, quotes/{id}/items, campaigns                                                                                                        | leads/{id}/actions/qualify · convert · discard, opportunities/{id}/actions/move · win · lose, quotes/{id}/actions/send · accept · reject · new-version, quotes/{id}/pdf, pipeline/summary                         |
| **M06**    | contracts, contracts/{id}/obligations, contracts/{id}/amendments, clauses, envelopes, envelopes/{id}/signers                                                                            | contracts/{id}/actions/submit · approve · send-to-sign · terminate · renew, envelopes/{id}/actions/send · remind · cancel, sign/{token} (público), sign/{token}/otp, sign/{token}/accept, verify/{code} (público) |
| **M07**    | projects, projects/{id}/members · milestones · sprints · items · deliverables · risks · releases · links, time-entries, code-reviews, incidents                                         | items/{id}/actions/move, deliverables/{id}/actions/submit · accept · reject, projects/{id}/actions/start · pause · close, projects/{id}/board, projects/{id}/health                                               |
| **M08**    | tickets, tickets/{id}/messages, pqrsf, surveys, survey-responses, kb-articles, compensations, warranties                                                                                | tickets/{id}/actions/assign · escalate · resolve · reopen · close, pqrsf/{id}/actions/classify · respond · close, public/pqrsf (público), public/pqrsf/{code}/status (público), surveys/{token}/answer (público)  |
| **M09**    | portal/projects, portal/deliverables, portal/contracts, portal/invoices, portal/tickets, portal/documents, portal/users                                                                 | Mismas acciones del cliente: aceptar entregable, firmar, crear tiquete, descargar factura; siempre limitadas a su organización                                                                                    |
| **M10**    | invoices, invoices/{id}/items, credit-notes, payments, collection-actions, budgets, expenses, petty-cash, bank-reconciliations, tax-parameters                                          | invoices/{id}/actions/approve · register-fiscal · void, receivables/aging, exports/accounting, budgets/{id}/actions/approve                                                                                       |
| **M11**    | purchase-requests, purchase-quotes, purchase-orders, receipts, supplier-evaluations, travel-requests, assets, asset-assignments, asset-maintenance                                      | purchase-requests/{id}/actions/submit · approve · reject, purchase-orders/{id}/actions/issue · receive · close, assets/{id}/actions/assign · return · retire                                                      |
| **M12**    | employees, employment-contracts, vacancies, candidates, onboarding-tasks, leave-requests, overtime, payroll-novelties, performance-reviews, trainings, disciplinary-cases, offboardings | candidates/{id}/actions/advance · reject · hire, leave-requests/{id}/actions/approve · reject, payroll-novelties/close-period, employees/{id}/file                                                                |
| **M13**    | hazards, work-plan, incidents, investigations, inspections, unsafe-reports, medical-exams, ppe-deliveries, committee-minutes, standards-assessments                                     | incidents/{id}/actions/report-arl · investigate · close, standards-assessments/{year}/score                                                                                                                       |
| **M14**    | processes, context, stakeholders, risks, nonconformities, actions, audit-programs, audits, findings, indicators, measurements, management-reviews, lessons                              | nonconformities/{id}/actions/analyze · close, actions/{id}/actions/complete · verify, indicators/{id}/series                                                                                                      |
| **M15**    | ideas, roadmap-items, ip-assets, tech-watch, competitors                                                                                                                                | ideas/{id}/actions/evaluate · approve · archive                                                                                                                                                                   |
| **M16**    | dashboards, legal-requirements, legal-evaluations                                                                                                                                       | dashboards/{key}/data, dashboards/{key}/drilldown                                                                                                                                                                 |
| **M17**    | public/pages, public/forms/{key}, public/legal/{key}, public/cookie-consent, legal-texts                                                                                                | legal-texts/{id}/actions/publish, public/unsubscribe/{token}                                                                                                                                                      |
| **M18**    | processing-activities, notices, consents, privacy-requests, privacy-incidents, processors                                                                                               | public/privacy-requests (público), privacy-requests/{id}/actions/respond, parties/{id}/personal-data/export · erase                                                                                               |
| **M19**    | audit-events, security-events, audit-exports                                                                                                                                            | audit-events/verify-chain, entities/{type}/{id}/history                                                                                                                                                           |
| **M20**    | ai/assist, ai/search, ai/prompts                                                                                                                                                        | Solo desde la fase F9                                                                                                                                                                                             |
