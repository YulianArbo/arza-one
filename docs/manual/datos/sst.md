# Seguridad y salud en el trabajo · B37

El módulo M13 ejecuta y evidencia el SG-SST (ficha 17.14). En la web está en **Talento y SST › Seguridad y salud**; cada colaborador lo usa desde **Mi espacio** y reporta en **Mi espacio › Reportar a SST** (`/app/mi-espacio/reportar`). Nunca se registran diagnósticos.

## Tablas

| Tabla | Para qué |
| --- | --- |
| `sst_hazards` | Matriz de peligros con la GTC 45. La base verifica NP = ND × NE, NR = NP × NC y el nivel I a IV. |
| `sst_work_plan_items` | Plan anual. Una actividad solo queda hecha con su evidencia (`evidence_file_id`). |
| `sst_incidents` | Incidentes y accidentes (`SST-AAAA-NNNN`). El accidente lleva `arl_due_on`: dos días hábiles después del hecho, con el calendario de festivos. |
| `sst_investigations` · `sst_investigation_actions` | Equipo, causas, conclusión y acciones con responsable y fecha. Las acciones viven aquí hasta que exista Calidad (B38). |
| `sst_unsafe_reports` | Actos y condiciones inseguras (`RPT-AAAA-NNNN`). |
| `sst_inspections` | Inspecciones de instalaciones, emergencias y puesto en casa, con las respuestas de su lista de chequeo. |
| `sst_medical_exams` | Concepto de aptitud, restricciones cifradas y próxima fecha. |
| `sst_ppe_deliveries` | Entregas de elementos de protección y la confirmación del colaborador. |
| `sst_committee_members` · `sst_committee_minutes` | Integrantes del COPASST (o Vigía) y del Comité de Convivencia; actas con el resumen cifrado. |
| `sst_coexistence_complaints` | Quejas de convivencia (`CCL-AAAA-NNNN`) con los hechos y la gestión cifrados. |
| `sst_standards_assessments` | Un registro por estándar y año de la autoevaluación (Resolución 0312 de 2019). |

Todas llevan `tenant_id` y RLS, y las crea la migración `20261121000000_sst_safety_and_health`.

## Reglas

- **Reporte desde el celular.** Pide tres datos (qué pasa, dónde y una foto opcional) y en un accidente, quién se lesionó. La foto se sube a Archivos y solo se usa cuando el antivirus la deja «Disponible». El reporte no es anónimo, pero solo lo ve SST. SST recibe el aviso `sst_report_received`.
- **ARL.** Solo los accidentes se reportan a la ARL. SST recibe la alerta `sst_arl_due` al reportarse el accidente y cada día a las 6:00 hasta que registra la fecha y el radicado del FURAT. Un accidente sin ese reporte no se cierra.
- **Investigación.** El incidente pasa por reportado → en investigación → con plan de acción → cerrado. El plan exige causas inmediatas, causas raíz y al menos una acción. Cada responsable recibe el aviso `sst_task_assigned` y ve su acción en Mi espacio. El incidente se cierra cuando todas las acciones están hechas.
- **Matriz de peligros.** Usa la GTC 45: SST elige los niveles de deficiencia, exposición y consecuencia, y la plataforma calcula el nivel de riesgo y su aceptabilidad. Los valores están por validar con el profesional de SST con licencia.
- **Plan anual.** Muestra el cumplimiento del año (hechas sobre el total) y el cumplimiento a la fecha (hechas sobre las que ya vencieron; sin nada vencido, 100 %). El responsable de una actividad vencida recibe un aviso.
- **Inspecciones.** Las listas de chequeo son los catálogos `sst_check_facility`, `sst_check_home` y `sst_check_emergency`, y se editan en Administración › Catálogos. Cada respuesta guarda la pregunta tal como estaba ese día. En la autoinspección del puesto en casa no se pide la dirección exacta.
- **Salud.** Solo se guarda el concepto (apto, apto con restricciones, aplazado o no apto), las restricciones y la próxima fecha (Resolución 2346 de 2007). Las restricciones van cifradas con `FIELD_ENCRYPTION_KEY`, no salen en la lista ni en la auditoría, y cada consulta queda registrada (`sst.medical.read`, `sst.medical.read_own`).
  - Las ven SST y la propia persona.
  - SST recibe el aviso `sst_exam_due` una vez, 30 días antes de la próxima evaluación.
  - El examen de ingreso da por hecha la tarea de inducción «evaluación médica» de Talento humano, y el de egreso, el ítem del retiro.
- **Elementos de protección.** El catálogo es `sst_ppe_items`. SST registra la entrega y el colaborador confirma el recibo desde Mi espacio.
- **Comités.** SST registra a los integrantes y sus periodos; el periodo incluye su último día.
  - Las actas del COPASST las ven sus integrantes y quien tiene `sst.committee.read`.
  - Las actas y las quejas del Comité de Convivencia solo las ven y gestionan sus **integrantes vigentes**. Ningún rol da ese acceso: ni SST, ni la Dirección, ni el administrador lo tienen si no integran el comité.
  - Cada lectura de lo de Convivencia queda registrada.
  - El aviso `sst_complaint_received` no lleva el contenido de la queja.
- **Estándares mínimos.** La tabla de 60 estándares con sus pesos suma 100 puntos (`packages/contracts/src/sst/standards-table.ts`). «Cumple» y «No aplica» con justificación suman el peso; «No cumple» exige una acción de mejora y suma 0. Menos de 60 puntos es crítico; de 60 a 85, moderadamente aceptable; más de 85, aceptable. La tabla está por validar contra RE-SST-003.

## Acceso

| Permiso | Quién lo tiene | Para qué |
| --- | --- | --- |
| `sst.read` | Dirección, Calidad, Talento humano, SST, Auditor | Ver el módulo, sin datos de salud ni de convivencia |
| `sst.incident.report` (solo lo propio) | Todo colaborador y SST | Reportar, Mi espacio, quejas, actas (con la regla de integrantes) |
| `sst.hazard.manage` · `sst.plan.manage` · `sst.incident.investigate` · `sst.inspection.manage` · `sst.committee.manage` · `sst.ppe.manage` | SST | Gestionar cada parte |
| `sst.incident.close` · `sst.standards.manage` | SST | Cerrar incidentes y evaluar estándares |
| `sst.medical.read` · `sst.medical.manage` | SST | Conceptos de aptitud |

Toda ruta que escribe deja su evento de auditoría en la misma transacción.

## Trabajo diario

El trabajo `sst.daily-work` corre a las 6:00 y recorre solo las empresas que tienen alertas pendientes: accidentes sin reportar, evaluaciones por vencer sin aviso y actividades del plan vencidas sin aviso.
