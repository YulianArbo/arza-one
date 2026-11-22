# Calidad y mejora continua · B38 y B39

El módulo M14 gestiona procesos, contexto, riesgos, no conformidades, acciones y lecciones aprendidas (ficha 17.15). En la web está en **Calidad**. Cada persona reporta una no conformidad desde **Calidad › Reportar** y ve sus acciones en **Mi espacio**. Desde B39 también lleva el programa y las auditorías internas, los indicadores y la revisión por la dirección.

## Tablas

| Tabla | Para qué |
| --- | --- |
| `qms_processes` | Caracterización de cada proceso del organigrama: tipo (estratégico, misional, de apoyo o de evaluación), objetivo, alcance, entradas, salidas y documento en Documentos. El código, el nombre y el cargo responsable salen del núcleo: hay una sola lista de procesos. |
| `qms_context_items` | Matriz DOFA-PESTEL (FT-DG-001), por año. El factor PESTEL solo va en oportunidades y amenazas. |
| `qms_stakeholders` | Partes interesadas (FT-DG-002): necesidades, expectativas y seguimiento. |
| `qms_risks` | Riesgos y oportunidades (FT-SGC-003), `RSG-AAAA-NNNN`. La base verifica valor = probabilidad × impacto y su nivel. |
| `qms_nonconformities` | No conformidades y salidas no conformes (FT-SGC-004), `NC-AAAA-NNNN`, con su origen (`source`, `origin_id`, `origin_code`), la corrección inmediata, el análisis de causa (JSON) y la causa raíz. |
| `qms_actions` | Acciones correctivas y de mejora (FT-SGC-005), `AC-AAAA-NNNN`. Son la bitácora RE-SGC-002. |
| `qms_lessons` | Lecciones aprendidas, con su proceso y, si aplica, su no conformidad. |

| `qms_audit_programs` | Programa anual de auditorías (PL-SGC-001). Uno por año; borrador o publicado. |
| `qms_audits` | Auditorías (PL-SGC-002), `AUD-AAAA-NNNN`: proceso, auditor, fecha, lista de chequeo (RE-SGC-003, JSON), conclusiones y el PDF del informe (RE-SGC-004). Estados: programada, en ejecución, informe emitido, cerrada o cancelada. |
| `qms_findings` | Hallazgos de cada auditoría: no conformidad mayor o menor, observación u oportunidad de mejora, con su no conformidad o su acción. |
| `qms_indicators` | Ficha de cada indicador (RE-SGC-006), `IND-NNN`: proceso, fórmula, unidad, meta, sentido, frecuencia, fuente (manual o uno de los 8 cálculos automáticos) y responsable. |
| `qms_measurements` | Una medición por indicador y periodo. La manual exige análisis, evidencia y autor (la base lo verifica). |
| `qms_management_reviews` | Actas de revisión por la dirección (RE-SGC-007), `RD-AAAA-NNNN`: entradas precargadas y decisiones en JSON, conclusiones, aprobación y PDF. Aprobada, la base no deja cambiarla. |

Todas llevan `tenant_id` y RLS. Las crean las migraciones `20261122000000_qms_quality_processes_risks_actions` (B38) y `20261123000000_qms_audits_indicators_reviews` (B39). Esta última agrega a `qms_actions` los orígenes «hallazgo de auditoría» y «revisión por la dirección».

## Reglas

- **Riesgos (decisión 9).** Probabilidad e impacto de 1 a 5. Valor hasta 4: bajo; hasta 9: moderado; hasta 16: alto; desde 17: crítico. Un riesgo se acepta, mitiga, transfiere o evita; una oportunidad se aprovecha. La lista marca los que ya debían revisarse. La escala está **por validar** frente a FT-SGC-003.
- **No conformidad (ficha 17.15).** Pasa por detectada → contenida → en análisis → con plan → verificada → cerrada eficaz o reabierta.
  - **Contener** exige la corrección inmediata, la clasificación (salida no conforme, no conformidad menor o mayor; decisión 6) y el proceso.
  - **Analizar** exige el método (cinco porqués o espina de pescado con las 6M; decisión 7) y la causa raíz.
  - **Con plan** exige al menos una acción abierta o ejecutada.
  - Queda **verificada** sola cuando todas sus acciones resultan eficaces. La Dirección o Calidad la **cierra** como eficaz o la **reabre** con el motivo.
  - Una acción **no eficaz** reabre la no conformidad, que vuelve a análisis.
