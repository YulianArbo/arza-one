# Estado del proyecto ARZA ONE

**B37 construido y en revisión, 20/11/2026 (Claude Code).** El propietario aprobó el plan («Apruebo todo», 14 decisiones). Rama `feat/b37-seguridad-y-salud-en-el-trabaj` desde `main` (f312d42).

- Se construyó el módulo de Seguridad y salud en el trabajo (M13): reporte desde el celular, incidentes y accidentes con plazo para la ARL e investigación, matriz de peligros GTC 45, plan anual con evidencias, inspecciones (también la del puesto en casa), conceptos de aptitud cifrados, elementos de protección, comités con lo de Convivencia restringido a sus integrantes, canal confidencial de quejas y autoevaluación de estándares mínimos.
- Migración: `20261121000000_sst_safety_and_health`. Permisos nuevos: `sst.read` y `sst.ppe.manage` (212 en total).
- Pasaron en local: contratos (257), API unitarias (443), worker (42), integración de SST (19) y recorrido de auditoría de 28 rutas, integración general afectada (84 y 58 de Talento humano), pantallas de SST (29) y typecheck completo.
- No se ejecutaron en local las pruebas de navegador: el navegador de Playwright instalado no corresponde a la versión del repositorio.
- El PR #86 lleva los datos, la API y las pruebas; un segundo PR lleva las pantallas y el cierre (`docs/bloques/B37-cierre.md`).
- Pendientes principales: comparar con RE-SST-003, definir el número de trabajadores (7, 21 o 60 estándares) y la validación del profesional de SST.

**B36 construido y en revisión, 19/11/2026 (Claude Code).** Plan aprobado por el propietario («Apruebo todo», 12 decisiones). Rama `feat/b36-talento-humano-novedades-desem` desde `main` (53d211b). Se construyeron Mi espacio, Mi equipo, permisos y vacaciones con saldo, horas extras con autorización previa y topes, novedades de nómina por mes con cierre y archivo CSV, desempeño, formación, proceso disciplinario cifrado y retiro que desactiva la cuenta y lista los activos por devolver (migración `20261117000000_hr_novelties_performance_offboarding`). Pasaron las pruebas de contratos (24), unitarias de API (15), OpenAPI (4) y de pantallas (43), con tipos y analizador limpios en lo tocado. Tras reiniciar el equipo se corrió `pnpm check` paso a paso: todo en verde salvo fallas de infraestructura (conexiones a la base de prueba agotadas, que pasan al repetirlas, y una prueba de navegador de Administración por tiempo). Las pruebas de integración hallaron y se corrigieron cuatro errores reales (códigos de lista largos, nombre de evento inválido, alta de formación y plantilla de aviso). Cierre en `docs/bloques/B36-cierre.md`.

**B35 terminado y en revisión, 17/11/2026 (Claude Code).** Tras diagnosticar lo dejado por OpenCode, se resolvieron siete pendientes con el plan aprobado por el propietario («Apruebo el plan», decisiones A, B y C): OpenAPI con las 19 rutas de Talento humano; eliminación nocturna completa de los datos de candidatos (hoja de vida, evaluaciones y persona, o solo el papel de candidato si la persona se usa en otra parte); botón para aplazar 12 meses la eliminación del banco de hojas de vida; casilla del banco en el registro; responsables de cada tarea de inducción con aviso `hr_onboarding_task` (migración `20261116000000_ntf_hr_onboarding_notice`); lista editable «Bandas salariales»; y 19 pruebas de pantalla. Cierre en `docs/bloques/B35-cierre.md`; `docs/bloques/README.md` marca B35 «En revisión». Es bloque crítico: falta la revisión externa. `pnpm check` completo queda a cargo de la integración continua del pull request.

**Lint y commit de B35, 16/11/2026.** Se corrigieron los errores de ESLint del bloque sin desactivar reglas ni debilitar pruebas: los formularios web, las pruebas de integración y las rutas de auditoría se dividieron en archivos y ayudas con nombre, y las comparaciones laxas se sustituyeron por comprobaciones explícitas. En verde: `pnpm typecheck` (13 de 13 paquetes), Prettier sobre las rutas de trabajo, ESLint sobre los 74 archivos preparados y `gitleaks`. No se ejecutó `pnpm check` ni la suite de integración, que requiere infraestructura. El propietario aprobó registrar el rediseño visual como B22B (`docs/bloques/B22B.md`), con los seis bocetos aprobados como dirección vinculante y la regla «misma identidad, nueva jerarquía».

