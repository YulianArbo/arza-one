# Dirección: tableros y requisitos legales · B46

El módulo M16 da a la Dirección una visión actual de la empresa y de su cumplimiento legal (ficha 17.17). En la web está en **Dirección** (grupo Gobierno del menú) con cuatro pantallas: **Tablero gerencial**, **Cuadro de mando**, **Tablero de cumplimiento** y **Normograma**.

## Dónde vive cada parte

- **Tableros** (`apps/api/src/modules/dashboard`): módulo sin tablas. Cada cifra sale de una lectura que publica el módulo dueño de los datos por su `index.ts` (Finanzas, Comercial, Proyectos, Servicio, Identidad, Tareas, Documentos y Calidad). No lee tablas de otros módulos.
- **Normograma y objetivos estratégicos** (`apps/api/src/modules/qms`): tablas `qms_` porque el manual (capítulo 12) las pone con Calidad, y los permisos `qms.legal.*` ya eran de Calidad.

## Tablas

| Tabla | Para qué |
| --- | --- |
| `qms_legal_requirements` | Normograma (RE-DG-001), `NRM-NNN`: tipo de norma, norma, entidad, artículos, requisito, cómo se cumple, proceso, responsable y si aplica. `reminded_period` guarda el semestre ya avisado. |
| `qms_legal_evaluations` | Evaluación de cada requisito: semestre (calculado de la fecha), fecha, resultado, evidencia, archivo opcional, acción de mejora y quién evaluó. **No se cambia**: la aplicación solo puede leerla y agregar nuevas; la última es la que cuenta. |
| `qms_strategic_objectives` | Objetivos del plan estratégico (PL-DG-001), `OBJ-NNN`, en una de cuatro perspectivas: financiera, clientes, procesos internos, aprendizaje y crecimiento. |

Además: `qms_indicators.strategic_objective_id` (cada indicador mide a lo sumo un objetivo) y `qms_actions.legal_requirement_id` con el origen nuevo «Evaluación del cumplimiento legal». Todas llevan `tenant_id` y RLS. Migración `20261128000000_qms_legal_requirements_scorecard`.

## Reglas

- **Toda cifra lleva a sus registros.** Cada tarjeta tiene «Ver registros» (los primeros 200) y el enlace al listado completo del módulo.
- **Nadie ve por un indicador lo que no ve por el listado (decisión 3).** Una cifra solo se calcula si la persona tiene, sin límite a «lo propio», el permiso del listado de origen. Si no, la tarjeta dice «No tiene permiso para ver este dato». Ejemplo: Calidad ve el tablero gerencial pero no las ventas ni la cartera.
- **Cálculos al momento (decisión 11).** No hay copias guardadas; la pantalla muestra la hora del corte en hora de Colombia.
- **Ficha de cada cifra.** El texto «¿Cómo se calcula?» sale de `packages/contracts/src/dashboard/figures.ts` y es el mismo para la API y la web.

### Tablero gerencial (decisión 2)

| Cifra | Cálculo | Permiso del listado |
| --- | --- | --- |
| Ventas facturadas del mes / del año | Subtotal (sin IVA) de las facturas emitidas en el periodo hasta hoy, menos la parte sin IVA de las notas crédito del periodo (valor de la nota × subtotal ÷ total de su factura). Sin anuladas. | `finance.invoice.read` |
| Oportunidades abiertas | Valor estimado de las oportunidades no ganadas ni perdidas. | `crm.opportunity.read` |
| Cartera por cobrar / vencida | Saldo de las facturas emitidas o con abono (total − recaudos − notas crédito); la vencida, la de fecha de vencimiento pasada. | `finance.invoice.read` |
| Proyectos en riesgo | Proyectos en estado «En riesgo». | `project.read_all` |
| Satisfacción de los clientes | Promedio (1 a 5) de las encuestas respondidas en los últimos 90 días. | `service.ticket.read` |
| Cumplimiento legal | Requisitos que aplican cuya última evaluación es «Cumple» ÷ los que aplican y tienen evaluación (sin contar «No aplica») × 100. | `qms.read` |

### Tablero de cumplimiento (decisiones 9 y 10)

| Cifra | Cálculo | Permiso del listado |
| --- | --- | --- |
| Cuentas internas sin segundo factor | Cuentas internas activas sin segundo factor confirmado. | `iam.access_review.read` |
| Cuentas activas sin uso | Las mismas del informe de revisión de accesos: 60 días sin ingresar. | `iam.access_review.read` |
| Administradores de la plataforma | Cuentas activas con el rol Administrador de plataforma. | `iam.access_review.read` |
| Personas con funciones en conflicto | Cuentas activas que, por sus roles, reúnen los dos permisos de un par. Es una alerta, no un bloqueo. | `iam.access_review.read` |
| Tareas vencidas | Tareas de todas las personas en estado «Vencida». | `wf.task.read_all` |
| Versiones por revisar o aprobar | Versiones en revisión o aprobadas sin publicar, con los mismos filtros de visibilidad del listado de documentos (lo reservado solo con su permiso). | `doc.document.read` |
| Solicitudes de cambio pendientes | Radicadas o en análisis. | `doc.document.read` |
| Requisitos sin evaluar / que no se cumplen | Del normograma. | `qms.read` |

