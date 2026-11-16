# Talento Humano · B35

El módulo administra vacantes, selección de candidatos, contratos laborales, vinculación y expedientes de ingreso. El recorrido en la web está en **Talento y SST**.

## Selección

Talento Humano registra una vacante para un cargo activo. Una candidatura exige la autorización de selección publicada y vigente. Cada candidatura pasa por postulación, preselección, evaluación y selección. Al descartar, el sistema programa el vencimiento a los doce meses.

El trabajo `hr.retention` revisa las candidaturas vencidas diariamente. Anonimiza las identidades creadas exclusivamente para selección y retira las notas de evaluación. Conserva el registro anónimo de la candidatura y la constancia inmutable de autorización. Al registrar la autorización de selección, el sistema omite la dirección IP y el agente del navegador de quien diligencia el formulario. Una autorización vigente del banco de talento conserva la candidatura. Los casos con archivos adjuntos o una identidad que tiene otro uso requieren gestión documental o revisión de la finalidad antes de eliminar el soporte.

## Contrato y vinculación

Talento Humano carga el PDF en **Archivos** y espera el resultado del antivirus. Después selecciona el PDF disponible y a la persona de Dirección que firmará. Primero firma la persona seleccionada mediante el enlace de su correo. Dirección abre la ficha laboral, revisa el documento y firma con verificación reciente.

El sistema habilita la vinculación cuando el PDF firmado está sellado. Vincular crea la cuenta interna y la invitación, registra la fecha de ingreso, emite `employee.hired` y abre las tareas de inducción, evaluación médica de ingreso y asignación de equipo. El expediente se inicia con 13 ítems. La evaluación médica registra la realización de la tarea. El concepto de aptitud corresponde al módulo de SST.

## Acceso y auditoría

- Las vacantes y candidaturas exigen `hr.vacancy.manage` y `hr.candidate.manage`, respectivamente.
- La ficha aplica `hr.employee.read` y limita las consultas a la cuenta propia cuando el permiso tiene ese alcance. El expediente exige `hr.file.read`. El valor exacto del salario exige `hr.salary.read`.
- La firma de la empresa se limita a la persona de Dirección designada. La descarga del PDF se entrega mediante un enlace temporal a Talento Humano o a la persona designada para la firma.
- Las escrituras quedan auditadas dentro de la transacción. Las modificaciones de vacantes, candidaturas, expedientes y tareas controlan la versión con `If-Match`.