**Retención B35.** Pasó la prueba de retención de identidades exclusivas de selección sin adjuntos. El trabajo diario conserva la evidencia inmutable del consentimiento y respeta la autorización vigente del banco de talento. Los casos con soportes o identidad compartida requieren tratamiento adicional. La compilación web predeterminada falló por un error de Turbopack al iniciar el proceso de CSS en Windows.

**Expediente e interfaz B35.** Pasaron las pruebas dirigidas de actualización del expediente, tareas de inducción y auditoría. La web incorpora vacantes, candidaturas, preparación de contrato, ficha laboral y acciones de firma y vinculación. Pasaron 11 pruebas dirigidas de la web. Sigue pendiente el recorrido completo en navegador y la ejecución automática de la retención.

**Vinculación B35.** Pasó el recorrido dirigido de preparación del PDF, firmas, sellado, vinculación, alta de cuenta y creación del expediente y las tareas de inducción. El PDF y el expediente se consultan con control de acceso en la API. La interfaz web y la ejecución de la retención de datos siguen pendientes.

**Selección B35.** Pasó el recorrido dirigido de registro, autorización de selección, avance, evaluación y consulta por vacante. La autorización y el alta se guardan en la misma transacción y los eventos de auditoría del alta no guardan el correo de la persona.

**API de vacantes de B35.** El alta, la consulta y el cierre de vacantes tienen dos pruebas de integración aprobadas que cubren el permiso, el aislamiento por empresa, los reintentos, el control de versión y la auditoría. El proceso de selección y vinculación sigue en desarrollo.

**B35 en construcción.** El diseño local incluye los modelos y la migración de selección y vinculación. El propietario aprobó los 13 ítems del expediente y la firma desde un PDF adjunto. Pasaron 9 pruebas de contratos, 12 de archivos y 4 del recorrido de firma, incluida la entrega del turno a Dirección tras la firma del colaborador. Faltan los recorridos de Talento Humano en API y web, la vinculación, las verificaciones de aceptación y la revisión externa.

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

**CI, 13/11/2026.** GitHub aceptó el reintento de los trabajos fallidos de las PR #39 y #43–#51. El intento 3 de #39 falló en la prueba de reasignación de B15 con ambos plazos iguales. La corrección local mueve el reloj de la prueba más allá del plazo original y está pendiente de publicación en #39.

El intento 4 de #39 repitió la misma aserción en el commit original. Prettier y `git diff --check` pasaron para el archivo corregido. La prueba puntual con Testcontainers pasó (una prueba ejecutada, siete omitidas por el filtro). La integración completa sobre la rama de #39 queda pendiente de publicar el cambio.

> Registro inicial preparado el 07/11/2026 a partir de la información revisada con el propietario. Los datos de Git y el avance deben actualizarse al comenzar cada sesión; no asumir que este registro sigue siendo actual.

## 1. Identificación

- Producto: ARZA ONE.
- Organización: ARZA TECH S.A.S. (Colombia).
- Repositorio local: `C:\Users\yeaze\arza-one`.
- Rama observada en la última revisión: `feat/b30-portal-del-cliente`.
- Agentes previstos: Claude Code, Codex CLI y OpenCode, utilizados secuencialmente.
- OmniRoute: no forma parte de la solución acordada para alternar agentes.

## 2. Estado funcional conocido