- **Origen enlazado.**
  - Una queja o un reclamo **procedente** abre su no conformidad en la misma operación que aprueba la respuesta (decisión 4). La descripción lleva el tipo y el radicado de la PQRSF, nunca los datos de quien se quejó.
  - Calidad abre la no conformidad de un **incidente de SST** desde el formulario de reporte (decisión 5). Las acciones de la investigación siguen en SST.
  - Un mismo origen abre a lo sumo una no conformidad (índice único).
  - El origen «auditoría» queda listo para B39.
- **Acciones.** Calidad las registra con responsable y fecha compromiso (no en el pasado) y las ajusta mientras están abiertas. La de una no conformidad es correctiva; las de un riesgo o una mejora son de mejora.
  - El responsable (o Calidad) la marca **ejecutada** con la nota de evidencia y, si quiere, un archivo de Archivos.
  - La **eficacia** la verifica alguien con permiso que no sea el responsable ni quien la ejecutó (decisión 8). La API responde 403 `QMS_SELF_VERIFICATION` y la base lo impide también.
- **Bitácora RE-SGC-002 (decisión 10).** Columnas: código, fecha de apertura, origen, código del origen, proceso, hallazgo, causa raíz, acción, tipo, responsable, fecha compromiso, fecha de ejecución, estado, verificó, fecha de verificación, resultado y observaciones. Se descarga en CSV para Excel (UTF-8, punto y coma) y la descarga queda en la auditoría. Columnas **por validar** frente al formato RE-SGC-002.
- **Escalamiento (decisión 11).** Una acción abierta cuya fecha compromiso ya pasó avisa a su responsable, a Calidad y a la Dirección (`qms_action_overdue`). El aviso se repite cada 7 días mientras siga abierta.
- **Lecciones.** Las registra Calidad y las lee todo el personal interno.

### Auditorías, indicadores y revisión por la dirección (B39)

- **Programa (decisión 4).** Calidad crea el programa del año y lo publica; no lleva aprobación aparte.
- **Auditor independiente (decisiones 1 y 2).** Cualquier colaborador puede ser auditor y ejecuta solo lo que le asignaron. No audita el proceso donde está su cargo (o uno superior) ni el que su cargo dirige: la API responde 403 `QMS_AUDITOR_OWN_PROCESS` al programar, al reprogramar y otra vez al iniciar.
- **Pasos de la auditoría.** Programada → en ejecución (lista de chequeo y hallazgos) → informe emitido → cerrada; se cancela antes del informe con el motivo.
- **Hallazgos (decisión 3).** Al emitir el informe, cada no conformidad mayor o menor abre su no conformidad con origen «auditoría interna» y el código de la auditoría. Una observación u oportunidad de mejora puede volverse una acción de mejora (una por hallazgo).
- **Indicadores (decisiones 6 a 8).** Ocho fuentes automáticas: acciones eficaces, acciones ejecutadas a tiempo, no conformidades abiertas, cumplimiento del programa de auditorías, tiquetes dentro del plazo acordado, PQRSF a tiempo, satisfacción de las encuestas e incidentes de SST. Sin datos que dividir no hay medición (nunca un 0 % inventado). Cumple según la meta y el sentido; la tendencia compara con la medición anterior. Con mediciones tomadas no cambian la frecuencia ni la fuente.
- **Matriz RE-SGC-006 (decisión 10).** Columnas: proceso, código, indicador, objetivo, fórmula, unidad, meta, frecuencia, fuente, responsable, último periodo, resultado, cumple, tendencia y análisis. Se descarga en CSV; la descarga queda en la auditoría. **Por validar** con el formato.
- **Revisión por la dirección (decisiones 5 y 9).** Calidad crea el acta y pulsa «Precargar entradas»: acciones de revisiones anteriores, contexto del año, satisfacción y PQRSF, indicadores, no conformidades y acciones, auditorías y riesgos altos o críticos. Proveedores, recursos y oportunidades de mejora se escriben a mano. La envía a la Dirección, que la devuelve con el motivo o la aprueba; al aprobarse, cada decisión se vuelve una acción de mejora, el acta queda fija y su PDF se genera.
- **Cifras de Servicio.** Servicio ya usa a Calidad (B38), así que Calidad no importa a Servicio: declara lo que necesita (`SERVICE_FIGURES` en `qms/application/service-figures.ts`) y Servicio se lo entrega con un módulo global; el worker se lo pasa directamente. SST entrega el número de incidentes por su `index.ts`.

