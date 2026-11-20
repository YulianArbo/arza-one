# Talento Humano · B35

El módulo administra vacantes, selección de candidatos, contratos laborales, vinculación y expedientes de ingreso. El recorrido en la web está en **Talento y SST**.

## Selección

Talento Humano registra una vacante para un cargo activo. Una candidatura exige la autorización de selección publicada y vigente. Cada candidatura pasa por postulación, preselección, evaluación y selección. Al descartar, el sistema programa el vencimiento a los doce meses.

Al registrar la candidatura se marca si el candidato autorizó conservar su hoja de vida para futuros procesos (banco de hojas de vida). Al registrar la autorización de selección, el sistema omite la dirección IP y el agente del navegador de quien diligencia el formulario.

El trabajo `hr.retention` corre cada noche (4:00) y elimina los datos de toda candidatura descartada cuya fecha de eliminación llegó (decisiones B y C del 17/11/2026):

- La hoja de vida queda eliminada (`doc_files.deleted_at`), pierde su nombre y se borra del almacenamiento; ninguna descarga la encuentra. Si ya hace parte de la historia laboral de un colaborador, se conserva.
- Las notas y el evaluador de las evaluaciones de selección se borran.
- La persona de Terceros se anonimiza si solo existía para esa candidatura. Si también es cliente, proveedor, contacto, colaborador, tiene cuenta o su autorización tiene soporte firmado, su ficha se conserva y solo pierde el papel de candidato. Si tiene otra candidatura vigente, no se toca.
- Queda el rastro anónimo de la candidatura (vacante, origen, etapas y fechas) y la constancia inmutable de la autorización.

El banco de hojas de vida no conserva los datos indefinidamente: Talento humano puede aplazar la eliminación doce meses (`POST /v1/hr/candidates/{id}/actions/extend-retention`), solo si el candidato lo autorizó. Cada aplazamiento queda en la auditoría (`hr.candidate.extend_retention`).

## Contrato y vinculación

Talento Humano carga el PDF en **Archivos** y espera el resultado del antivirus. Después selecciona el PDF disponible y a la persona de Dirección que firmará. Primero firma la persona seleccionada mediante el enlace de su correo. Dirección abre la ficha laboral, revisa el documento y firma con verificación reciente.

El sistema habilita la vinculación cuando el PDF firmado está sellado. Vincular crea la cuenta interna y la invitación, registra la fecha de ingreso, emite `employee.hired` y abre las tareas de inducción, evaluación médica de ingreso y asignación de equipo. El expediente se inicia con 13 ítems. La evaluación médica registra la realización de la tarea. El concepto de aptitud corresponde al módulo de SST.

Cada tarea de inducción tiene su responsable (decisión 6):

| Tarea | Responsable |
| --- | --- |
| Evaluación médica de ingreso · Inducción en SST | Primera persona activa con el rol SST |
| Asignación de equipo y activos | Primera persona activa con el rol Administrativo y financiero |
| Entrenamiento en el cargo | Quien ocupa el cargo superior en el organigrama |
| Afiliaciones · Inducción institucional | Quien vincula |

Si no hay nadie con ese rol o cargo, responde quien vincula. El evento `employee.hired` lleva las tareas (sin datos personales) y cada responsable recibe el aviso `hr_onboarding_task`; quien vincula no recibe aviso de sus propias tareas. Talento humano marca las tareas como hechas.

## Acceso y auditoría

- Las vacantes y candidaturas exigen `hr.vacancy.manage` y `hr.candidate.manage`, respectivamente.
- La ficha aplica `hr.employee.read` y limita las consultas a la cuenta propia cuando el permiso tiene ese alcance. El expediente exige `hr.file.read`. El valor exacto del salario exige `hr.salary.read`.
- La firma de la empresa se limita a la persona de Dirección designada. La descarga del PDF se entrega mediante un enlace temporal a Talento Humano o a la persona designada para la firma.
- Las escrituras quedan auditadas dentro de la transacción. Las modificaciones de vacantes, candidaturas, expedientes y tareas controlan la versión con `If-Match`.

# Talento Humano · B36: novedades, desempeño y retiro

Segunda parte del módulo (ficha 17.13). En la web: **Mi espacio** (todo colaborador), **Mi equipo**
(jefes inmediatos) y, dentro de **Talento y SST**, las páginas de ausencias, novedades de nómina,
desempeño y formación, procesos disciplinarios y retiros.

## Reglas laborales (parámetro con vigencia)

Se cambian en Organización › Parámetros › «Reglas laborales». Valores iniciales aprobados
(decisiones 4, 5 y 8 del 19/11/2026), **por validar con Talento humano y el RIT-001**:

| Regla | Valor inicial |
| --- | --- |
| Jornada semanal | 40 horas |
| Horas extras por día / por semana | 2 / 12 |
| Vacaciones por año trabajado | 15 días hábiles |
| Días hábiles entre citación y descargos | 3 |

## Permisos, licencias y vacaciones

- El colaborador ve su saldo (días ganados desde el ingreso, en proporción, menos los usados o
  solicitados) y solicita desde **Mi espacio**. No puede pedir más vacaciones de las disponibles.
