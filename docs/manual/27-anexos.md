# 27. Anexos

## Anexo A. Archivo CLAUDE.md del repositorio

Este archivo se ubica en la raíz del repositorio. Claude Code lo lee al inicio de cada sesión. Debe mantenerse corto, por debajo de doscientas líneas; el detalle vive en el manual, al que remite por capítulos. Cuando una lección aprendida deba volverse regla permanente, se agrega aquí.

\# ARZA ONE — instrucciones para Claude Code

Plataforma empresarial de ARZA TECH S.A.S. (Colombia). La especificación oficial es el

Manual Maestro MN-TEC-002, disponible por capítulos en \`docs/manual/\`. Ante cualquier

duda, el manual manda; si el manual no lo resuelve, pregunta antes de decidir.

\## Cómo trabajar

\- Trabaja un solo bloque a la vez (\`docs/bloques/Bnn.md\`). No adelantes bloques.

\- Antes de escribir código: lee el bloque, los capítulos que cita y el código existente,

y presenta un plan corto. Espera la aprobación del plan.

\- El dueño del producto no es desarrollador: explica en español claro qué hiciste,

cómo probarlo paso a paso y qué decisiones quedan a su cargo.

\- Al terminar: ejecuta todas las verificaciones, actualiza la documentación y escribe

el cierre en \`docs/bloques/Bnn-cierre.md\` (qué se hizo, cómo se probó, pendientes).

\- Nunca despliegues a producción ni modifiques secretos. Nunca uses datos reales.

\## Comandos

\- \`pnpm install\` — instalar dependencias

\- \`pnpm dev\` — levantar api, worker y web (requiere \`pnpm infra:up\`)

\- \`pnpm infra:up\` / \`pnpm infra:reset\` — servicios locales en Docker / reiniciar datos

\- \`pnpm lint\` · \`pnpm typecheck\` · \`pnpm test\` · \`pnpm test:int\` · \`pnpm test:e2e\`

\- \`pnpm db:migrate\` · \`pnpm db:seed\` — migraciones y datos semilla

\- \`pnpm check\` — todas las verificaciones; debe pasar antes de cada commit

\## Arquitectura (no negociable)

\- Monolito modular. Módulos en \`apps/api/src/modules/\<modulo\>\` con capas

interface → application → domain → infrastructure. Las dependencias apuntan hacia abajo.

\- Un módulo usa a otro solo por su \`index.ts\` o por eventos de dominio. Nunca leas

tablas de otro módulo.

\- Todo caso de uso que escribe: una transacción que incluye el evento de auditoría y

los eventos de la bandeja de salida.

\- Los contratos (esquemas Zod, tipos, permisos) viven en \`packages/contracts\` y los

usan api y web. No dupliques tipos.

\- El frontend nunca accede a la base de datos y nunca es la barrera de seguridad.

\## Seguridad y datos

\- Todo punto de la API declara autenticación, permiso y esquema de validación.

\- Toda tabla de negocio lleva \`tenant_id\` y política RLS. Toda funcionalidad nueva

incluye prueba de permiso denegado y de aislamiento entre empresas.

\- Dinero: \`numeric(18,2)\` y decimal.js. Fechas: UTC en la base; America/Bogota al mostrar.

\- Identificadores UUID v7. Códigos de negocio por el servicio de consecutivos.

\- Nunca registres contraseñas, códigos, tokens ni datos personales sensibles.

\- Secretos solo en variables de entorno. No escribas secretos en código ni en pruebas.

\- Consultas siempre parametrizadas. Prohibido \`any\` y desactivar reglas del analizador.

\## Estilo

\- Código, tablas, columnas y commits en inglés. Interfaz, mensajes y documentación

funcional en español de Colombia (trato de usted, fechas dd/mm/aaaa, pesos con \$).

\- Funciones cortas y de un propósito; nombres descriptivos; sin código muerto.

\- Commits con Conventional Commits: \`tipo(modulo): descripción\`.

\- No agregues dependencias sin justificar licencia permisiva y mantenimiento activo.

\- No elimines ni debilites una prueba o un control para que algo pase. Si una prueba

falla, corrige la causa o detente y explica.

\## Definición de terminado

Criterios del bloque cumplidos · \`pnpm check\` en verde · pruebas de permiso, aislamiento

y auditoría · migraciones desde cero y sobre la versión anterior · estados de pantalla

y accesibilidad · documentación y OpenAPI actualizados · cierre del bloque escrito.

\## Referencias (léelas cuando el bloque las cite; no las cargues completas sin necesidad)

\- Arquitectura: \`docs/manual/08-arquitectura-del-sistema.md\`

\- Repositorio y código: \`docs/manual/11-repositorio-y-estandares-de-codigo.md\`

\- Base de datos: \`docs/manual/12-base-de-datos.md\`

\- Backend y API: \`docs/manual/13-diseno-del-backend.md\`, \`docs/manual/14-interfaz-de-programacion-api.md\`

\- Seguridad: \`docs/manual/15-seguridad-de-la-informacion.md\`

\- Interfaz: \`docs/manual/16-diseno-de-la-interfaz-de-usuario.md\`

\- Módulos: \`docs/manual/17-especificacion-funcional-por-modulo.md\`

\- Decisiones: \`docs/adr/\` (léelas antes de proponer un cambio de arquitectura)

## Anexo B. Encargo de un bloque

Plantilla para iniciar cualquier bloque. Se reemplazan el código y el nombre; lo demás se deja igual.

Vamos a construir el bloque B01 — Monorepo y herramientas de calidad.

1\. Lee docs/bloques/B01.md, los capítulos del manual que cita y el código

relacionado que ya existe.

2\. Antes de escribir código, preséntame un plan: qué archivos vas a crear o cambiar,

qué tablas y puntos de la API, qué pruebas, y cualquier duda o decisión que

necesite mi aprobación. No avances hasta que yo apruebe el plan.

3\. Implementa el bloque en la rama feat/b01-monorepo, con commits pequeños.

4\. Escribe las pruebas junto con el código, incluidas las de permiso denegado,

aislamiento entre empresas y auditoría.

5\. Ejecuta pnpm check y corrige hasta que todo pase. No debilites ninguna prueba

ni control para lograrlo.

6\. Actualiza la documentación del módulo y escribe docs/bloques/B01-cierre.md con:

qué se construyó, cómo lo pruebo yo paso a paso en mi navegador, qué quedó

pendiente y qué decisiones tomaste.

7\. Abre el pull request y dime exactamente qué debo revisar.

Recuerda: no soy desarrollador. Explícame en español claro y sin jerga.

**Ejemplo de encargo para una corrección**

En el ambiente de pruebas, al aceptar una cotización desde el enlace del cliente

aparece el mensaje "No fue posible procesar la solicitud" (identificador de

correlación 0192f3a1-…). Pasos: 1) creé la cotización COT-2026-0007, 2) la envié,

3\) abrí el enlace en una ventana privada, 4) marqué la casilla y confirmé.

Antes de corregir: encuentra la causa y explícamela. Luego escribe una prueba que

reproduzca la falla, corrige, ejecuta pnpm check y dime cómo lo verifico.

**Ejemplo de encargo para revisar un pull request**

Revisa el pull request del bloque B10 como un revisor independiente. No modifiques

código. Compáralo contra docs/bloques/B10.md, los capítulos 13 y 15 del manual y la

lista FT-TEC-002. Entrégame: 1) incumplimientos del manual, 2) riesgos de seguridad,

3\) pruebas que faltan, 4) código que sobra o está duplicado, ordenados por gravedad.

## Anexo C. Plantilla de decisión de arquitectura (ADR)

\# ADR-NNN: Título de la decisión

\- Estado: propuesta \| aceptada \| reemplazada por ADR-XXX

\- Fecha: dd/mm/aaaa

\- Aprobó: Director General

\## Contexto

Qué problema o necesidad obliga a decidir. Restricciones.

\## Decisión

Qué se decidió, en una o dos frases claras.

\## Alternativas consideradas

Opción · ventajas · desventajas · por qué se descartó.

\## Consecuencias

Qué se vuelve más fácil, qué más difícil, qué costo o riesgo se acepta.

\## Cumplimiento

Cómo se verifica que el código respeta la decisión (prueba, regla del analizador).

## Anexo D. Plantilla de historia de usuario

Código: M05-H012 Módulo: Comercial Bloque: B23

Como Gerente Comercial

quiero enviar una cotización al cliente desde la plataforma

para que la acepte en línea y quede evidencia.

Reglas de negocio

\- Solo se envía una cotización aprobada (ficha 17.6).

\- El enlace vence con la vigencia de la cotización.

Criterios de aceptación

\- Dado una cotización aprobada, cuando la envío, entonces el cliente recibe un

correo con el enlace y la cotización pasa a "enviada".

\- Dado una cotización vencida, cuando el cliente abre el enlace, entonces ve que

venció y no puede aceptarla.

\- Dado un usuario sin permiso crm.quote.send, cuando intenta enviar, entonces la

API responde 403 y queda evento de seguridad.

Datos: crm_quotes, ntf_deliveries. Permisos: crm.quote.send.

Auditoría: quote.sent con destinatario y versión.

## Anexo E. Lista de verificación de salida a producción

| **N.º** | **Verificación**                                                                                                   | **Evidencia**                    | **Cumple** |
|---------|--------------------------------------------------------------------------------------------------------------------|----------------------------------|------------|
| 1       | Los diez recorridos críticos del numeral 21.2 pasan en el ambiente de pruebas                                      | Informe de Playwright            |            |
| 2       | Cero hallazgos de seguridad altos o críticos en análisis estático, dependencias, imágenes y análisis dinámico      | Informes                         |            |
| 3       | Revisiones externas H1 a H4 con hallazgos cerrados                                                                 | Informes de hito                 |            |
| 4       | Prueba de intrusión realizada y remediada                                                                          | Informe del tercero              |            |
| 5       | Pruebas de aislamiento entre empresas y entre clientes en verde                                                    | Resultado de CI                  |            |
| 6       | Pruebas de rendimiento dentro de las metas                                                                         | Informe de k6                    |            |
| 7       | Copia de seguridad restaurada con éxito en un servidor limpio                                                      | FT-TEC-005                       |            |
| 8       | Monitoreo y todas las alertas probadas                                                                             | FT-TEC-003                       |            |
| 9       | Servidor endurecido: puertos, accesos, actualizaciones, cifrado                                                    | Lista del numeral 10.2           |            |
| 10      | Secretos de producción generados, únicos y custodiados en el gestor de contraseñas                                 | Registro                         |            |
| 11      | Correo con SPF, DKIM y DMARC verificados                                                                           | Prueba de entrega                |            |
| 12      | Términos, política de datos, política de cookies y cláusula de firma aprobados por el asesor jurídico y publicados | Concepto; web_legal_texts        |            |
| 13      | Registro de actividades de tratamiento aprobado; contratos de transmisión con proveedores firmados                 | M18                              |            |
| 14      | Banner de cookies verificado: nada no necesario antes de aceptar                                                   | Prueba                           |            |
| 15      | Parámetros tributarios y exportación contable validados por el Contador                                            | Acta                             |            |
| 16      | Listado Maestro cargado y conciliado con RE-SGC-001                                                                | Informe de importación           |            |
| 17      | Usuarios reales creados con el rol mínimo y segundo factor activo                                                  | Informe de accesos               |            |
| 18      | Accesibilidad: sin violaciones graves; prueba manual con teclado                                                   | Informe                          |            |
| 19      | Guías de operación completas y ensayadas: despliegue, reversión, restauración, incidente                           | docs/runbooks                    |            |
| 20      | Manual de usuario publicado y capacitación realizada                                                               | RE-SST-002 o lista de asistencia |            |
| 21      | Inventario de componentes y avisos de licencias de terceros publicados                                             | SBOM                             |            |
| 22      | Datos de prueba eliminados del ambiente de producción                                                              | Verificación                     |            |
| 23      | Plan de reversión definido y responsable disponible durante la puesta en marcha                                    | Plan                             |            |
| 24      | Acta de aprobación de salida a producción firmada por el Director General                                          | Acta                             |            |

## Anexo F. Variables de entorno

| **Variable**                                                      | **Descripción**                                                           | **Secreto** |
|-------------------------------------------------------------------|---------------------------------------------------------------------------|-------------|
| **NODE_ENV · APP_ENV**                                            | Modo de ejecución y ambiente (local, staging, production)                 | No          |
| **APP_URL · PORTAL_URL · PUBLIC_URL · API_URL**                   | Direcciones de cada superficie                                            | No          |
| **DATABASE_URL**                                                  | Conexión de la aplicación a PostgreSQL (usuario sin privilegios de dueño) | Sí          |
| **DATABASE_MIGRATION_URL**                                        | Conexión del usuario que ejecuta migraciones                              | Sí          |
| **VALKEY_URL**                                                    | Conexión a colas y caché                                                  | Sí          |
| **S3_ENDPOINT · S3_REGION · S3_BUCKET**                           | Almacenamiento de archivos                                                | No          |
| **S3_ACCESS_KEY · S3_SECRET_KEY**                                 | Credenciales del almacenamiento                                           | Sí          |
| **SESSION_SECRET · CSRF_SECRET**                                  | Firmas de sesión y antifalsificación                                      | Sí          |
| **FIELD_ENCRYPTION_KEY**                                          | Llave de cifrado de campos sensibles; se rota con procedimiento           | Sí          |
| **SIGNATURE_HMAC_KEY**                                            | Llave de los enlaces de firma y de la cadena de evidencia                 | Sí          |
| **PDF_SEAL_CERT · PDF_SEAL_KEY**                                  | Certificado de sello de integridad de la empresa                          | Sí          |
| **SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASSWORD · MAIL_FROM** | Envío de correo                                                           | Parcial     |
| **GOTENBERG_URL · CLAMAV_HOST**                                   | Servicios internos                                                        | No          |
| **GLITCHTIP_DSN**                                                 | Captura de errores                                                        | Sí          |
| **BACKUP_REPOSITORY · BACKUP_PASSWORD · BACKUP_S3\_\***           | Destino y cifrado de las copias                                           | Sí          |
| **RATE_LIMIT\_\* · SESSION_IDLE_MINUTES · SESSION_MAX_HOURS**     | Parámetros de protección                                                  | No          |
| **DEFAULT_TIMEZONE · DEFAULT_LOCALE · DEFAULT_CURRENCY**          | America/Bogota · es-CO · COP                                              | No          |
| **AI_GATEWAY\_\* (fase F9)**                                      | Proveedor y límites de la pasarela de IA                                  | Sí          |

El repositorio incluye un archivo .env.example con todas las variables y valores ficticios. Los valores reales nunca se guardan en el repositorio: se registran en el gestor de contraseñas y se cargan en el servidor y en los secretos de GitHub Actions.

## Anexo G. Catálogo de permisos

Los permisos se nombran módulo.recurso.acción. Las acciones estándar son read, create, update, delete, export y las transiciones propias de cada recurso. El catálogo se mantiene en packages/contracts y se carga como dato semilla; agregar un permiso exige actualizar la matriz del numeral 15.3.

| **Módulo**     | **Permisos**                                                                                                                                                                                                                                                                                           |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **core**       | core.tenant.read · update; core.org.read · manage; core.catalog.manage; core.parameter.read · manage; core.sequence.manage                                                                                                                                                                             |
| **iam**        | iam.user.read · invite · update · lock · reset_mfa; iam.role.read · manage; iam.role.assign; iam.session.revoke; iam.delegation.manage; iam.access_review.read                                                                                                                                         |
| **party**      | party.read · create · update · merge; party.bank_account.read · manage · approve; party.due_diligence.manage · approve                                                                                                                                                                                 |
| **doc**        | doc.document.read · create · update; doc.version.submit · review · approve · publish · obsolete; doc.restricted.read; doc.change_request.create · decide; doc.form_template.manage; doc.form_record.create · approve; doc.retention.manage; doc.disposition.approve; doc.export                        |
| **wf**         | wf.definition.manage; wf.task.read_all · reassign · work; ntf.template.manage                                                                                                                                                                                                                              |
| **crm**        | crm.lead.read · create · update · convert; crm.opportunity.read · create · update · close; crm.service.manage; crm.quote.read · create · update · approve · send; crm.report.read                                                                                                                      |
| **contract**   | contract.read · create · update · approve · terminate · renew; contract.clause.manage; signature.envelope.create · send · cancel; signature.evidence.read                                                                                                                                              |
| **project**    | project.read_all · read_member · create · update · close; project.member.manage; project.item.manage; project.time.log · approve; project.deliverable.submit; project.release.manage; project.incident.manage                                                                                          |
| **service**    | service.ticket.read · create · assign · resolve · close; service.pqrsf.read · classify · respond · approve; service.survey.manage; service.kb.manage; service.compensation.approve                                                                                                                     |
| **finance**    | finance.invoice.read · request · approve · register_fiscal · void; finance.payment.manage; finance.collection.manage; finance.budget.read · manage · approve; finance.expense.manage · approve; finance.petty_cash.manage; finance.reconciliation.manage; finance.tax_parameter.manage; finance.export |
| **purchase**   | purchase.request.create · approve; purchase.order.issue · receive; purchase.supplier.evaluate; purchase.travel.request · approve; asset.read · manage · assign · retire                                                                                                                                |
| **hr**         | hr.employee.read · manage; hr.file.read; hr.salary.read; hr.vacancy.manage; hr.candidate.manage; hr.leave.request · approve; hr.overtime.authorize; hr.payroll_novelty.manage · close; hr.performance.manage; hr.training.manage; hr.disciplinary.manage; hr.offboarding.manage                        |
| **sst**        | sst.hazard.manage; sst.plan.manage; sst.incident.report · investigate · close; sst.inspection.manage; sst.medical.read · manage; sst.committee.read · manage; sst.standards.manage                                                                                                                     |
| **qms**        | qms.process.manage; qms.risk.manage; qms.nonconformity.create · manage · close; qms.action.manage · verify; qms.audit.plan · execute; qms.indicator.manage · measure; qms.review.manage; qms.legal.manage · evaluate                                                                                   |
| **innovation** | inn.idea.create · evaluate · approve; inn.roadmap.manage; inn.ip.manage; inn.watch.manage                                                                                                                                                                                                              |
| **web**        | web.page.manage; web.legal_text.manage · publish; web.submission.read                                                                                                                                                                                                                                  |
| **privacy**    | privacy.activity.manage; privacy.notice.manage; privacy.consent.read; privacy.request.manage · respond; privacy.data.export · erase; privacy.incident.manage; privacy.processor.manage                                                                                                                 |
| **audit**      | audit.event.read · export; audit.security.read; audit.chain.verify                                                                                                                                                                                                                                     |
| **ai**         | ai.assist.use; ai.prompt.manage; ai.use_case.manage; ai.request.read                                                                                                                                                                                                                                   |
| **dashboard**  | dashboard.executive.read; dashboard.process.read; dashboard.compliance.read                                                                                                                                                                                                                            |
| **portal**     | portal.project.read; portal.deliverable.decide; portal.contract.read · sign; portal.invoice.read; portal.ticket.create · read; portal.user.manage; portal.personal_data.manage                                                                                                                         |