## Acceso

| Permiso | Quién lo tiene | Para qué |
| --- | --- | --- |
| `qms.read` | Dirección, Calidad, Auditor | Ver procesos, contexto, riesgos, no conformidades y la bitácora |
| `qms.lesson.read` | Todo rol interno | Ver las lecciones aprendidas |
| `qms.nonconformity.create` (solo lo propio) | Todo colaborador; Calidad sin límite | Reportar y ver las no conformidades que reportó |
| `qms.action.manage` (solo lo propio) | Todo colaborador; Calidad sin límite | Ver y ejecutar sus acciones; Calidad las registra y edita |
| `qms.process.manage` | Calidad | Procesos, contexto, partes interesadas y lecciones |
| `qms.risk.manage` | Calidad | Riesgos y oportunidades |
| `qms.nonconformity.manage` | Calidad | Contener, analizar, registrar el plan y enlazar un incidente de SST |
| `qms.nonconformity.close` · `qms.action.verify` | Dirección, Calidad | Cerrar o reabrir y verificar eficacia |
| `qms.audit.plan` | Calidad | Programa, programar, cerrar y cancelar auditorías |
| `qms.audit.execute` (solo lo propio) | Todo colaborador; Calidad sin límite | Ejecutar las auditorías que le asignaron |
| `qms.indicator.manage` | Calidad | Fichas de indicadores y «Calcular ahora» |
| `qms.indicator.measure` (solo lo propio) | Todo colaborador; Calidad sin límite | Medir y analizar los indicadores a su cargo |
| `qms.review.manage` | Calidad | Preparar y enviar el acta |
| `qms.review.approve` | Dirección (solo) | Devolver o aprobar el acta (B39, permiso nuevo: 215 en total) |

Toda ruta que escribe deja su evento de auditoría en la misma transacción.

## Avisos

`qms_nonconformity_reported` (a Calidad), `qms_action_assigned` (al responsable), `qms_action_to_verify` (a Calidad, menos el responsable) y `qms_action_overdue` (responsable, Calidad y Dirección). Desde B39: `qms_audit_assigned` (al auditor), `qms_indicator_due` (al responsable de un indicador manual sin medir, desde el día 5) y `qms_review_to_approve` (a la Dirección). El aviso anterior de la PQRSF procedente para Calidad se reemplazó por `qms_nonconformity_reported`.

## Trabajo diario

El trabajo `qms.daily-work` corre a las 6:15 y recorre solo las empresas con acciones vencidas sin escalar en los últimos 7 días (función `qms_tenants_with_overdue_actions`).

`qms.indicator-work` corre a las 6:30: calcula los indicadores automáticos del periodo que cerró (si no hay datos, lo intenta al día siguiente) y avisa una vez por periodo los manuales sin medir. `qms.pdf-work` corre cada 30 segundos y genera el PDF del informe de cada auditoría emitida y del acta aprobada (con el encabezado institucional, en Gotenberg).
