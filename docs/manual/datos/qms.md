# Calidad y mejora continua · B38

El módulo M14 gestiona procesos, contexto, riesgos, no conformidades, acciones y lecciones aprendidas (ficha 17.15). En la web está en **Calidad**. Cada persona reporta una no conformidad desde **Calidad › Reportar** y ve sus acciones en **Mi espacio**. Las auditorías, los indicadores y la revisión por la dirección llegan con B39.

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

Todas llevan `tenant_id` y RLS, y las crea la migración `20261122000000_qms_quality_processes_risks_actions`.

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

Toda ruta que escribe deja su evento de auditoría en la misma transacción.

## Avisos

`qms_nonconformity_reported` (a Calidad), `qms_action_assigned` (al responsable), `qms_action_to_verify` (a Calidad, menos el responsable) y `qms_action_overdue` (responsable, Calidad y Dirección). El aviso anterior de la PQRSF procedente para Calidad se reemplazó por `qms_nonconformity_reported`.

## Trabajo diario

El trabajo `qms.daily-work` corre a las 6:15 y recorre solo las empresas con acciones vencidas sin escalar en los últimos 7 días (función `qms_tenants_with_overdue_actions`).