- El bloque B30 — Portal del cliente — está implementado y en revisión, según `docs/bloques/B30-cierre.md`.
- El cierre B30 indica que la rama `feat/b30-portal-del-cliente` procede de la rama B29 y aún no está integrada en `main`.
- B31 está iniciado por decisión del propietario: la rama `feat/b31-facturacion-cartera-y-recaudo` sale del HEAD de B30 (`3d3c14d`) y tiene cambios locales sin commit.
- `docs/bloques/README.md` se corrigió el 10/11/2026: B01 queda «Terminado» y B02 a B31 «En revisión», conforme a sus cierres; B32 y siguientes siguen «Pendiente».
- B31 ya tiene cierre escrito (`docs/bloques/B31-cierre.md`): facturas, notas crédito, recaudos y consulta/descarga de facturas en el portal. El criterio de B30 «el cliente descarga la factura y el soporte fiscal» queda cubierto por el B31, pero ninguno de los dos puede darse por terminado hasta surtir aprobación (y, en B30, revisión externa).
- B32 (presupuesto, gastos, caja menor, conciliación, certificación de costos, cierre de periodo y exportación contable) está implementado y en revisión en `feat/b32-presupuesto-gastos-caja-menor`, que sale de la rama del B31; cierre en `docs/bloques/B32-cierre.md`. `docs/bloques/README.md` marca B32 «En revisión».
- B33 (compras, proveedores y viajes: solicitudes con aprobación por montos, cuadro comparativo, órdenes, recepciones, evaluación de proveedores y viajes con legalización) está implementado y en revisión en `feat/b33-compras-proveedores-y-viajes`, que sale de la rama del B32; cierre en `docs/bloques/B33-cierre.md`. `docs/bloques/README.md` marca B33 «En revisión».
- B34 (activos: inventario, asignación en comodato con contrato firmado, mantenimientos, bajas y libro de activos) está implementado y en revisión en `feat/b34-activos`, que sale de la rama del B33; cierre en `docs/bloques/B34-cierre.md`. `docs/bloques/README.md` marca B34 «En revisión». El formato del libro (RE-ADM-003) y el texto del comodato (CT-ADM-001) son propuestas por validar.
- La cadena completa de `pnpm check` sigue pendiente en una sola corrida. El 11/11/2026, sin `pnpm dev` y con la integración en un solo worker, pasaron 138 de 151 archivos y 1240 de 1262 pruebas de integración; los 13 archivos restantes fallan por esperas de PostgreSQL por saturación del equipo, no por comprobaciones. El propietario decidió aceptar y documentar ese límite. El resto de la cadena (formato, tipos, límites, código sin usar, compilación, secretos y unitarias de la API) está en verde.

## 3. Estado de Git observado

En la revisión del 16/11/2026 se observó:

- Rama: `feat/b35-talento-humano-colaboradores-s`.
- 79 archivos de B35 preparados en el índice: 57 en `apps/api`, 15 en `apps/web`, 3 en `packages/contracts`, 2 en `apps/worker`, 1 en `docs/bloques` y 1 en `docs/manual`.
- Cambios locales sin commit del propietario:
  - `.prettierignore`
  - `CLAUDE.md`
  - `docs/adr/024-integracion-continua-sin-repeticiones.md`
  - `docs/adr/README.md`
- Cambio de esta sesión pendiente de commit: `docs/bloques/README.md` (fila de B22B).
- Archivos/directorios sin seguimiento:
  - `.agents/`
  - `.claude/`
  - `AGENTS.md`
  - `docs/ESTADO-PROYECTO.md`
  - `docs/ENTREGA-AGENTES.md`
  - `docs/bloques/B22B.md`
  - `docs/adr/025-runner-propio-en-wsl2.md` y su copia `adr025-runner-propio-en-wsl2.md` en la raíz
  - `skills-lock.json`
  - `Preparar-ARZA-ONE-Agentes.ps1`, los volcados de base de datos, los CSV y SQL de recuperación, `estructura-*.txt` y los artefactos de redirección de PowerShell de la raíz

Estos cambios preexistentes deben preservarse. **No asumir que este estado sigue vigente:** ejecutar `git status --short --branch` al iniciar una sesión y comparar antes de actuar. No incluir automáticamente estos archivos en commits.

## 4. CI y runner propio: hallazgos revisados

La configuración inspeccionada en `.github/workflows/ci.yml` muestra que:

- El job `plan` (tarea 0) corre en `ubuntu-24.04`.
- Las tareas 1 a 5 (`quality`, `unit`, `integration`) usan el runner calculado por el job `plan`.
- La selección del runner propio exige `vars.CI_RUNNER == 'local'` y:
  - para `push`, que la rama sea `main`; o
  - para `pull_request`, que el PR provenga del mismo repositorio, su autor sea el propietario del repositorio y tanto `github.actor` como `github.triggering_actor` sean el propietario.
- Si no se cumplen las condiciones, las tareas 1 a 5 usan `ubuntu-24.04`.
- Las tareas 6 a 9, 11 y 12, y el job `verifications`, aparecen configurados en `ubuntu-24.04`.

El runbook `docs/runbooks/integracion-continua.md` describe la ejecución local de tareas 1 a 5, en concordancia con el fragmento del workflow revisado.

## 5. Discrepancia documental pendiente

`docs/adr/025-runner-propio-en-wsl2.md` contiene una descripción más amplia: menciona que las tareas 0 a 9 y «Verificaciones» pueden correr en el runner propio. Esa descripción no coincide con la distribución observada en el workflow ni con el runbook.