**Pares de funciones en conflicto (por validar):** solicitar y aprobar facturas; registrar y aprobar gastos; registrar recaudos y conciliar bancos; emitir y recibir órdenes de compra; crear roles y asignarlos. Están en `SOD_CONFLICTS` (`packages/contracts/src/dashboard/figures.ts`).

### Cuadro de mando (decisiones 4 y 5)

- Objetivos activos por perspectiva, con sus indicadores activos, el último resultado, si cumple la meta y la tendencia.
- Estado del objetivo: «Cumple» si todos sus indicadores medidos cumplen; «No cumple» si ninguno; «Cumple en parte» si algunos; «Sin mediciones» si no hay datos.
- La Dirección, Calidad y el Auditor ven toda la empresa. Los demás roles con «Ver tableros de proceso (solo lo propio)» ven los objetivos que miden los procesos de su cargo.
- Calidad registra los objetivos y les asigna indicadores en la misma pantalla.

### Normograma (decisiones 6 a 8)

- Calidad registra y edita requisitos o los **carga desde un CSV** (UTF-8, punto y coma) con las columnas: Tipo de norma; Norma; Entidad que la expide; Artículos; Requisito; Cómo se cumple; Código del proceso; Aplica. Primero se **revisa** y se ve el resultado de cada fila; con un solo error no se guarda nada. Un requisito con la misma norma y artículos se actualiza; repetir la carga no duplica. Columnas **por validar** frente al formato RE-DG-001.
- Las empresas de demostración traen 14 requisitos de ejemplo tomados del capítulo 20. No reemplazan el concepto del asesor jurídico.
- **Evaluación semestral:** resultado «Cumple», «Cumple parcialmente», «No cumple» o «No aplica», con la evidencia. Parcial o no cumple exige la acción de mejora (descripción, responsable y fecha compromiso) y la abre en Calidad en la misma operación. La fecha no puede estar en el futuro.
- Un requisito que aplica y no tiene evaluación en el semestre en curso queda «Por evaluar en el semestre».
- **Aviso (decisión 8):** el trabajo diario de Calidad (6:15) avisa a Calidad y a la Dirección, una sola vez por semestre, cuando faltan 30 días o menos para cerrar el semestre y quedan requisitos sin evaluar (`qms_legal_due`).
- El normograma se descarga en CSV y la descarga queda en la auditoría.

## Acceso

| Permiso | Quién lo tiene | Para qué |
| --- | --- | --- |
| `dashboard.executive.read` | Dirección, Calidad, Auditor | Tablero gerencial |
| `dashboard.compliance.read` | Dirección, Calidad, Auditor | Tablero de cumplimiento |
| `dashboard.process.read` | Dirección, Calidad, Auditor (todo); Comercial, Líder técnico, Servicio, Finanzas, Contador, Talento humano, SST y Oficial de datos (lo propio) | Cuadro de mando |
| `qms.read` | Dirección, Calidad, Auditor | Ver y descargar el normograma y los objetivos |
| `qms.legal.manage` | Calidad | Registrar, editar y cargar el normograma |
| `qms.legal.evaluate` | Dirección, Calidad | Evaluar el cumplimiento |
| `qms.indicator.manage` | Calidad | Objetivos estratégicos y sus indicadores |

Toda ruta que escribe deja su evento de auditoría en la misma transacción. Las lecturas de los tableros no se auditan (como los demás listados).

## Rutas de la API

- `GET /v1/dashboards/executive/data` · `GET /v1/dashboards/executive/drilldown?figure=…`
- `GET /v1/dashboards/compliance/data` · `GET /v1/dashboards/compliance/drilldown?figure=…`
- `GET /v1/dashboards/scorecard/data`
- `GET|POST /v1/qms/legal-requirements` · `PATCH /v1/qms/legal-requirements/{id}` · `POST /v1/qms/legal-requirements/export` · `POST /v1/qms/legal-requirements/import`
- `GET|POST /v1/qms/legal-requirements/{id}/evaluations`
- `GET|POST /v1/qms/strategic-objectives` · `PATCH /v1/qms/strategic-objectives/{id}` · `PUT /v1/qms/strategic-objectives/{id}/indicators`