- Decide su **jefe inmediato** según el organigrama (quien ocupa el cargo al que reporta). Si no
  hay jefe, decide Talento humano. Talento humano y la Dirección también pueden decidir. Nadie
  decide lo propio. Rechazar exige motivo.
- Estados: radicada → aprobada o rechazada → disfrutada. Mientras está radicada, el colaborador la
  retira. El paso a «disfrutada» lo hace el trabajo diario al terminar la ausencia.
- Las vacaciones se cuentan en días hábiles (horario y festivos de la empresa); las licencias e
  incapacidades, en días calendario.
- Tipos en la lista editable «Tipos de ausencia» (`hr_leave_types`). La incapacidad solo la
  registra Talento humano, sin diagnóstico. Talento humano también registra las vacaciones
  anticipadas; lo que registra queda aprobado.

## Horas extras

Se piden **antes** de trabajarlas (hoy o después), con su clase (diurna, nocturna, dominical o
festiva) y su motivo. Al pedirlas y al autorizarlas se revisan los topes del día y de la semana
(lunes a domingo). Después del día, el colaborador reporta las horas trabajadas, nunca más de las
autorizadas, y la novedad llega a nómina. La plataforma no calcula valores en pesos.

## Novedades de nómina

- Una por mes y por concepto. Llegan solas: ausencias aprobadas (repartidas por mes si cruzan
  dos), horas extras reportadas y retiros. Talento humano registra las demás (bonificación,
  auxilio, descuento, ingreso, otra).
- Conceptos en la lista «Conceptos de novedades de nómina» (`hr_novelty_concepts`), **por validar
  contra RE-GTH-003**, que no está en el repositorio.
- **Cerrar el mes** (Talento humano o Dirección) es definitivo: ninguna novedad cambia y lo que
  llegue tarde va al mes siguiente. Solo de un mes cerrado se descarga el archivo CSV para el
  software de nómina (documento, colaborador, concepto, cantidad, unidad, valor, fechas, origen).

## Desempeño, formación y bienestar

- Talento humano o el jefe fija hasta cuatro objetivos con pesos que suman 100 %. El jefe califica
  cada objetivo de 1 a 5; la nota es el promedio ponderado. El colaborador la acepta con un
  comentario opcional. Una evaluación por colaborador y periodo.
- Formación (código FOR-AAAA-NNNN): capacitación, inducción, reinducción o bienestar, con sus
  convocados; después, asistencia y calificación de 1 a 5 por persona y la lista firmada.

## Proceso disciplinario (información restringida)

- Solo Talento humano (`hr.disciplinary.manage`). Código DIS-AAAA-NNNN.
- Pasos en orden: apertura con los hechos → citación (la diligencia, al menos 3 días hábiles
  después) → descargos con el acta firmada → decisión motivada (llamado de atención, suspensión
  de 1 a 60 días, terminación con justa causa o archivo).
- Hechos, descargos y motivación van **cifrados** en la base. Ver el caso completo queda
  registrado en la auditoría (`hr.disciplinary.read`); nada de esto sale en exportaciones.
- El colaborador recibe un aviso de citación sin el contenido y, en **Mi espacio**, ve la
  citación, los hechos y la decisión de su caso (no el resumen de descargos). Su consulta también
  queda registrada.

## Retiro y paz y salvo

- Talento humano registra motivo y último día laborado. La lista de chequeo reparte:
  devolución de activos y paz y salvo financiero (Administrativo y financiero), examen de egreso
  (SST), liquidación enviada a nómina, entrevista de retiro y certificado laboral (Talento humano).
  Cada responsable recibe un aviso y marca su ítem en **Mi espacio**.
- Los activos por devolver vienen de Activos; su ítem no se marca mientras quede alguno.
- Al terminar el último día (medianoche, trabajo diario de las 0:05) la cuenta queda **inactiva**
  y se cierran todas sus sesiones; si el último día ya pasó al registrarlo, ocurre en el acto. El
  colaborador queda «Retirado», se anota la novedad `RETIRO` y se emite `employee.terminated`.
- Se anula solo mientras la cuenta sigue activa. El **paz y salvo** se emite con la lista
  completa, sin activos y con la cuenta ya desactivada.

## Mi espacio y Mi equipo

- **Mi espacio**: datos laborales, banda salarial (nunca el valor), descarga del contrato
  firmado, saldo de vacaciones, solicitudes, horas extras, evaluaciones, formación, novedades,
  citaciones y tareas de inducción o retiro a cargo (decisiones 11 y 12).
- **Mi equipo**: el equipo directo con su saldo, las ausencias y horas extras por decidir y las
  evaluaciones por calificar.

## Tablas y avisos

Tablas: `hr_leave_requests`, `hr_overtime`, `hr_payroll_periods`, `hr_payroll_novelties`,
`hr_performance_reviews`, `hr_trainings`, `hr_training_attendance`, `hr_disciplinary_cases` y
`hr_offboardings` (migración `20261117000000_hr_novelties_performance_offboarding`), todas con
`tenant_id` y seguridad por fila. Avisos nuevos: `hr_leave_update`, `hr_overtime_update`,
`hr_review_update`, `hr_disciplinary_notice` y `hr_offboarding_task`. Motivo nuevo de cierre de
sesión: `offboarding`.