- No corregir automáticamente la ADR, el runbook ni el workflow.
- Revisar la ADR completa y el historial/decisión de aprobación antes de proponer una corrección.
- El `ci.yml` y el runbook observados coinciden en la distribución de tareas 1 a 5; las demás tareas enumeradas permanecen en GitHub.

## 6. Documentación y arquitectura

- `CLAUDE.md` contiene las instrucciones previas de trabajo, arquitectura, seguridad, comandos y definición de terminado. Debe conservarse; este proyecto no debe reemplazarlo por una versión nueva.
- El Manual Maestro `MN-TEC-002` y sus capítulos son la especificación oficial.
- Los bloques se encuentran en `docs/bloques/`.
- Las decisiones se encuentran en `docs/adr/`.
- La ADR-025 referencia `docs/runbooks/runner-propio-wsl2.md`, pero ese archivo no apareció en el listado revisado de `docs/runbooks/`. Verificar si se creó posteriormente antes de tratarlo como faltante.
- `docs/runbooks/` sí contenía `integracion-continua.md`, `despliegue-y-reversion.md`, `entorno-local.md`, `proveedores-de-servidor-y-dominio.md`, `servidor-de-pruebas.md` y `README.md` en la revisión anterior.

## 7. Pendientes conocidos de B30

Según `docs/bloques/B30-cierre.md`, entre los asuntos pendientes o sujetos a revisión se encuentran:

- revisión externa antes de integrar el bloque;
- completar o definir textos legales definitivos;
- firma con certificado;
- notificaciones vinculadas a B41/B42;
- facturación/estado de cuenta vinculados a B31;
- runner propio de GitHub.

Confirmar cada punto en el cierre vigente antes de marcarlo como pendiente actual o resolverlo.

## 8. Registro de sesiones

Añada una entrada por sesión con fecha, agente, bloque, resumen de trabajo, archivos modificados, verificaciones realmente ejecutadas y pendientes. No registre secretos ni datos personales.

