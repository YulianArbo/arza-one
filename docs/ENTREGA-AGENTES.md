# Entrega entre agentes — ARZA ONE

**CI de B45, 26/11/2026 (Codex).** El trabajo de integración de la ejecución `45846284790` del PR #101 falló por cobertura de ramas de la API (84,94 % frente al mínimo de 85 %). Verificaciones propagó ese fallo. El ajuste está en `apps/api/test/int/golive/initial-load.int.test.ts`, con casos de error de alta por fila y continuidad de la carga. Consulte la ejecución del commit de corrección en el PR para verificar el resultado.

**B45, 25/11/2026 (Claude Code).** Rama `feat/b45-carga-inicial-aceptacion-y-pue`. Decisiones en `docs/bloques/B45-cierre.md`; guía funcional en `docs/puesta-en-marcha/`. Puntos para quien continúe:

1. `golive` no tiene tablas: usa Núcleo (`structureSnapshot`, `addOrgUnit`, `addPosition`, `setUnitOwner`, `tenantRegistered`), Identidad (`hasFullPermission`, `loadableRoles`, `hasAccount`, `accountFindings`, `InvitationUseCase`), Terceros (`addCompany`, `hasCompanyWithNit`), Documentos (`documentFigures`) y Sitio (`legalTextsWithoutConcept`) por su `index.ts`. Las reglas de las plantillas son funciones puras en `golive/domain`.
2. `InvitationUseCase.invite` acepta `positionId` (el que llama ya validó el cargo); queda en la auditoría de `iam.user.invite`.
3. El lector de CSV de Excel vive ahora en `platform/export/csv-read.ts` (antes `doc/domain/csv.ts`).
4. Cuando se construyan M16 (B46) y M20 (B47), agregue su guion en `docs/aceptacion/` y su capítulo en `docs/manual-usuario/`.
5. Las pruebas de integración que crean terceros empresa necesitan `seedCore` (catálogo `identification_types`).
6. El gancho de lint de Git necesita `NODE_OPTIONS=--max-old-space-size=8192` con muchos archivos.

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `.codex-ci-*`, `docs/diagnosticos/`, `.prettierignore`) siguen sin commit y no se tocaron.

**CI de B44, 24/11/2026.** Consulte el PR #100 para el resultado de los trabajos 4, 5, 8, 12 y 13 después de las correcciones. El punto de entrada de PostgreSQL descarta opciones S3 en modo `posix`, también para la recuperación de WAL. La comprobación de humo resuelve redirecciones relativas y verifica el origen y la ruta esperados.

**B44, 24/11/2026 (Claude Code).** Rama `feat/b44-servidor-de-produccion-copias`. Decisiones en `docs/bloques/B44-cierre.md`, ADR-026 y guías en `docs/runbooks/`. Puntos para quien continúe:

