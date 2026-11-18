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