| Fecha      | Agente                 | Bloque                                              | Resultado / siguiente paso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 07/11/2026 | Preparación compartida | Revisión de continuidad                             | Preparación de instrucciones comunes; no se ha iniciado B31 ni se han modificado archivos de aplicación.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 08/11/2026 | Codex                  | B31 — inicio y delimitación                         | El propietario confirmó iniciar B31 y excluyó las notas débito. Se creó `feat/b31-facturacion-cartera-y-recaudo` desde el HEAD observado de B30 (`3d3c14d`). Se precisó el alcance en `docs/bloques/B31.md`. No hay cambios de código ni verificaciones funcionales. Pendiente confirmar reglas/documentos SGC de antigüedad, deterioro y cobro.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 08/11/2026 | Codex                  | B31 — facturación, notas crédito, recaudos y portal | El propietario confirmó este alcance, excluyó cartera por edades, deterioro y programación de cobros hasta definir reglas, y ordenó registrar valores fiscales emitidos sin cálculo automático. Se implementaron modelos/migración, API, contratos y pantallas para solicitudes desde hitos, aprobación, registro de documento fiscal, notas crédito, recaudos y consulta/descarga de facturas y notas crédito en el portal. Pasaron los chequeos de tipos de contratos/API/web, contratos (4/4), Finanzas web (3/3), portal web (12/12), integración B31 (1/1) y `git diff --check`. El global setup de la integración aplicó todas las migraciones desde cero sobre PostgreSQL desechable y detuvo los contenedores al terminar. Se formatearon los 21 archivos reportados por Prettier. `pnpm check` pasó `format:check` y `build:types` (5/5 paquetes), pero ESLint falló con 50 errores, 49 en archivos de B31 y uno en el cambio preexistente de `apps/web/src/features/access/login-form.tsx`; no continuó a las etapas siguientes. |
| 10/11/2026 | OpenCode               | B30 — diagnóstico y guardas de pruebas              | Diagnóstico: B30 implementado y en revisión, sin integrar a `main` (45 commits por delante); su criterio de facturas depende de B31 y la cadena completa de `pnpm check` sigue pendiente. Se corrigió B30 a «En revisión» en `docs/bloques/README.md` y se anotó el estado en su cierre. Se actualizaron las guardas de aislamiento y auditoría para las rutas de facturas del portal y las seis rutas de escritura de Finanzas del B31, solo en pruebas. Pasaron: aislamiento del portal (4/4), recorrido de auditoría (305/305), `typecheck` de la API, ESLint de los archivos tocados y portal web (37/37). No se ejecutó `pnpm check` completo ni se hizo commit.                                                                                                                                                                                                                                                                                                                                                                      |
| 10/11/2026 | OpenCode               | B31 — verificación por partes y cierre              | Se corrigieron los estados de `docs/bloques/README.md` según los cierres (B01 terminado; B02 a B31 en revisión). En verde: `format:check`, `build:types`, `typecheck`, `boundaries`, `unused`, `build`, `secrets` y las pruebas unitarias de la API (406, cobertura 97,43/92,01/96,11). Se ajustó la infraestructura de pruebas: `maxWorkers: 4` en las unitarias de la API, espera de arranque de la prueba del proceso real y cobertura de Finanzas (B31) y portal (B30) trasladada a integración. No cerró la suite completa de integración ni la web por esperas mientras había un `pnpm dev` en ejecución; los archivos pasan al correrlos solos. Se escribió `docs/bloques/B31-cierre.md`, se actualizó `B31.md` y se dejó `pnpm check` completo como pendiente. Sin commit ni push.                                                                                                                                                                                                                                                 |
| 11/11/2026 | OpenCode               | B31 — depuración de la suite de integración         | Se detuvo `pnpm dev` y se repitió la integración completa con 4, 2 y 1 worker. Se añadieron cierre de clientes por archivo (`database-teardown.ts`), tope `max_connections=300`, y opciones de `poolSize`, espera de conexión y límites de transacción en `DatabaseService`, activadas solo por entorno de pruebas. La última corrida (1 worker, 83 min) pasó 138/151 archivos y 1240/1262 pruebas; los 13 fallos restantes son esperas de PostgreSQL por saturación, no de lógica. El propietario decidió aceptar y documentar el límite. Sin commit ni push.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 11/11/2026 | Claude Code            | B31 — diagnóstico y culminación                     | Diagnóstico de lo dejado por Codex y OpenCode: bloque construido y sin commits. Se corrigieron dos fallas (una solicitud anulada bloqueaba su hito; la nota crédito no consideraba lo recaudado y ahora se limita al saldo pendiente), con la migración `20261111000000_fin_invoices_release_voided_milestone`. Pruebas nuevas: reglas de facturación (4) y pantalla de facturas en navegador (12). En verde: formato, ESLint de lo cambiado, tipos, límites, código sin usar, contratos 4/4, pantallas 19/19, integración de Finanzas 5/5 y E2E de facturas 12/12. No se corrió `pnpm check` completo en este equipo; queda a cargo de la integración continua del pull request. Commits solo de B31; los cambios preexistentes del propietario y los respaldos quedaron fuera.                                                                                                                                                                                                                                                           |
| 12/11/2026 | Claude Code            | B32 — presupuesto, gastos, caja menor y exportación | Plan con 8 decisiones aprobado por el propietario. Migración `20261112000000_fin_budget_expenses_petty_cash_exports` (8 tablas, RLS, disparador de periodo cerrado que también cubre recaudos, notas crédito y registro fiscal del B31), API, permisos nuevos (`finance.ledger.read`, `finance.cost_certification.manage`, `finance.period.close`), seis pantallas y pruebas. En verde: formato, tipos, ESLint global, límites, código sin usar, secretos, unitarias API 415/415 y web 720/720 (repetidas solas por esperas del equipo), integración Finanzas 20/20 y recorrido de auditoría/migraciones/semilla/permisos 336/336, E2E de Finanzas y navegación 31/31. Suite completa de integración no corrida (límite del equipo). Commits solo del B32; pull request apilado sobre el del B31.                                                                                                                                                                                                                                          |
| 12/11/2026 | Claude Code            | B33 — compras, proveedores y viajes                 | Plan con 9 decisiones aprobado por el propietario («Apruebo todo»). Migración `20261113000000_pur_requests_orders_evaluations_travel` (7 tablas, RLS, restricciones de segregación), módulo `purchase` en la API (24 rutas, 19 que escriben), parámetro con vigencia `purchase.approval_tiers`, permisos nuevos (`purchase.read`, `purchase.request.approve_high`), menú Compras con seis pantallas y pruebas. Resultados en la tabla de `docs/bloques/B33-cierre.md`. Suite completa de integración no corrida (límite del equipo). Commits solo del B33; pull request apilado sobre el del B32.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 12/11/2026 | Claude Code            | B34 — activos                                       | Plan con 10 decisiones aprobado por el propietario («Apruebo todo»). Migración `20261114000000_ast_assets_assignments_maintenance` (3 tablas, RLS, restricción y disparador «asignado solo con comodato firmado»), módulo `asset` en la API (12 rutas, 10 que escriben), comodato CT-ADM-001 firmado con la firma electrónica (nuevo origen `asset_loan`), trabajo del worker `ast.loan-work`, pantallas `/app/compras/activos` y `/app/compras/activos/mantenimientos`. Sin permisos nuevos. Resultados en `docs/bloques/B34-cierre.md`. Suite completa de integración no corrida (límite del equipo). Commits solo del B34; pull request apilado sobre el del B33.                                                                                                                                                                                                                                                                                                                                                                       |
| 16/11/2026 | OpenCode               | B35 — lint, verificación y registro de B22B         | Se corrigieron los errores de ESLint de B35 sin desactivar reglas ni debilitar pruebas: se dividieron formularios web, pruebas de integración y rutas de auditoría en archivos y ayudas con nombre, y las comparaciones laxas se sustituyeron por comprobaciones explícitas. En verde: `pnpm typecheck` (13 de 13 paquetes), Prettier sobre las rutas de trabajo, ESLint sobre los 74 archivos preparados y `gitleaks`. No se ejecutó `pnpm check` ni la suite de integración. Se registró B22B (`docs/bloques/B22B.md`) con los seis bocetos aprobados como dirección vinculante y la regla «misma identidad, nueva jerarquía». Los commits de B35 quedan locales, sin push.                                                                                                                                                                                                                                                                                                                                                              |
| 17/11/2026 | Claude Code            | B35 — diagnóstico y culminación                     | Diagnóstico de lo dejado por OpenCode: siete pendientes (OpenAPI desactualizado, eliminación de candidatos que se saltaba casos, sin aplazamiento ni casilla del banco de hojas de vida, tareas de inducción sin responsable ni aviso, banda salarial como texto libre, una sola prueba de pantalla). Plan aprobado por el propietario con decisiones A (PDF adjunto), B (persona compartida conserva su ficha) y C (el banco aplaza, nunca cancela). Resultados en `docs/bloques/B35-cierre.md`. Commits solo del B35; pull request contra `main`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## 9. Validación de lectura de instrucciones de los agentes — 07/11/2026