1. Los guiones de despliegue reciben un perfil (`PROFILES` en `infra/scripts/deploy/release.ts`): `compose(target, versión, …)` pide `{ baseDir, environment }`. Producción entra por `production-main.ts` (variables `PRODUCTION_*`), nunca siembra datos ficticios y sus pruebas de humo están en `smoke-production.ts`.
2. La ventana de publicación (`release-window.ts`) recibe los festivos como archivo JSON; el flujo los calcula con `colombianHolidays` del `dist` de la API para no duplicar la ley Emiliani.
3. `/ops/status` usa la regla de acceso nueva `monitor` (`@MonitorToken()`); `access.test.ts` exige que solo exista bajo `/ops`. `createTestApp` acepta `queueFigures` para probarla sin Valkey.
4. Toda exportación nueva debe dejar `rows` o `row_count` en su auditoría: `recordAuditEvent` dispara sola la alerta de exportación masiva (`platform/audit/bulk-export.ts`).
5. El ingreso de un `ADMIN_PLATAFORMA` genera un aviso y un correo: las pruebas que cuentan los avisos o correos de un administrador deben filtrar por el tipo que vigilan (como `email-dispatch.int.test.ts`).
6. Los errores van a GlitchTip con `platform/ops/error-reporter.ts` (sin SDK). La API lo usa en `ApiExceptionFilter` (solo 5xx); el worker, en los trabajos que fallan sin reintento.
7. La tarea 13 de la CI (`infra/backup/rehearsal.sh`) solo corre en Linux; en este equipo no se puede ensayar. Las copias del ensayo van a una carpeta (`BACKUP_REPO_TYPE=posix`).
8. `pnpm check` falla en `format:check` por los archivos sueltos del propietario (`.agents/`, `docs/diagnosticos/`…); los archivos del repositorio se revisan con Prettier aparte y el resto de la cadena se corre a mano.
9. Gitleaks marca como secreto cualquier llave de prueba con aspecto real: genérela en tiempo de ejecución (`'v'.repeat(40)`).

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/`, `.prettierignore`) siguen sin commit y no se tocaron. En `docs/adr/README.md` solo se incorporó la fila de ADR-026; la de ADR-025 sigue sin commit.

**B43, 24/11/2026 (Claude Code).** Rama `feat/b43-endurecimiento-de-seguridad-y`, PR #99. Decisiones en `docs/bloques/B43-cierre.md`; controles en `docs/seguridad/asvs-nivel-2.md` y en la sección «Endurecimiento de seguridad (B43)» de `apps/api/README.md`. Puntos para quien continúe:

1. El sello vive en `apps/api/src/platform/pdf/pdf-seal.ts` y se publica en `@arza/api/platform`. `processSignatureWork` exige `pdfSeal`; en pruebas use `TEST_PDF_SEAL`, `minimalPdf` y `checkPdfSeal` de `apps/api/test/support/sealed-pdf.ts` (el `samplePdf` de Documentos no es un PDF real y no se puede sellar).
2. `P12Signer` consume el certificado al leerlo: se crea uno por documento.
3. `@signpdf/placeholder-plain` pide pdfkit 0.10 sin usarlo; `pnpm-workspace.yaml` lo declara opcional para no instalar `crypto-js` 3. Si se actualiza `@signpdf`, revise que pdfkit siga fuera de `pnpm-lock.yaml`.
4. Toda pantalla nueva de acceso o de cliente con enlace personal va en `PRIVATE_PAGES` (`apps/web/src/lib/security/security-headers.ts`); una prueba lo exige.
5. ZAP y k6 usan `.github/actions/scan-stack` (cuenta de análisis real con segundo factor). Las rutas que cerrarían la sesión se quitan en `infra/scripts/security/scan-auth.ts` (`SESSION_ROUTES`).
6. `knip.json` declara `infra/k6/carga.js` como punto de entrada; los módulos `k6/*` los trae k6, no npm.
7. Gotenberg 8 no sella PDF; Gotenberg 9 sí.

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/`, `.prettierignore`) siguen sin commit y no se tocaron.

**B42, 23/11/2026 (Claude Code).** Rama `feat/b42-privacidad-completa`. Decisiones en `docs/bloques/B42-cierre.md` y reglas en `docs/manual/datos/prv.md` y en la sección «Privacidad completa (B42)» de `apps/api/README.md`. Puntos para quien continúe:

1. Privacidad se publica como `@arza/api/privacy` para el worker: `prv.request-work` (cada 30 s: correos al titular y PDF de la entrega) y `prv.daily-work` (7:00: avisos de plazo, desistimiento, cookies de más de 3 años). El worker también llama a `anonymizeExpiredSubmissions` del sitio (formularios de más de 2 años). Compile la API antes de analizar el worker.
2. Un módulo nuevo que guarde datos personales registra una `PersonalDataSource` en `PersonalDataRegistry` desde el constructor de su módulo de Nest (vea crm, service, web, hr, fin y contract). Privacidad nunca lee tablas ajenas: Terceros responde por `PARTY_DIRECTORY` (`holder`, `settleErasure`) e Identidad por `accountsOfParty` y `anonymizePortalAccount`.
3. El motor de tareas acepta `dueAt` en `startWorkflow` y `rescheduleWorkflow()` mueve la fecha (con `null`, la tarea no vence mientras el plazo está suspendido).
4. Todo envío comercial futuro debe consultar `mayContactCommercially` del índice del sitio (baja + autorización `MARKETING` vigente).
5. Servicio al cliente crea la solicitud en Privacidad al clasificar una PQRSF con `privacy_kind` (`pqrsf-transfer.ts`), en la misma transacción.
6. Tipos de aviso nuevos (`prv_*`) exigen ampliar las listas de la base (`20261126010000_ntf_privacy_notices`); los próximos deben hacer lo mismo.
7. Rutas de pruebas en `apps/api/test/support/api-paths-privacy.ts`; recorrido de auditoría en `apps/api/test/int/audit/support/privacy-request-route-calls.ts` (23 rutas). Las rutas públicas nuevas están en `apps/api/test/access.test.ts`.
8. Los DTO de incidentes llevan el prefijo «Privacy»: sin él chocaban en OpenAPI con los de Proyectos.

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/`) siguen sin commit y no se tocaron.

**B41, 23/11/2026 (Claude Code).** Rama `feat/b41-sitio-publico-formularios-text`. Decisiones en `docs/bloques/B41-cierre.md` y reglas en `docs/manual/datos/web.md`. Puntos para quien continúe:

1. El módulo vive en `apps/api/src/modules/web` y se publica como `@arza/api/web` para el worker (`web.site-work`, cada 30 s). Compile la API antes de analizar el worker.
2. Identidad no lee tablas `web_`: pregunta por los términos pendientes con el puerto `PLATFORM_TERMS_GATE` (`iam/application/platform-terms-gate.ts`), que el sitio presta con un módulo global. La sesión guarda `terms_pending`; `AccessGuard` responde 403 `TERMS_PENDING` en rutas con permiso o «según el registro».
3. Todo envío comercial futuro (por ejemplo, el boletín) debe consultar `isUnsubscribed` de `apps/api/src/modules/web/index.ts`.
4. `prv_cookie_consents` ya existe (B41, decisión 4): B42 solo agrega su consulta, informes y retención.
5. Las pruebas de navegador traen por defecto la elección de cookies hecha (fixture `cookieChoice` en `e2e/support/fixtures.ts`); las del aviso la borran con `askCookies`. La simulación base de la API responde las rutas públicas del sitio.
6. Rutas de pruebas en `apps/api/test/support/api-paths-site.ts`; recorrido de auditoría en `apps/api/test/int/audit/support/web-route-calls.ts` (12 rutas), **al final**: publica los términos de la plataforma en la otra empresa del escenario, y desde ese momento todo ingreso nuevo de esa empresa espera la aceptación.
7. La lista de rutas públicas permitidas está en `apps/api/test/access.test.ts`: cada ruta pública nueva se agrega allí, una por una.
8. En Windows, `open(..., 'w')` de Python escribe fin de línea CRLF: use `newline=''` o corra Prettier antes del commit.

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/`) siguen sin commit y no se tocaron.

**B40, 22/11/2026 (Claude Code).** Rama `feat/b40-innovacion-y-propiedad-intelec`. Decisiones en `docs/bloques/B40-cierre.md` y reglas en `docs/manual/datos/inn.md`. Puntos para quien continúe:

1. El módulo vive en `apps/api/src/modules/inn` y se publica como `@arza/api/inn` para el worker (`inn.daily-work`, 6:45). Compile la API antes de analizar el worker.
2. Innovación no lee tablas ajenas: usa `signedEmploymentContractOfUser` (Talento humano, sin salario), `visibleContractByCode` (Contratos) y `recordSystemForm`/`systemFormPdf` (Documentos, FT-INN-003 con entidad `inn_idea`).
3. La tarea de renovar o de radicar es un solo flujo, `inn.ip`, que se publica solo la primera vez que hace falta (y en la semilla).
4. Los nombres de contratos de Innovación llevan el prefijo «Inn» o el nombre del dominio (`IpAsset`, `Idea`); los DTO de OpenAPI, «Inn».
5. Rutas de pruebas en `apps/api/test/support/api-paths-inn.ts`; recorrido de auditoría en `apps/api/test/int/audit/support/inn-route-calls.ts` (20 rutas).
6. El catálogo de permisos tiene 216 entradas (`roles-admin.int.test.ts`) y el menú 21 módulos (`navigation.test.ts`).

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`, `docs/diagnosticos/`) siguen sin commit y no se tocaron.

**B39, 22/11/2026 (Claude Code).** Rama `feat/b39-calidad-auditorias-indicadores`. Decisiones en `docs/bloques/B39-cierre.md` y reglas en `docs/manual/datos/qms.md`. Puntos para quien continúe:

1. Servicio ya depende de Calidad (B38). Para no crear un ciclo, Calidad **no importa** a Servicio: declara `SERVICE_FIGURES` y `ServiceFiguresReader` en `qms/application/service-figures.ts`; Servicio los entrega con `ServiceFiguresModule` (global) y el worker pasa `serviceQualityFigures` a `runQmsIndicatorWork`.
2. Los nombres de eventos de la bandeja de salida solo admiten letras por segmento (`qms.review.submitted`, no `qms.management_review.submitted`); los de auditoría sí admiten guion bajo.
3. Los errores de validación responden 422 y el cuerpo de error es `{ error: { code } }`.
4. El gancho de lint de Git se queda sin memoria con muchos archivos: haga el commit con `NODE_OPTIONS=--max-old-space-size=4096`.
5. `renderQualityPdfs` recorre todas las empresas: en pruebas paralelas compruebe el PDF amarrado, no el conteo de la pasada.
6. Rutas de pruebas en `test/support/api-paths-qms.ts`; recorrido de auditoría en `qms-audit-route-calls.ts` y `qms-review-route-calls.ts`.

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`) siguen sin commit y no se tocaron.

**B38, 21/11/2026 (Claude Code).** Rama `feat/b38-calidad-procesos-riesgos-no-co`. Decisiones en `docs/bloques/B38-cierre.md` y reglas en `docs/manual/datos/qms.md`. Puntos para quien continúe:

1. El módulo vive en `apps/api/src/modules/qms` y se publica como `@arza/api/qms` para el worker (`qms.daily-work`, 6:15). Compile la API antes de analizar el worker.
2. Servicio abre la no conformidad con `openNonconformityFromPqrsf` y SST le da el incidente con `incidentRefForQuality`. Calidad no lee tablas de otros módulos.
3. Los nombres de riesgos llevan el prefijo «Qms» (`QMS_RISK_LEVELS`, `qmsRiskSchema`) porque chocaban con los de Proyectos y Terceros.
4. `qms_processes` caracteriza una unidad `process` del núcleo (`org_unit_id`). No cree otra lista de procesos.
5. Las fechas que salen de `created_at` se muestran con `bogotaToday`, no con `toCalendarDate`: después de las 7 p. m. la fecha UTC ya es la del día siguiente.
6. En formularios con campos generados, no repita claves: la categoría «method» de las 6M chocaba con el selector `method` (ahora `cause_<categoría>`).
7. Rutas de pruebas en `test/support/api-paths-qms.ts`; las del recorrido de auditoría en `test/int/audit/support/qms-route-calls.ts` (21 rutas).
8. El equipo local tiene poca memoria: corra `turbo run test --concurrency=1` y la web con `--maxWorkers=2`; las integraciones largas pierden conexiones y hay que repetir las que fallan.

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`) siguen sin commit y no se tocaron.

**B37, 20/11/2026 (Claude Code).** Rama `feat/b37-seguridad-y-salud-en-el-trabaj`. Decisiones en `docs/bloques/B37-cierre.md` y reglas en `docs/manual/datos/sst.md`. Puntos para quien continúe:

1. El módulo vive en `apps/api/src/modules/sst` y se publica como `@arza/api/sst` para el worker (`sst.daily-work`, 6:00). Compile la API antes de analizar el worker.
2. SST nunca lee tablas `hr_`. Usa `activeEmployeesForSst`, `employeeIdOfUser`, `employeeNamesForSst` y `linkOccupationalExam` de `apps/api/src/modules/hr/index.ts`.
3. Lo de Convivencia usa el permiso `sst.incident.report` más la regla de integrante vigente (403 `SST_NOT_COMMITTEE_MEMBER`). No lo reemplace por un permiso de rol.
4. Los DTO de SST llevan el prefijo «Sst». Sin él, sus nombres chocaron en OpenAPI con los de Proyectos (`IncidentListResponse`).
5. Los catálogos de SST están en `core/application/sst-seed-catalogs.ts`, porque `core-seed-data.ts` está en el límite de líneas.
6. Las rutas de SST de las pruebas están en `test/support/api-paths-sst.ts` y se suman con `PEOPLE_PATHS`. Las del recorrido de auditoría están en `test/int/audit/support/sst-*-route-calls.ts`.
7. El navegador de Playwright local (1243) no corresponde a la versión 1.65. Para correr `apps/web/e2e/sst.spec.ts` hace falta `pnpm --filter @arza/web e2e:install`, que es una descarga: pídale autorización al propietario.

Los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR 024/025, `.agents/`, `.claude/`) siguen sin commit y no se tocaron.

**B36, 19/11/2026 (Claude Code).** Rama `feat/b36-talento-humano-novedades-desem` con commits por parte (contratos, migración, núcleo, identidad, API de Talento humano, avisos y trabajo diario, web, pruebas, documentación). Decisiones en `docs/bloques/B36-cierre.md`. Puntos para quien continúe: (1) correr `pnpm --filter @arza/api test:int -- test/int/hr test/int/audit` y corregir lo que falle, sin debilitar pruebas; (2) el _worker_ importa `@arza/api/hr` desde la compilación de la API: compile la API (`pnpm --filter @arza/api build`) antes de analizar o probar el worker; (3) no ejecute `tsc -p .` en `packages/contracts` sin `--noEmit`: escribe archivos `.js` junto al código; (4) los cambios sueltos del propietario (respaldos, `.csv`, `CLAUDE.md`, ADR) siguen sin commit y no se tocaron; los 31 bocetos de B22B se movieron a una copia temporal para cambiar de rama y Git los repuso idénticos.

**Retención B35.** El worker registra `hr.retention` y `expireRecruitmentData` aplica el plazo en el contexto de cada empresa. La prueba dirigida y las pruebas del enrutador pasaron. Se conserva la autorización inmutable de selección. Los adjuntos y las identidades reutilizadas quedan fuera de la ejecución automática hasta definir o verificar su disposición. El recorrido de Playwright está en `apps/web/e2e/hr.spec.ts`. Turbopack falló al crear el proceso de CSS y se inició una compilación con Webpack para poder ejecutar la prueba.

**Expediente y web B35.** Las rutas de expediente e inducción usan `If-Match`, validan permisos y registran auditoría. La web está en `/app/talento-y-sst` y usa las rutas versionadas, el texto vigente del aviso de selección y los PDF disponibles de Archivos. Pasaron cuatro pruebas de integración dirigidas a expediente y auditoría y once pruebas web dirigidas. Continúe con la retención, las pruebas del recorrido de navegador y la matriz de aceptación antes de cerrar.

**Vinculación B35.** `Hiring` prepara el contrato, inicia la firma y permite vincular al colaborador con el PDF sellado. Identidad crea la cuenta dentro de la transacción. La API ofrece ficha, listado, descarga, firma de Dirección y anulación. El recorrido dirigido de firma y activación pasó. Quedan el mantenimiento del expediente, la atención de tareas, la retención automática y la interfaz web. El primer intento de auditoría de firma falló porque el dato ficticio omitía método y texto de aceptación. Se corrigió el dato de prueba.

**Registro y evaluación B35.** La API incorpora `POST` y `GET /v1/hr/candidates` y `POST /v1/hr/candidates/{id}/evaluations`. Terceros registra el papel de candidato y Privacidad exige el aviso vigente de selección con `RECRUITMENT`. La prueba dirigida pasó con la evaluación en la etapa correspondiente y la consulta por vacante. Pendientes principales: vinculación, expediente, retención automática e interfaz web. La nota opcional de avance aún no se guarda.

**Cierre de vacantes y etapas B35.** Las rutas de cierre, avance y descarte están registradas en el recorrido de auditoría. Pasaron las pruebas dirigidas. La acción de descarte guarda la fecha de retención. La nota opcional de avance aún requiere persistencia. Faltan registro y consulta de candidatos, evaluaciones, procesamiento de retención, vinculación, expediente e interfaz web.

**Vacantes B35.** `GET` y `POST /v1/hr/vacancies` usan `hr.vacancy.manage`. El alta genera un consecutivo, registra auditoría y emite `hr.vacancy.created` en la misma transacción. Pasaron las dos pruebas dirigidas de `test/int/hr/vacancies.int.test.ts`. El POST quedó registrado en el recorrido global de auditoría, pendiente de ejecutar. Continúe con el cierre de vacantes y la selección.

**B35.** En `feat/b35-talento-humano-colaboradores-s`, Documentos expone `attachablePdfForSignature` y Contratos expone `sendEmploymentSignature` y `signEmploymentAsCompany`. Las pruebas dirigidas de archivos y firma pasaron sobre PostgreSQL desechable con Docker Desktop, incluida la firma de Dirección y el sellado. Falta conectar las operaciones desde Talento Humano, consolidar la vinculación y terminar los demás recorridos del bloque. `docs/bloques/B35.md` registra las decisiones aprobadas. El árbol contiene cambios preexistentes de otros trabajos y respaldos locales. Los cambios de B35 siguen locales y el bloque permanece abierto.

**Mantenimiento de dependencias.** El PR #43 se fusionó en main con ff715d2 tras aprobar GitHub Actions 43674124988. El lockfile conserva las versiones compatibles de OpenAPI y alinea Playwright con el peer de axe. GitHub confirmó que no quedan PR abiertos.

**CI B34.** El PR #51 se fusionó en main con ab686eb tras aprobar GitHub Actions 43668218286. Las 10 pruebas locales de activos pasaron. Se verificaron reintentos, control de versiones, mantenimiento y devoluciones. Queda abierto el PR #43. Sigue pendiente validar administrativamente RE-ADM-003 y CT-ADM-001.

**CI B33.** El PR #50 se fusionó en main con df5a826 tras aprobar GitHub Actions 43663505490. Se verificaron los dos nuevos permisos y se cubrieron los reintentos de solicitudes, recepciones y viajes, las fechas inválidas y el control de versiones. Quedan abiertos #51 y #43.

**CI B32.** El PR #49 se fusionó en `main` con `9eccfc3`. GitHub Actions aprobó el commit `1678aec` en `43658220294` y `43658201350`, con 1.333 pruebas de integración de API aprobadas y 85,09 % de cobertura de ramas (mínimo 85 %). Se añadieron casos de presupuesto en borrador, referencias históricas, ejecución presupuestal y huella de exportación. Quedan abiertos #50, #51 y #43. El #50 apunta a main y se relanzó su CI en 43659193528.

**CI B32.** Se sincronizó la PR #49 con `main` sin conflictos, se publicó `589a306` y se cambió la base a `main`. En `43639047621` el único fallo de integración reportado fue el conteo del catálogo IAM: espera 204 y B32 agrega tres permisos, para un total de 207. Unitarias, navegador, migraciones y ensayo de despliegue pasaron.

**CI B31, 14/11/2026.** La PR #48 pasó CI completo en `43637626175` sobre `020fda6`, con 1.298 pruebas de integración de API y 85,02 % de cobertura de ramas. Se fusionó en `main` mediante `8a58e44`. La PR #49 sigue abierta con B31 como base.

**CI B31.** La PR #48 se sincronizó con `main`, cambió su base a `main` y publicó `e3e9226`. CI `43630047286` pasó unitarias, migraciones y despliegue, pero falló integración por cobertura de ramas (84,36 % frente a 85 %) y tres casos de navegador que esperan «Disponible pronto» en Facturas. #48 sigue abierta.

**CI B30, 14/11/2026.** En la PR #47, el commit `cf4079a` pasó integración y Verificaciones en `43628298298`. B30 queda pendiente de revisión externa antes del merge.

**CI B30.** Se sincronizó #47 con `main` sin conflictos y se publicó `6366a6c`. En CI `43611593863` fallaron los trabajos 4 y 5 por cobertura y el resumen Verificaciones. Migraciones, navegador y ensayo de despliegue pasaron. B30 requiere revisión externa antes de fusionarse.

**CI B29.** GitHub Actions `43610177037` aprobó integración y Verificaciones en `10e6195`. La PR #46 se fusionó en `main` con `dafc989`. La PR #47 sigue abierta con la rama B29 como base. También quedan abiertas #43 y #48–#51.

**CI B29.** La PR #46 apunta a `main`. Se corrigió la preparación del festivo de PQRSF y se ampliaron las pruebas de encuestas y artículos. La ejecución `43607215256` quedó en 84,96 % de cobertura de ramas. Se publicó `bc70f83` con otro caso y se inició `43608015204`. La PR permanece abierta.

**CI B28, 14/11/2026.** La PR #45 pasó CI completo en `43598806698` y `43598800706`, con 85,02 % de cobertura de ramas. Se integró en `main` mediante `5c2ac5f`. La PR #46 sigue abierta y GitHub reporta conflictos con su base actual. Su registro de integración muestra una colisión con el festivo ya sembrado.

**CI B28, 14/11/2026.** Se publicó `567dd52` para aislar por empresa los workers de los fixtures de firma y actas. En `43593777520` pasaron las unitarias, las migraciones y las 1.180 pruebas de integración de API. El trabajo 5 quedó en rojo por cobertura de ramas de 84,55 % frente al 85 % exigido. Sigue pendiente ampliar cobertura de B28.

**CI B28, 14/11/2026.** Se publicó `be954bf` en #45, con la cobertura de las capas de Servicio en integración y el catálogo esperado de 203 permisos. Pasaron los ganchos de Git. Se relanzó CI en `43593360480`. El reintento del commit anterior confirmó una colisión intermitente en `sig_envelopes_open_source_key` durante la prueba de actas. La causa y la cobertura de integración siguen pendientes de validación.

**CI B28.** Tras integrar #44 en `main`, se sincronizó la rama de #45 con `main` sin conflictos y se publicó `e3f25e6` desde un checkout aislado. CI manual `43554138519` valida ese commit. La base de la PR sigue siendo la rama anterior de B27.

**CI B27.** En la ejecución `43552897638` del commit `8b9cabd` pasaron el trabajo 5 y el resumen Verificaciones. La PR #44 sigue abierta. Las PR #43 y #45–#51 quedan pendientes de corrección y validación.

**CI B27.** En `25e030b` pasaron 1.139 pruebas de API y la cobertura de ramas subió a 84,64 % frente al 85 % exigido. Se publicó `74b95b5` con pruebas de retiro de horas y actualización de riesgos. Pasaron los ganchos locales de formato, lint, secretos y commitlint. La ejecución `43549365654` valida los casos nuevos.

**CI B27.** En #44, `aeedb31` pasó la verificación 7 y las 1.136 pruebas de API, pero quedó en 84,15 % de cobertura de ramas (mínimo 85 %). Se publicó `25e030b` con casos adicionales de entregables, horas e incidentes. Pasaron las 16 pruebas focalizadas antes de dividir un caso por el límite de líneas. El commit final pasó formato, lint, secretos y commitlint. Se inició CI `43548346750`. Las PR #43 y #45–#51 siguen pendientes.

**CI B27, 13/11/2026.** Se publicó `aeedb31` en la PR #44. Se declaró en Prisma el índice existente sobre `sig_envelopes(tenant_id, source_id)` y se separó la relajación de nulabilidad de las adiciones de columnas en la migración B27. Pasaron las cinco pruebas de `migrations.int.test.ts` en PostgreSQL desechable y `node infra/scripts/ci/check-migrations.ts origin/main`. Los trabajos 5 y 7 se relanzaron en `43545053943`. La suite completa y el ensayo de actualización quedan pendientes de esa ejecución.

**CI B27, 13/11/2026.** Con autorización del propietario, se integró `main` en la rama de la PR #44 en un checkout aislado y se publicó `5727693`. Se inició la ejecución manual `43543718544` sobre ese commit. La validación de migraciones queda pendiente del resultado. Los cambios preexistentes de B35 quedaron intactos.

**Actualización, 13/11/2026.** Se publicó la corrección de la prueba de reasignación en la PR #39, commit `3f11fdb`. La ejecución `43542491143` inició en GitHub Actions. El commit incluye solo la prueba y se creó en un checkout aislado. El cambio preparado en `infra-fix` quedó intacto.

**CI, 13/11/2026.** El propietario aprobó corregir la prueba de reasignación de #39. Se modificó `apps/api/test/int/wf/tasks.int.test.ts` en el checkout de B35, con cambios preexistentes del propietario. El archivo coincidía con la versión de #39 antes de editarlo. Aplicar el diff en `fix/infra-espera-base-de-datos` cuando se autoricen el commit y el push. Los reintentos remotos se iniciaron sobre los commits originales.

Este documento es el registro operativo para pasar el trabajo entre Claude Code, Codex CLI y OpenCode. Los agentes se utilizan **uno a la vez** sobre el mismo repositorio local.

## 1. Instrucciones para el agente que recibe

Antes de actuar:

1. Lea `AGENTS.md` y `CLAUDE.md` (cuando trabaje con Claude Code).
2. Lea `docs/ESTADO-PROYECTO.md`.
3. Ejecute `git status --short --branch` y revise los cambios locales sin sobrescribirlos.
4. Lea el bloque activo confirmado por el propietario, su cierre, el Manual Maestro aplicable y las ADR pertinentes.
5. No continúe una tarea si no está claro qué agente la dejó, qué quedó sin terminar o qué autorizó el propietario. Pregunte antes de modificar.

## 2. Condiciones de traspaso

El agente que entrega debe registrar:

- Agente que entrega y agente sugerido para recibir.
- Fecha y bloque/tarea.
- Objetivo aprobado por el propietario.
- Trabajo completado y trabajo no completado.
- Archivos creados/modificados/eliminados.
- Cambios preexistentes del propietario que permanecen sin commit.
- Comandos de prueba/verificación ejecutados y resultados reales.
- Errores, riesgos, decisiones pendientes y siguiente paso seguro.
- Estado de Git (rama y resumen), sin incluir secretos.

No declare completada una tarea si quedan verificaciones obligatorias pendientes.

## 3. Situación inicial conocida — 07/11/2026

- Proyecto: ARZA ONE.
- Rama observada: `feat/b30-portal-del-cliente`.
- B30 está implementado y en revisión según su cierre; todavía no se considera integrado a `main`.
- B31 está documentado, pero el propietario no ha confirmado que esté iniciado.
- El usuario está preparando el uso alternado de Claude Code, Codex CLI y OpenCode.
- OmniRoute queda fuera de este flujo.
- No se ha autorizado cambiar de rama, crear commits, hacer push/merge ni desplegar.

### Cambios locales preexistentes que deben protegerse

En la última revisión se observaron modificaciones en:

- `.prettierignore`
- `docs/adr/024-integracion-continua-sin-repeticiones.md`
- `docs/adr/README.md`

Y elementos sin seguimiento:

- `.agents/`
- `.claude/`
- `docs/adr/025-runner-propio-en-wsl2.md`
- `skills-lock.json`

Este listado es histórico y debe compararse con `git status` actual. No descartar ni incluir automáticamente estos cambios en un commit.

## 4. Hallazgo pendiente de revisión

Se observó una discrepancia entre el alcance del runner descrito en ADR-025 y el workflow/runbook: el workflow y `integracion-continua.md` describen tareas 1 a 5 en runner propio bajo condiciones restringidas; ADR-025 menciona tareas 0 a 9 y «Verificaciones». No cambiar estos documentos ni el workflow sin revisión y aprobación.

## 5. Plantilla para el siguiente traspaso

Copie esta sección al final del documento para cada entrega nueva:

### Entrega — [AAAA-MM-DD]

- **Agente que entrega:**
- **Agente que recibe:**
- **Bloque/tarea:**
- **Autorización del propietario:**
- **Objetivo:**
- **Completado:**
- **Pendiente:**
- **Archivos modificados:**
- **Cambios preexistentes preservados:**
- **Verificaciones ejecutadas y resultado:**
- **Riesgos / decisiones por resolver:**
- **Rama y estado de Git:**
- **Siguiente paso seguro:**

---

## 6. Primera entrada

### Entrega — 07/11/2026

- **Agente que entrega:** preparación de continuidad.
- **Agente que recibe:** Claude Code / Codex CLI / OpenCode (a elección del propietario).
- **Bloque/tarea:** preparación de instrucciones compartidas.
- **Autorización del propietario:** autorización para crear los documentos de continuidad; no incluye commits, cambios de rama, despliegues ni modificaciones del código de producto.
- **Objetivo:** disponer de reglas comunes y un registro de estado/handoff para alternar agentes secuencialmente.
- **Completado:** revisión del `CLAUDE.md`, estado conocido del repositorio, ADR-025, runbook de CI y selección de runner en el workflow.
- **Pendiente:** comprobar la creación de estos documentos; verificar después que cada CLI los carga correctamente; completar/actualizar el estado con el `git status` vigente y la decisión del propietario sobre el siguiente bloque.
- **Archivos previstos en esta preparación:** `AGENTS.md`, `CLAUDE.md` (solo añadir importación de `AGENTS.md` conservando el contenido existente), `docs/ESTADO-PROYECTO.md`, `docs/ENTREGA-AGENTES.md`.
- **Verificaciones:** no se ejecutaron pruebas de aplicación ni se modificó el código de producto.
- **Siguiente paso seguro:** revisar el resultado del script y luego abrir sesiones nuevas de los agentes para validar lectura de instrucciones, sin pedirles que modifiquen código.

### Entrega — 07/11/2026 — Validación de agentes

- **Agente que entrega:** preparación de continuidad.
- **Agente que recibe:** Codex CLI / OpenCode / Claude Code (según disponibilidad y decisión del propietario).
- **Bloque/tarea:** validación de lectura de instrucciones compartidas.
- **Autorización del propietario:** autorización para validar la lectura y actualizar los documentos de continuidad. No incluye modificaciones de código, commits, cambios de rama, migraciones ni despliegues.
- **Objetivo:** comprobar que los agentes reconocen las reglas comunes y el estado documentado del proyecto.
- **Completado:**
  - Codex CLI 0.163.0 encontró y leyó `AGENTS.md`, `docs/ESTADO-PROYECTO.md` y `docs/ENTREGA-AGENTES.md`.
  - OpenCode 1.19.5 encontró y leyó los mismos documentos mediante una sesión con configuración temporal restrictiva y agente `plan`.
  - Ambos comprendieron las reglas de autorización, protección de cambios preexistentes y restricciones Git.
  - Ambos identificaron B30 como implementado y en revisión, todavía sin integrar a `main`, y B31 como documentado, sin inicio confirmado.
  - Ambos reconocieron que no tenían autorización para modificar archivos, ejecutar migraciones, crear commits ni desplegar.
- **Pendiente:**
  - Validar Claude Code cuando se restablezca su límite semanal, informado para el 11/11/2026 a las 16:00 (America/Bogota).
  - Comprobar el estado actual de Git antes de iniciar cualquier tarea de desarrollo.
  - Confirmar con el propietario el siguiente bloque de trabajo.
- **Archivos modificados:** `docs/ESTADO-PROYECTO.md` y `docs/ENTREGA-AGENTES.md` (registro de continuidad).
- **Cambios preexistentes preservados:** no se descartaron ni modificaron deliberadamente cambios de código o archivos preexistentes.
- **Verificaciones ejecutadas y resultado:** pruebas de lectura de instrucciones en Codex y OpenCode satisfactorias. No se ejecutaron pruebas de aplicación, migraciones ni operaciones Git.
- **Riesgos / decisiones por resolver:** discrepancia documental de B30 y discrepancia sobre el alcance del runner propio descritas en el estado del proyecto. No corregir sin revisión y autorización.
- **Rama y estado de Git:** no verificados en esta entrega. La última información disponible es histórica y no debe asumirse vigente.
- **Siguiente paso seguro:** finalizar OpenCode y retirar la variable temporal `OPENCODE_CONFIG_CONTENT`; posteriormente validar Claude Code y confirmar el bloque que se trabajará.

### Entrega — 08/11/2026 — Inicio de B31

- **Agente que entrega:** Codex.
- **Agente que recibe:** Codex o el agente que el propietario elija.
- **Bloque/tarea:** B31 — Facturación, cartera y recaudo.
- **Autorización del propietario:** confirmó iniciar B31, aprobó el plan y excluyó las notas débito. Autorizó usar la rama de B31.
- **Objetivo:** construir B31; las notas crédito permanecen incluidas y las notas débito quedan fuera.
- **Completado:** rama local `feat/b31-facturacion-cartera-y-recaudo` creada desde el HEAD `3d3c14d` que se observó en `feat/b30-portal-del-cliente`; `docs/bloques/B31.md` aclara nota crédito y exclusión de nota débito.
- **Pendiente:** el repositorio no contiene los procedimientos/registros PR-FIN/RE-FIN citados por la ficha 17.11. Se solicitó al propietario que los comparta o confirme avanzar con facturas, notas crédito y recaudos mientras quedan pendientes los tramos de antigüedad, deterioro y reglas detalladas de cobro. También debe precisarse el desglose tributario del valor facturable de un hito antes de asumir una base.
- **Archivos modificados por Codex:** `docs/bloques/B31.md`, `docs/ESTADO-PROYECTO.md`, `docs/ENTREGA-AGENTES.md`.
- **Cambios preexistentes preservados:** `.prettierignore`, `CLAUDE.md`, `apps/web/src/features/access/login-form.tsx`, `apps/web/src/features/administration/invite-user-dialog.tsx`, `docs/adr/024-integracion-continua-sin-repeticiones.md`, `docs/adr/README.md`, y los elementos sin seguimiento ya listados en `git status` al iniciar. No se leyeron ni modificaron respaldos o archivos de recuperación.
- **Verificaciones ejecutadas y resultado:** lectura de instrucciones/documentación, `git status --short --branch`, diff de `docs/bloques/B31.md` y búsqueda de referencias SGC; no se ejecutaron pruebas, migraciones ni verificaciones de aplicación.
- **Riesgos / decisiones por resolver:** no definir por suposición edades de cartera, tasas/método de deterioro, calendario de feriados ni base tributaria. La Ley 2300 establece ventanas de contacto, pero la política del proceso debe seguir los documentos aprobados.
- **Rama y estado de Git:** `feat/b31-facturacion-cartera-y-recaudo`; cambios locales sin commit. No hacer commit ni abrir PR sin autorización.
- **Siguiente paso seguro:** recibir las referencias o confirmación del propietario; luego implementar las partes con reglas definidas, preservando todos los cambios locales preexistentes.

### Entrega — 08/11/2026 — Avance funcional de B31

- **Agente que entrega:** Codex.
- **Bloque/tarea:** B31, con alcance confirmado por el propietario: facturas, notas crédito, recaudos y consulta de facturas en el portal.
- **Decisiones del propietario:** notas débito fuera de alcance; cartera por edades, deterioro y programación de cobros pendientes hasta definir reglas; registrar subtotal, impuestos, retenciones y total del documento fiscal emitido, sin cálculo automático.
- **Completado en esta sesión:** modelos/migración para facturas, líneas, notas crédito y pagos; operaciones API con permisos, auditoría, outbox, claves de idempotencia y control de versión; registro de valores fiscales externos; pantalla de finanzas para solicitar/aprobar facturas y registrar documento, notas crédito y recaudos; consulta y descarga de factura fiscal desde el portal limitada a la empresa vinculada.
- **Verificaciones:** las comprobaciones de tipos de contratos, API y web finalizaron con código 0. Pasaron `packages/contracts` `src/finance/invoices.test.ts` (4/4), `apps/web` `src/features/finance/finance-screens.test.tsx` (3/3) y `apps/web` `src/features/portal/portal-screens.test.tsx` (12/12). `apps/api/test/int/fin/invoices.int.test.ts` pasó (1/1) con `vitest.int.config.ts --coverage.enabled=false`. El global setup aplicó todas las migraciones desde cero en PostgreSQL desechable de Testcontainers. `git diff --check` pasó. Se formatearon los 21 archivos avisados por Prettier y `format:check` pasó. `build:types` pasó con 5/5 paquetes. ESLint falló con 50 errores: 49 en archivos creados/modificados para B31 y uno en el cambio preexistente de `apps/web/src/features/access/login-form.tsx`. El comando no continuó a typecheck, límites, unused, suites completas, build, E2E ni secretos.
- **Pendiente:** corregir los errores ESLint de B31, revisar con el propietario el único error del cambio preexistente en `login-form.tsx`, y volver a ejecutar `pnpm check`; completar documentación funcional/cierre B31. El portal muestra las notas crédito y permite descargar sus soportes bajo la misma restricción de empresa. Antigüedad, deterioro y cobros programados siguen diferidos.
- **Rama y Git:** `feat/b31-facturacion-cartera-y-recaudo`; cambios locales sin commit. No hacer `add`, commit, push, merge ni PR sin autorización.
- **Cambios previos:** se conservaron modificaciones no relacionadas que ya aparecían en `git status` al iniciar, incluidas configuración, login/invitaciones, ADR-024/025 y archivos de respaldo/recuperación sin abrir.

### Entrega — 08/11/2026 — Validación autorizada de B31

- **Agente que entrega:** Codex.
- **Autorización:** el propietario aprobó pruebas funcionales y migración en entorno de pruebas.
- **Completado:** añadida prueba de integración de facturación que cubre solicitud, aprobación, valores fiscales externos, nota crédito, recaudo, auditoría, permisos, aislamiento entre tenants y visibilidad/descarga en el portal; añadida comprobación de pantalla del portal con nota crédito; actualizada expectativa de la portada de Finanzas.
- **Pasaron:** contratos `invoices.test.ts` (4/4), finanzas web `finance-screens.test.tsx` (3/3), portal web `portal-screens.test.tsx` (12/12), chequeo de tipos API y web, y `git diff --check`.
- **Resultado de la prueba:** el primer recorrido encontró un hito de prueba incompleto; el segundo detectó un nombre de evento incompatible con la restricción de outbox. Ambos defectos fueron corregidos. El recorrido final pasó (1/1): solicitud, aprobación, registro fiscal externo, nota crédito, recaudo, auditoría, permisos, aislamiento entre tenants y consulta/descargas en el portal.
- **Migración:** el global setup aplicó todas las migraciones desde cero a una base PostgreSQL desechable antes de la prueba; finalizó sin errores y los contenedores se cerraron al terminar. No se tocó ninguna base persistente.
- **Pendiente:** `pnpm check` con 12.9.1 pasó formato y tipos de paquetes, pero quedó detenido por 50 errores ESLint (49 B31 y uno preexistente); completar documentación funcional y cierre B31. Los tramos de antigüedad, deterioro y programación de cobros siguen diferidos.
- **Estado Git:** rama `feat/b31-facturacion-cartera-y-recaudo`, cambios locales sin commit. Se preservan los cambios previos no relacionados; no se hizo `add`, commit, push ni PR.

### Entrega — 10/11/2026 — Diagnóstico de B30 y guardas de pruebas

- **Agente que entrega:** OpenCode.
- **Agente que recibe:** Codex o el agente que el propietario elija para continuar B31.
- **Bloque/tarea:** diagnóstico de B30; corrección documental y de guardas de pruebas.
- **Autorización del propietario:** autorizó corregir la desalineación documental y las guardas de pruebas sin tocar el código del B31; luego autorizó añadir las seis rutas de escritura de Finanzas que faltaban en el recorrido de auditoría.
- **Completado:**
  - B30 figura como «En revisión» en `docs/bloques/README.md`; se añadió nota de estado a `docs/bloques/B30-cierre.md`.
  - `apps/api/test/int/portal/support/portal-scenario.ts`: fixture de factura emitida con nota crédito del B31.
  - `apps/api/test/int/portal/portal-isolation.int.test.ts`: cubre `/v1/portal/invoices` y los dos enlaces de factura/nota crédito.
  - `apps/api/test/int/audit/support/portal-route-calls.ts`: auditoría de los dos POST de facturas del portal.
  - `apps/api/test/int/audit/support/finance-route-calls.ts` (nuevo) y `write-route-calls.ts`: auditoría de las seis rutas de escritura del B31.
  - No se modificó código de producto del B31.
- **Pasaron:** aislamiento del portal (4/4), recorrido de auditoría (305/305), `typecheck` de la API, ESLint de los cinco archivos tocados y portal web (37/37). Prettier aplicado a los archivos modificados. Las integraciones usaron PostgreSQL desechable; en este equipo hizo falta `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine`.
- **No ejecutado:** `pnpm check` completo en una sola cadena; siguen los 50 errores ESLint del B31 registrados por Codex.
- **Pendiente:** corregir esos errores ESLint, completar el cierre de B31, ejecutar `pnpm check` completo y obtener la revisión externa de B30.
- **Riesgos:** las pruebas de guarda ahora dependen del B31 sin commit; si cambian sus rutas o contratos, deben actualizarse. `docs/bloques/README.md` solo se corrigió para B30; los demás estados de la tabla siguen desactualizados.
- **Rama y Git:** `feat/b31-facturacion-cartera-y-recaudo`; cambios locales sin commit. Se preservaron los cambios preexistentes; no se hizo `add`, commit, push ni PR.
- **Siguiente paso seguro:** continuar B31 corrigiendo ESLint y ejecutando `pnpm check`; después revisar externamente B30 antes de integrarlo.

### Entrega — 10/11/2026 — Verificación por partes y cierre de B31

- **Agente que entrega:** OpenCode.
- **Bloque/tarea:** verificación de calidad y cierre de B31 (facturación, notas crédito, recaudos y portal).
- **Autorización del propietario:** «Realizar los pendientes» tras el diagnóstico, con plan aprobado.
- **Hallazgo:** los 50 errores ESLint del B31 registrados el 08/11/2026 **ya no se reproducen** en los 49 archivos TypeScript modificados o nuevos (ESLint en verde, salida 0).
- **Completado:**
  - `docs/bloques/README.md`: B01 «Terminado»; B02 a B31 «En revisión», según los cierres. B32 y siguientes siguen «Pendiente».
  - `docs/bloques/B31-cierre.md` (nuevo) y `docs/bloques/B31.md` actualizado.
  - Infraestructura de pruebas: `maxWorkers: 4` en `apps/api/vitest.config.ts`; espera de arranque en `apps/api/test/startup.test.ts`; cobertura de Finanzas (B31) y del portal (B30) trasladada a integración en `apps/api/vitest.shared.ts`.
  - `docs/ESTADO-PROYECTO.md` y `docs/ENTREGA-AGENTES.md` actualizados.
- **Pasaron:** `format:check`, `build:types`, `typecheck`, `boundaries`, `unused`, `build`, `secrets`; ESLint de `apps/api`, `apps/web`, `packages` e infraestructura; pruebas unitarias de la API (406, cobertura 97,43/92,01/96,11); contratos de facturación (4/4); pantallas de Finanzas (7/7); portal web (37/37); y los recorridos dirigidos de integración del B31 y las guardas del portal y auditoría.
- **No cerrado:** la suite completa de integración (151 archivos) y un par de archivos unitarios de la web fallaron por **esperas** mientras corría un `pnpm dev` (servidor web y dos vigías de la API); los archivos afectados pasan al correrlos solos. `pnpm check` completo sigue pendiente.
- **Riesgos:** la detección de estos fallos depende de no tener `pnpm dev` corriendo; en un equipo con más memoria o sin servidores en marcha es probable que la cadena cierre. Los ajustes de pruebas no debilitan comprobaciones.
- **Rama y Git:** `feat/b31-facturacion-cartera-y-recaudo`; cambios locales sin commit. Se preservaron los cambios preexistentes; no se hizo `add`, commit, push ni PR.
- **Siguiente paso seguro:** detener `pnpm dev` y ejecutar `pnpm check` por partes o en una máquina con más memoria; después obtener la revisión externa de B30 y la aprobación del Director General.

### Entrega — 11/11/2026 — Depuración de la suite de integración

- **Agente que entrega:** OpenCode.
- **Bloque/tarea:** B31, depuración de la suite completa de integración para intentar cerrar `pnpm check`.
- **Autorización del propietario:** continuar depurando la integración; al no cerrar, decidió «aceptar y documentar» el límite del equipo.
- **Cambios de infraestructura de pruebas:**
  - `apps/api/test/int/support/database-teardown.ts` (nuevo) y `apps/api/vitest.int.config.ts`: cierran los clientes de base de datos al terminar cada archivo.
  - `apps/api/test/int/support/integration-database.ts`: `poolSize`, espera de conexión y límites de transacción para pruebas; `preparationDatabase` reemplaza el cliente suelto de `iam-fixtures`.
  - `apps/api/test/int/support/global-setup.ts`: PostgreSQL desechable con `max_connections=300`.
  - `apps/api/test/int/iam/support/iam-fixtures.ts`: usa `preparationDatabase` y ya no conserva un cliente entre archivos.
- **Cambios de producto, sin alterar valores por defecto:** `DatabaseService` acepta `poolSize`, `connectTimeoutMs` y límites de transacción; `env-schema.ts` y `database.module.ts` los leen de variables opcionales. Producción sigue con 2 s de conexión y los límites por defecto de Prisma.
- **Verificaciones:** `typecheck` de la API y ESLint de los archivos tocados, en verde. Última integración completa (1 worker, 83 min): 138/151 archivos y 1240/1262 pruebas. Los 13 archivos restantes fallan por `timeout exceeded when trying to connect`, «no se pudo iniciar una transacción a tiempo» o un 500 en concurrencia; cada uno pasa solo sobre base nueva.
- **No cerrado:** `pnpm check` completo en una sola corrida; se decidió validarlo en CI o en un equipo con más CPU/RAM.
- **Rama y Git:** `feat/b31-facturacion-cartera-y-recaudo`; cambios locales sin commit. Se preservaron los cambios preexistentes; no se hizo `add`, commit, push ni PR.
- **Siguiente paso seguro:** ejecutar `pnpm check` en CI o equipo mayor; si pasa, marcar el criterio en `B31.md`, actualizar este documento y pedir la aprobación del Director General.

### Entrega — 11/11/2026 — Diagnóstico, correcciones finales y pull request de B31

- **Agente que entrega:** Claude Code.
- **Bloque/tarea:** B31, diagnóstico de lo dejado por Codex y OpenCode y culminación del bloque.
- **Autorización del propietario:** aprobó el plan de culminación («Apruebo el plan»): corregir los dos hallazgos, ampliar pruebas, documentar las variables nuevas, commits pequeños solo de B31, subir la rama y abrir el pull request. Decidió limitar la nota crédito al saldo pendiente.
- **Hallazgos del diagnóstico:** una solicitud anulada bloqueaba su hito para siempre; la nota crédito no tenía en cuenta lo ya recaudado; una sola prueba de integración (camino feliz); sin pruebas en navegador de facturas; variables `DATABASE_*_MS` sin documentar.
- **Completado:**
  - Migración `20261111000000_fin_invoices_release_voided_milestone`: la unicidad por hito cubre solo facturas vigentes (índice único parcial); `invoice-request.ts` e `invoices.ts` ignoran las anuladas.
  - `invoice-credit-note.ts`: la nota crédito no puede superar el saldo pendiente (total menos recaudos y notas crédito).
  - `apps/api/test/int/fin/invoice-rules.int.test.ts` (nuevo, 4 pruebas) y `apps/web/e2e/finance.spec.ts` (nuevo, 12 pruebas).
  - `.env.example` documenta `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_TRANSACTION_MAX_WAIT_MS` y `DATABASE_TRANSACTION_TIMEOUT_MS`.
  - `docs/manual/datos/fin.md`, `docs/bloques/B31-cierre.md`, `docs/bloques/B31.md` y `docs/ESTADO-PROYECTO.md` actualizados.
- **Verificaciones ejecutadas y resultado:** `format:check`, ESLint de todos los archivos cambiados o nuevos, `typecheck`, `boundaries` y `unused`, en verde. Contratos de facturación 4/4; pantallas de Finanzas y portal 19/19; integración de Finanzas 5/5 (dos archivos, PostgreSQL desechable, migraciones desde cero); `e2e/finance.spec.ts` 12/12 tras `build` de la web.
- **No ejecutado:** `pnpm check` completo en una sola corrida, ni la suite completa de integración, ni la suite completa de E2E; el equipo (7,4 GB de memoria) no las cierra. Se validan en la integración continua del pull request.
- **Cambios preexistentes preservados y fuera de los commits:** `.prettierignore`, `CLAUDE.md`, `AGENTS.md`, `apps/web/src/features/access/login-form.tsx`, `apps/web/src/features/administration/invite-user-dialog.tsx`, `docs/adr/024-…`, `docs/adr/025-…`, `docs/adr/README.md`, `.agents/`, `.claude/`, `skills-lock.json`, los respaldos/archivos de recuperación de la raíz (no se abrieron) y los dos documentos de continuidad (`docs/ESTADO-PROYECTO.md` y este), que siguen sin seguimiento junto con `AGENTS.md` hasta que el propietario decida incorporarlos.
- **Riesgos / decisiones por resolver:** los respaldos de la raíz no están en `.gitignore`; no usar `git add -A`. Devolución de dinero ya recaudado, cartera por edades, deterioro y programación de cobros siguen sin reglas aprobadas.
- **Rama y estado de Git:** `feat/b31-facturacion-cartera-y-recaudo`, con commits de B31 y pull request apilado sobre el de B30.
- **Siguiente paso seguro:** revisar el resultado de la integración continua del pull request; si pasa, marcar `pnpm check` en `B31.md` y pedir la aprobación del Director General.

### Entrega — 12/11/2026 — Bloque B32 y pull request

- **Agente que entrega:** Claude Code.
- **Bloque/tarea:** B32 — Presupuesto, gastos, caja menor y exportación contable (M10).
- **Autorización del propietario:** aprobó el plan con sus 8 decisiones («Apruebo todo») y pidió rama, commits pequeños, pruebas, cierre y pull request.
- **Completado:** migración `20261112000000_fin_budget_expenses_petty_cash_exports`; casos de uso y controladores en `apps/api/src/modules/fin` (presupuesto, gastos, caja menor, conciliación, certificación, cierre y exportación); guarda de periodo cerrado en recaudos, notas crédito y registro fiscal del B31; contratos en `packages/contracts/src/finance`; interfaces nuevas en `core`, `party` y `project` (`index.ts`); seis pantallas en `/app/finanzas/*`; pruebas unitarias, de integración (`test/int/fin/ledger*`, `period-close`), de auditoría (`ledger-route-calls.ts`) y E2E (`finance-ledger.spec.ts`); OpenAPI, `fin.md`, `permisos-por-rol.md`, `B32.md`, `README.md` de bloques y `B32-cierre.md`.
- **Verificaciones:** ver la tabla de `docs/bloques/B32-cierre.md` («Resultado de las verificaciones»). La suite completa de integración y `pnpm check` en una sola corrida quedan a cargo de la integración continua.
- **Decisiones adicionales a confirmar:** permiso extra `finance.cost_certification.manage`; el Auditor recibe `finance.ledger.read`; cerrar un mes exige que haya terminado y no tenga gastos pendientes.
- **Cambios preexistentes preservados y fuera de los commits:** los mismos de la entrega anterior (incluidos este documento y `docs/ESTADO-PROYECTO.md`).
- **Rama:** `feat/b32-presupuesto-gastos-caja-menor`, apilada sobre `feat/b31-facturacion-cartera-y-recaudo`.
- **Siguiente paso seguro:** revisar la integración continua del pull request y validar con el Contador el formato del archivo contable.

### Entrega — 12/11/2026 — Bloque B33 y pull request

- **Agente que entrega:** Claude Code.
- **Bloque/tarea:** B33 — Compras, proveedores y viajes (M11).
- **Autorización del propietario:** aprobó el plan con sus 9 decisiones («Apruebo todo») y pidió rama, commits pequeños, pruebas, cierre y pull request.
- **Completado:** migración `20261113000000_pur_requests_orders_evaluations_travel`; módulo `apps/api/src/modules/purchase` (solicitudes, cotizaciones, órdenes, recepciones, evaluaciones y viajes); parámetro `purchase.approval_tiers` en Núcleo con su formulario; interfaz nueva en `party` (`activePurchaseSuppliers`, `purchaseSupplierRefs`); contratos en `packages/contracts/src/purchase`; permisos `purchase.read` y `purchase.request.approve_high`; pantallas en `/app/compras/*` y entrada en el menú; pruebas unitarias, de integración (`test/int/purchase`), de auditoría (`purchase-route-calls.ts`) y E2E (`purchases.spec.ts`); OpenAPI, `pur.md`, `permisos-por-rol.md`, README de la API, `B33.md`, `README.md` de bloques y `B33-cierre.md`.
- **Verificaciones:** ver la tabla de `docs/bloques/B33-cierre.md` («Resultado de las verificaciones»). La suite completa de integración y `pnpm check` en una sola corrida quedan a cargo de la integración continua.
- **Decisiones adicionales a confirmar:** permiso extra `purchase.request.approve_high` (solo Dirección); las cotizaciones las gestiona quien tiene `purchase.order.issue`; rutas con estilo de sustantivo (`…/approval`) como en Finanzas.
- **Cambios preexistentes preservados y fuera de los commits:** los mismos de la entrega anterior (incluidos este documento y `docs/ESTADO-PROYECTO.md`).
- **Rama:** `feat/b33-compras-proveedores-y-viajes`, apilada sobre `feat/b32-presupuesto-gastos-caja-menor`.
- **Siguiente paso seguro:** revisar la integración continua del pull request y validar con el proceso administrativo los topes y los criterios de evaluación (hoy son valores de ejemplo).

### Entrega — 12/11/2026 — Bloque B34 y pull request

- **Agente que entrega:** Claude Code.
- **Bloque/tarea:** B34 — Activos (M11).
- **Autorización del propietario:** aprobó el plan con sus 10 decisiones («Apruebo todo») y pidió rama, commits pequeños, pruebas, cierre y pull request. Autorizó detener su `pnpm dev` para liberar memoria (al ir a hacerlo ya estaba detenido).
- **Completado:** migración `20261114000000_ast_assets_assignments_maintenance`; módulo `apps/api/src/modules/asset`; firma del comodato en Contratos (`loan-signatures.ts`, origen `asset_loan`, `isStandalone`); formato `CT-ADM-001` en Documentos; `activeCollaborators` en Identidad; trabajo del worker `ast.loan-work`; contratos en `packages/contracts/src/asset`; pantallas en `/app/compras/activos*`; pruebas unitarias, de integración (`test/int/asset`), de auditoría (`asset-route-calls.ts`) y E2E (`assets.spec.ts`); OpenAPI, `ast.md`, README de la API, `B34.md`, `README.md` de bloques y `B34-cierre.md`.
- **Verificaciones:** ver la tabla de `docs/bloques/B34-cierre.md`. La suite completa de integración, la E2E completa y `pnpm check` en una sola corrida quedan a cargo de la integración continua.
- **Lección:** cada función SECURITY DEFINER que recorre empresas necesita su política `… FOR SELECT TO migration_user USING (true)`; sin ella devuelve solo la empresa vacía y el worker no hace nada.
- **Decisiones adicionales a confirmar:** el colaborador debe estar vinculado con su persona en Terceros (se hace con `pnpm contratos:vincular-firmante`); columna `user_id` en lugar de `employee_id`; pantallas consolidadas en dos páginas.
- **Cambios preexistentes preservados y fuera de los commits:** los mismos de la entrega anterior (incluidos este documento y `docs/ESTADO-PROYECTO.md`).
- **Rama:** `feat/b34-activos`, apilada sobre `feat/b33-compras-proveedores-y-viajes`.
- **Siguiente paso seguro:** revisar la integración continua del pull request y validar con el proceso administrativo el libro (RE-ADM-003) y el comodato (CT-ADM-001).

### Entrega — 16/11/2026 — B35: lint, verificación previa al commit y registro de B22B

- **Agente que entrega:** OpenCode.
- **Agente que recibe:** el que el propietario elija para continuar B35 hasta su cierre.
- **Bloque/tarea:** B35 — Talento humano: colaboradores, selección y vinculación. Corrección de ESLint, verificación previa al commit y registro del bloque B22B.
- **Autorización del propietario:** aprobó corregir primero el lint de B35 y después crear los commits locales de B35 sin push; aprobó registrar el rediseño como B22B y versionar y formatear este documento y `docs/ESTADO-PROYECTO.md`.
- **Objetivo:** dejar B35 sin errores de análisis estático y con los cambios preparados en el índice, y registrar la nueva jerarquía visual como bloque propio sin reabrir B22A.
- **Completado:**
  - Formularios web divididos por responsabilidad: `apps/web/src/features/hr/hiring-form.tsx`, `candidate-forms.tsx`, `employee-checklists.tsx` y `vacancy-forms.tsx`; se retiró un import sin uso y las conversiones implícitas se sustituyeron por la ayuda `optionalText`, sin cambiar el comportamiento.
  - Prueba de navegador `apps/web/e2e/hr.spec.ts`: se extrajo `mockEmployeeFile(page, state)` para respetar el límite de líneas por función.
  - Pruebas de integración de la API divididas por contexto y ayudas con nombre: `hiring.int.test.ts`, `candidate-registration.int.test.ts`, `candidate-retention.int.test.ts`, `vacancies.int.test.ts`, `signature-journey.int.test.ts` y `doc/files.int.test.ts`.
  - Rutas de auditoría separadas en cuatro archivos (`auth-`, `access-`, `hr-` y `write-route-calls.ts`); casos de uso de selección divididos en `hiring-steps.ts`, `hiring-preparation.ts`, `hiring-errors.ts` y `hiring-onboarding.ts`; contratos en `signature-company-signers.ts`, `employment-signature-send.ts` y `signature-preparation.ts`; Terceros en `party-fields.ts` y `recruitment-parties.ts`.
  - `docs/bloques/B35.md` actualizado con hechos verificados; `docs/bloques/B22B.md` creado (seis bocetos externos, «misma identidad, nueva jerarquía», etapas F0 a F7 y reglas heredadas de B22A) y la fila de B22B añadida a `docs/bloques/README.md`.
- **Pendiente:**
  - `pnpm check` completo y la suite de integración, que requiere infraestructura; no se ejecutaron.
  - Recorrido completo en navegador de B35 y ejecución automática de la retención.
  - Revisión externa de B35, que es bloque crítico, y aprobación del Director General.
  - Confirmar con el propietario el detalle de pantallas por etapa de B22B antes de iniciar F0.
- **Archivos modificados:** los 79 archivos de B35 preparados en el índice; `docs/bloques/README.md`, `docs/ESTADO-PROYECTO.md` y este documento.
- **Cambios preexistentes preservados:** `.prettierignore`, `CLAUDE.md`, `docs/adr/024-…`, `docs/adr/README.md`, `.agents/`, `.claude/`, `AGENTS.md`, la ADR-025 y su copia en la raíz, `skills-lock.json`, `Preparar-ARZA-ONE-Agentes.ps1`, los volcados, CSV, SQL, `estructura-*.txt` y los artefactos de redirección de PowerShell. No se abrieron los volcados.
- **Verificaciones ejecutadas y resultado:** `pnpm typecheck` con 13 de 13 paquetes en verde; `prettier --check` sobre `apps/api`, `apps/web/src`, `apps/web/e2e`, `apps/worker/src`, `packages/contracts/src`, `docs/bloques` y `docs/manual/datos` sin diferencias; ESLint sobre los 74 archivos `.ts`/`.tsx` preparados, sin errores ni avisos; `gitleaks` del gancho de confirmación sin hallazgos. No se desactivó ninguna regla ni se debilitó ninguna prueba.
- **Riesgos / decisiones por resolver:** el lint de todo el repositorio no se ejecutó en una sola corrida porque supera los 40 minutos en este equipo; el gancho `pre-commit` necesita `NODE_OPTIONS=--max-old-space-size=8192` para que ESLint no agote la memoria; `commitlint` rechaza líneas de cuerpo de más de 100 caracteres. `.prettierignore` ignora `docs/bloques/B[0-9][0-9].md` y `docs/bloques/README.md`, pero no `B22B.md`. Los volcados y CSV de la raíz siguen sin `.gitignore`.
- **Rama y estado de Git:** `feat/b35-talento-humano-colaboradores-s`; 79 archivos de B35 preparados en el índice y commits locales de B35, sin push. Los cambios del propietario quedan fuera.
- **Siguiente paso seguro:** comprobar `git log -1` y el resultado de los ganchos; después completar el recorrido en navegador y la retención automática de B35 antes de pedir la revisión externa.

### Entrega — 17/11/2026 — B35: diagnóstico, culminación y pull request

- **Agente que entrega:** Claude Code.
- **Bloque/tarea:** B35 — Talento humano: colaboradores, selección y vinculación. Diagnóstico de lo dejado por OpenCode y culminación.
- **Autorización del propietario:** aprobó el plan de culminación («Apruebo el plan») con tres decisiones: A) el contrato laboral es un PDF adjunto; B) si la persona se usa en otra parte se conserva su ficha y solo pierde el papel de candidato; C) el banco de hojas de vida aplaza la eliminación 12 meses, nunca la cancela. Pidió además validar el B22B en otra sesión (sesión aparte, en su propio worktree).
- **Completado:** OpenAPI y lista de rutas (`api-paths-hr.ts`); `candidate-retention.ts` reescrito (siempre elimina; `disposeAttachedFile` en Documentos con borrado lógico, `dropCandidateRole` en Terceros); `…/actions/extend-retention`; responsables de inducción (`hiring-onboarding.ts`) y aviso `hr_onboarding_task` (`ntf/application/hr-notices.ts`, migración `20261116000000_ntf_hr_onboarding_notice`); catálogo `hr_salary_bands`; casilla del banco, botón «Aplazar eliminación» y responsable visible en la web; pruebas de integración (retención 3, vinculación con responsables y banda), unitarias del aviso y 18 de pantalla nuevas; `hr.md`, README de la API, `B35.md`, README de bloques y `B35-cierre.md`.
- **Lecciones:** (1) la base de datos no deja cambiar el estado de un archivo ya analizado fuera de una disposición documental: para retirar un adjunto se usa borrado lógico (`deleted_at`), que todas las descargas respetan; (2) agregar un tipo de aviso cambia el OpenAPI (enumeración de avisos): regenerar `openapi.json`; (3) en este equipo, correr las unitarias de todos los paquetes a la vez satura los procesos: usar `pnpm turbo run test --concurrency=1`; (4) los guiones Python con comillas triples dentro de heredocs de bash fallan en Git Bash: escribirlos en un archivo.
- **Cambios preexistentes preservados y fuera de los commits:** `.prettierignore`, `CLAUDE.md`, `docs/adr/024-…`, `docs/adr/README.md`, `.agents/`, `.claude/`, `AGENTS.md`, la ADR-025 y su copia en la raíz, `skills-lock.json`, `Preparar-ARZA-ONE-Agentes.ps1` y los respaldos, CSV, SQL y textos de la raíz (no se abrieron).
- **Rama:** `feat/b35-talento-humano-colaboradores-s`, con `main` integrado; pull request contra `main`.
- **Siguiente paso seguro:** revisar la integración continua del pull request, obtener la revisión externa (bloque crítico) y validar con Talento humano la lista de chequeo y las bandas salariales.