Se realizaron pruebas de lectura de las instrucciones compartidas del proyecto, sin modificar código ni ejecutar operaciones Git, pruebas de aplicación o migraciones.

| Agente              | Resultado | Observaciones                                                                                                                                                                                                          |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex CLI 0.163.0   | Validado  | Encontró y leyó `AGENTS.md`, `docs/ESTADO-PROYECTO.md` y `docs/ENTREGA-AGENTES.md`. Comprendió las reglas de autorización, protección de cambios y estado de B30/B31. La sesión se inició con sandbox de solo lectura. |
| OpenCode 1.19.5     | Validado  | Encontró y leyó los tres documentos anteriores. Comprendió las reglas de autorización, protección de cambios y estado de B30/B31. La prueba utilizó una configuración temporal restrictiva y el agente `plan`.         |
| Claude Code 2.1.310 | Pendiente | No se pudo completar la prueba por límite semanal de uso. La aplicación informó que el límite se restablecería el 11/11/2026 a las 16:00, hora de Bogotá. Esto no demuestra un fallo de configuración.                 |

### Alcance y límites de las verificaciones

- Codex y OpenCode confirmaron que no tenían autorización para modificar archivos, ejecutar migraciones, crear commits ni desplegar.
- Ninguno de los dos agentes ejecutó operaciones Git durante su prueba.
- No se verificó el estado actual de Git durante estas pruebas. La información de rama y cambios locales de las secciones anteriores continúa siendo histórica y debe comprobarse antes de cualquier trabajo.
- La prueba de OpenCode utilizó `OPENCODE_CONFIG_CONTENT` temporal. Al terminar la sesión debe cerrarse OpenCode y eliminarse esa variable de entorno de la ventana de PowerShell.
- La validación confirma la lectura de instrucciones; no constituye una prueba de ejecución funcional, calidad de código ni integración entre agentes.
- El uso de los agentes debe seguir siendo secuencial, uno a la vez, sobre el mismo repositorio.
