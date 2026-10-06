# 17. Especificación funcional por módulo

Cada ficha indica el objetivo del módulo, los documentos del SGC que ejecuta, sus funciones, los estados del flujo principal, las reglas de negocio que el código debe hacer cumplir y los criterios con los que se acepta. Los criterios de aceptación generales del capítulo 21 aplican a todos.

## 17.1 M00 Núcleo: empresa, organización, catálogos y consecutivos

**Objetivo:** Mantener los datos maestros de la empresa sobre los que se apoyan todos los módulos.

**Documentos del SGC que ejecuta:** DC-DG-001, DC-SGC-001, MP-DG-001, MN-GTH-003.

**Funciones**

- Datos legales de la empresa, sedes y logotipo para los documentos generados.

- Mapa de procesos, áreas y cargos con su jerarquía, enlazados al manual de funciones de cada cargo.

- Centros de costo, catálogos administrables y festivos.

- Consecutivos de negocio por tipo de registro y año.

- Parámetros versionados con fecha de vigencia (plazos, topes de aprobación, tarifas, horario laboral).

**Reglas de negocio**

- Un parámetro nunca se sobrescribe: se crea una nueva vigencia y la anterior se conserva.

- Un cargo o proceso con registros asociados no se elimina; se inactiva.

- El horario laboral parametrizado es de lunes a viernes, 40 horas semanales, y gobierna vencimientos y notificaciones.

**Criterios de aceptación**

- El organigrama mostrado coincide con DC-SGC-001.

- Dos usuarios que piden un consecutivo al mismo tiempo reciben números distintos y contiguos.

- Cambiar un parámetro deja evento de auditoría con valor anterior y nuevo.

## 17.2 M01 Identidad y control de acceso

**Objetivo:** Garantizar que cada persona es quien dice ser y que solo hace lo que su rol y su contexto permiten.

**Documentos del SGC que ejecuta:** MN-DG-002 (política de seguridad de la información), PR-TEC-004, PR-GTH-001 y PR-GTH-005.

**Funciones**

- Invitación, activación, bloqueo y retiro de usuarios.

- Inicio de sesión con segundo factor, recuperación de contraseña, gestión de sesiones y dispositivos.

- Roles, permisos y condiciones; asignación con vigencia; delegación temporal de aprobaciones.

- Revisión trimestral de accesos con informe para la Dirección.

- Alertas de seguridad.

**Flujo y estados**

Usuario: invitado → activo → bloqueado → inactivo.

**Reglas de negocio**

- Las reglas del numeral 15.1 son obligatorias.

- Los roles del sistema no se editan; los ajustes se hacen en roles personalizados.

- Nadie puede asignarse permisos a sí mismo ni aprobar su propio cambio de rol.

- El retiro de un colaborador inactiva su cuenta automáticamente el último día.

**Criterios de aceptación**

- Un usuario sin segundo factor configurado no entra a la aplicación interna.

- Cinco intentos fallidos bloquean la cuenta y generan evento de seguridad.

- Un usuario del rol EQUIPO_PROYECTO recibe 404 al consultar un proyecto ajeno.

- El informe de revisión de accesos lista usuarios, roles, último ingreso y cuentas sin uso en 60 días.

## 17.3 M02 Terceros

**Objetivo:** Tener un único registro de cada persona u organización con la que la empresa se relaciona.

**Documentos del SGC que ejecuta:** FT-COM-003, FT-FIN-007, IN-FIN-003, PR-ADM-001.

**Funciones**

- Ficha única de persona u organización con sus papeles: cliente, proveedor, colaborador, contacto, candidato.

- Contactos, firmantes autorizados y cuentas bancarias.

- Conocimiento del tercero y nivel de riesgo.

- Línea de tiempo con todo lo ocurrido con el tercero en cualquier módulo.

- Detección y fusión de duplicados.

**Flujo y estados**

Tercero: prospecto → activo → inactivo → bloqueado.

**Reglas de negocio**

- El tipo y número de identificación son únicos por empresa; el NIT valida su dígito de verificación.

- No se factura ni se contrata con un tercero sin el formato de conocimiento aprobado.

- Las cuentas bancarias se guardan cifradas y su cambio exige aprobación de un segundo usuario.

- Todo dato personal se registra con su finalidad y su autorización (M18).

**Criterios de aceptación**

- Intentar crear un tercero con identificación repetida ofrece abrir el existente.

- La fusión de duplicados conserva el historial de ambos y queda auditada.

- La línea de tiempo muestra solo lo que el rol puede ver.

## 17.4 M03 Gestión documental y control de documentos del SGC

**Objetivo:** Controlar la creación, aprobación, publicación, consulta, conservación y disposición de todos los documentos y registros, y convertir los formatos en formularios digitales.

**Documentos del SGC que ejecuta:** PR-SGC-001, PR-SGC-002, FT-SGC-001, FT-SGC-002, RE-SGC-001, RE-SGC-005.

**Funciones**

- Listado Maestro en línea: código, nombre, tipo, proceso, versión, fecha, estado y responsable, siempre actualizado.

- Ciclo de vida del documento con Solicitud de Acción Documental, revisión, aprobación y publicación.

- Versionado con huella de integridad, vista previa, comparación de versiones y constancia de lectura.

- Expedientes por cliente, contrato, proyecto, colaborador y proveedor.

- Formatos digitales: diseñador de formularios a partir de los FT, diligenciamiento, flujo de aprobación y generación del PDF con la plantilla institucional.

- Plantillas de salida para cotizaciones, contratos, actas y certificados.

- Tabla de retención, propuesta mensual de disposición y acta de eliminación.

- Búsqueda de texto completo respetando permisos.

**Flujo y estados**

Versión: borrador → en revisión → aprobada → vigente → obsoleta. Solicitud documental: radicada → en análisis → aprobada o rechazada → ejecutada.

**Reglas de negocio**

- La codificación sigue PR-SGC-001: TIPO-PROCESO-NNN, sin saltos en el consecutivo.

- Solo existe una versión vigente por documento; al publicar una nueva, la anterior pasa a obsoleta y deja de ser descargable para los usuarios.

- Quien elabora no aprueba.

- Un documento vigente es inmutable; cualquier cambio exige nueva versión y Solicitud de Acción Documental.

- Los documentos generados o descargados llevan pie con código, versión, fecha y la leyenda «copia no controlada» cuando se imprimen.

- Un registro diligenciado guarda la versión del formato con la que se creó.

- Nada se elimina sin regla de retención vencida y aprobación del responsable.

**Criterios de aceptación**

- El Listado Maestro en la plataforma coincide con RE-SGC-001 tras la carga inicial: 251 documentos vigentes.

- Publicar una versión notifica a los cargos destinatarios y registra quién confirmó lectura.

- Un formato digital produce un PDF con el encabezado institucional idéntico al del documento original.

- La descarga de un documento confidencial queda en doc_access_log.

- Alterar un archivo en el almacenamiento hace fallar la verificación de su huella.

## 17.5 M04 Flujos, tareas y notificaciones

**Objetivo:** Dar a todos los módulos un mismo mecanismo de estados, aprobaciones, vencimientos y avisos.

**Documentos del SGC que ejecuta:** Todos los procedimientos; PT-GTH-001 para el horario de notificación.

**Funciones**

- Definición de flujos por tipo de registro: estados, transiciones, permisos, condiciones y plazos.

- Bandeja única «Mis tareas» con vencimientos y prioridad.

- Aprobaciones en serie o en paralelo, delegación y escalamiento.

- Centro de avisos, correo con plantillas institucionales y preferencias por usuario.

- Comentarios, menciones y adjuntos en cualquier registro.

**Flujo y estados**

Tarea: pendiente → en curso → completada, vencida o cancelada.

**Reglas de negocio**

- Una transición no definida en el flujo es imposible, también por la API.

- Los plazos se calculan en días y horas hábiles según el calendario.

- Los avisos no urgentes a colaboradores fuera de la jornada se difieren al siguiente día hábil; las excepciones están parametrizadas y documentadas.

- Cambiar la definición de un flujo crea una nueva versión; los registros en curso terminan con la versión con la que iniciaron.

**Criterios de aceptación**

- Una tarea vencida escala al jefe inmediato y queda visible en el tablero.

- Un aviso generado un sábado para un colaborador se entrega el lunes a las 8:00 a. m.

- El historial del flujo muestra actor, fecha, decisión y comentario de cada paso.

## 17.6 M05 Comercial: CRM y cotizaciones

**Objetivo:** Gestionar la relación comercial desde el primer contacto hasta la cotización aceptada.

**Documentos del SGC que ejecuta:** PR-COM-001, PR-COM-002, PL-COM-001, FT-COM-001, FT-COM-002, RE-COM-001, FT-INN-003.

**Funciones**

- Captura de contactos desde el sitio público, por carga manual o importación.

- Embudo de oportunidades por etapas con valor, probabilidad y fecha esperada.

- Actividades y recordatorios.

- Portafolio de servicios con tarifas vigentes.

- Cotización con ítems, descuentos, impuestos, condiciones y vigencia; versiones; PDF con la plantilla FT-COM-001; envío y aceptación en línea.

- Revisión de requisitos y acta de arranque antes de comprometerse.

- Renovaciones y seguimiento posventa.

**Flujo y estados**

Lead: nuevo → calificado → convertido o descartado. Oportunidad: prospección → diagnóstico → propuesta → negociación → ganada o perdida. Cotización: borrador → en aprobación → enviada → aceptada, rechazada o vencida.

**Reglas de negocio**

- Todo contacto captado guarda la autorización de tratamiento y la finalidad.

- Una cotización con descuento superior al tope parametrizado exige aprobación de la Dirección.

- Una cotización enviada no se edita: se crea una nueva versión.

- No se acepta una cotización vencida.

- Los impuestos se calculan con los parámetros tributarios vigentes validados por el Contador.

- Los mensajes comerciales respetan las preferencias de contacto y los horarios de la Ley 2300 de 2023.

- Una oportunidad perdida exige motivo.

**Criterios de aceptación**

- Un formulario del sitio crea el lead, la tarea de contacto y el acuse al visitante.

- El total de la cotización coincide con el cálculo manual al centavo en diez casos de prueba.

- El cliente acepta la cotización desde un enlace y queda evidencia de fecha, dirección IP y versión aceptada.

- El informe del embudo coincide con RE-COM-001.

## 17.7 M06 Contratos y firma electrónica

**Objetivo:** Elaborar, aprobar, firmar, vigilar y archivar los contratos con plena validez probatoria.

**Documentos del SGC que ejecuta:** CT-COM-001, CT-COM-002, CT-COM-003, OS-COM-001, CT-GTH-001, CT-GTH-002, CT-ADM-001, AN-GTH-001.

**Funciones**

- Generación del contrato desde las plantillas institucionales con los datos de la cotización y del tercero.

- Biblioteca de cláusulas aprobadas y control de las cláusulas modificadas.

- Flujo de revisión y aprobación.

- Firma electrónica con paquete de evidencia (capítulo 19) y firma manuscrita digitalizada como alternativa.

- Obligaciones, hitos, vencimientos y renovaciones con alertas.

- Otrosíes, prórrogas y terminación.

- Expediente contractual completo.

**Flujo y estados**

Contrato: borrador → en revisión → aprobado → en firma → vigente → por vencer → terminado o renovado.

**Reglas de negocio**

- Solo se envía a firma un contrato aprobado; el documento enviado es inmutable.

- Firman únicamente los representantes registrados como firmantes autorizados del tercero.

- El orden de firma se respeta cuando está definido; la empresa firma de última.

- Toda cláusula que se aparte de la biblioteca queda marcada y exige aprobación de la Dirección y, si aplica, concepto jurídico.

- Las alertas de vencimiento se generan a 90, 60 y 30 días.

- Los contratos laborales siguen el mismo mecanismo y se archivan en la historia laboral.

**Criterios de aceptación**

- Un contrato firmado muestra su certificado de evidencia y supera la verificación pública.

- Modificar un solo byte del PDF firmado hace fallar la verificación.

- Un contrato próximo a vencer genera tarea al responsable.

- El evento de firma completa propone crear el proyecto con los datos del contrato.

## 17.8 M07 Proyectos y desarrollo de software

**Objetivo:** Planear, ejecutar y entregar los proyectos de software con control de alcance, tiempo, costo y calidad.

**Documentos del SGC que ejecuta:** PR-TEC-001, PR-TEC-002, PR-TEC-003, PR-TEC-004, PT-TEC-001, FT-TEC-001, FT-TEC-002, FT-TEC-004, FT-FIN-001, FT-FIN-002, MN-TEC-001.

**Funciones**

- Proyecto creado desde el contrato con equipo, hitos y presupuesto de horas.

- Lista de pendientes con épicas, historias, tareas y defectos; iteraciones; tablero de trabajo.

- Registro de horas facturables y no facturables.

- Entregables, acta de entrega técnica y aceptación del cliente en el portal.

- Riesgos, liberaciones, revisiones de código e incidentes.

- Enlaces al repositorio, a los entornos y al diseño de cada proyecto.

- Indicadores de avance, desviación y rentabilidad.

**Flujo y estados**

Proyecto: planeación → en ejecución → en riesgo o pausado → en cierre → cerrado. Ítem: pendiente → en curso → en revisión → en pruebas → terminado. Entregable: en preparación → entregado → aceptado o devuelto.

**Reglas de negocio**

- No se inicia un proyecto sin contrato vigente o autorización expresa de la Dirección.

- Una historia no entra a una iteración sin criterios de aceptación.

- Un ítem no pasa a terminado sin revisión de código y pruebas registradas.

- Un entregable sin respuesta del cliente en el plazo contractual genera recordatorio; la aceptación tácita solo opera si el contrato la prevé.

- Las horas se registran máximo con siete días de atraso.

- El código de cada cliente vive en su repositorio; ARZA ONE guarda enlaces y evidencias, no el código.

**Criterios de aceptación**

- El tablero refleja en tiempo real el cambio de estado hecho por otro usuario.

- La aceptación de un entregable desde el portal genera el acta firmada y propone la factura del hito.

- El avance del proyecto coincide con los ítems terminados sobre los planeados.

- Un miembro retirado del proyecto pierde el acceso de inmediato.

## 17.9 M08 Servicio al cliente: mesa de ayuda, PQRSF y satisfacción

**Objetivo:** Atender solicitudes, incidentes y PQRSF dentro de los tiempos acordados y medir la satisfacción.

**Documentos del SGC que ejecuta:** PR-SAC-001, PR-SAC-002, PR-SAC-003, MN-SAC-001, FT-SAC-001, FT-SAC-002, FT-SAC-003, RE-SAC-001, PT-TEC-003.

**Funciones**

- Tiquetes por portal, correo o registro interno, con niveles de atención y acuerdos de tiempo.

- Radicación de PQRSF desde el sitio público con número de radicado y consulta de estado.

- Clasificación, asignación, escalamiento y respuesta.

- Garantías por entregable y compensaciones técnicas.

- Encuestas de satisfacción y NPS.

- Base de conocimiento interna y para clientes.

**Flujo y estados**

Tiquete: nuevo → asignado → en curso → en espera del cliente → resuelto → cerrado. PQRSF: radicada → clasificada → en trámite → respondida → cerrada.

**Reglas de negocio**

- Toda PQRSF recibe acuse inmediato con radicado y fecha límite de respuesta.

- Los términos de respuesta por tipo son los de PR-SAC-002 (10, 15 o 30 días hábiles) y se configuran como parámetros; las consultas y los reclamos sobre datos personales siguen los plazos de la Ley 1581 y se trasladan al módulo de privacidad.

- El reloj del acuerdo de servicio se pausa en «en espera del cliente».

- Una queja o un reclamo procedente genera no conformidad en el módulo de calidad.

- Un incidente de nivel crítico activa el protocolo PT-TEC-003 y notifica de inmediato.

- La respuesta final de una PQRSF la aprueba el líder del proceso.

**Criterios de aceptación**

- Radicar una PQRSF en el sitio entrega el radicado en pantalla y por correo.

- Un tiquete que supera el 80 % de su plazo alerta al responsable y al líder.

- Al resolver un tiquete se envía la encuesta y la respuesta alimenta el indicador de satisfacción.

## 17.10 M09 Portal del cliente

**Objetivo:** Dar al cliente acceso seguro y permanente a todo lo relacionado con su servicio.

**Documentos del SGC que ejecuta:** PR-COM-002, PR-SAC-001, FT-TEC-001.

**Funciones**

- Tablero con proyectos, avance, próximos hitos y pendientes del cliente.

- Aprobación de entregables y firma de documentos.

- Consulta de contratos, facturas y estado de cuenta.

- Soporte y PQRSF.

- Documentos compartidos.

- Administración de los usuarios de su empresa.

- Consulta, actualización y descarga de sus datos personales.

**Reglas de negocio**

- El cliente solo ve registros de su organización marcados como visibles.

- Los comentarios internos nunca se muestran en el portal.

- El administrador del cliente gestiona sus usuarios, pero no sus permisos sobre otras organizaciones.

- El primer ingreso exige aceptar los términos de uso y la política de privacidad vigentes.

**Criterios de aceptación**

- Un usuario de un cliente no puede obtener datos de otro cliente por ninguna dirección de la API.

- El cliente descarga la factura y el soporte fiscal.

- El portal es plenamente usable en un celular.

## 17.11 M10 Facturación, cartera y finanzas operativas

**Objetivo:** Controlar qué se factura, qué se cobra y qué se gasta, y entregar esa información ordenada a la contabilidad.

**Documentos del SGC que ejecuta:** PR-FIN-001 a PR-FIN-005, IN-FIN-001, IN-FIN-002, FT-FIN-003 a FT-FIN-006, RE-FIN-002 a RE-FIN-010, MN-FIN-001.

**Funciones**

- Solicitud de factura desde un hito aceptado o un servicio recurrente.

- Registro del número, el identificador único y el archivo del documento fiscal emitido en el software habilitado.

- Notas crédito y débito.

- Cartera por edades, recaudos, gestión de cobro y deterioro.

- Presupuesto por centro de costo y seguimiento.

- Gastos, caja menor y conciliación bancaria.

- Exportación periódica al software contable.

**Flujo y estados**

Factura: solicitada → aprobada → emitida (con número fiscal) → pagada parcial o totalmente, vencida o anulada.

**Reglas de negocio**

- La plataforma no genera ni transmite el documento electrónico a la DIAN; registra el emitido.

- No se solicita factura sin hito aceptado o contrato que la respalde.

- Una factura emitida no se edita; se corrige con nota crédito.

- Las tarifas de impuestos y retenciones son parámetros con vigencia validados por el Contador.

- La gestión de cobro se registra y respeta los horarios y canales de la Ley 2300 de 2023.

- El recaudo se aplica contra facturas concretas y concilia con el extracto.

- Los periodos cerrados no admiten cambios.

**Criterios de aceptación**

- La cartera por edades coincide con RE-FIN-002.

- La suma de lo exportado en el periodo coincide con lo registrado en la plataforma.

- Una factura vencida genera tarea de cobro en horario permitido.

- El presupuesto muestra ejecución contra lo planeado por centro de costo.

## 17.12 M11 Compras, proveedores y activos

**Objetivo:** Asegurar compras justificadas, proveedores evaluados y activos controlados.

**Documentos del SGC que ejecuta:** PR-ADM-001 a PR-ADM-004, FT-ADM-001 a FT-ADM-004, IN-ADM-001, RE-ADM-001 a RE-ADM-003, CT-ADM-001.

**Funciones**

- Solicitud de compra, cotizaciones, cuadro comparativo y orden.

- Aprobación por montos.

- Recepción y conformidad.

- Selección, evaluación y reevaluación de proveedores.

- Solicitud y legalización de viajes.

- Inventario de activos y licencias, asignación en comodato, mantenimientos y bajas.

**Flujo y estados**

Solicitud: borrador → en aprobación → aprobada → cotizada → ordenada → recibida → cerrada.

**Reglas de negocio**

- El número mínimo de cotizaciones depende del monto parametrizado.

- Quien solicita no aprueba ni recibe.

- No se ordena a un proveedor sin conocimiento del tercero vigente.

- Todo activo asignado tiene contrato de comodato firmado.

- La depreciación se informa a la contabilidad; no se contabiliza en la plataforma.

**Criterios de aceptación**

- Una compra por encima del tope sin las cotizaciones exigidas no puede avanzar.

- El retiro de un colaborador lista los activos por devolver.

- El libro de activos coincide con RE-ADM-003.

## 17.13 M12 Talento humano

**Objetivo:** Administrar el ciclo completo del colaborador con expediente digital y autoservicio.

**Documentos del SGC que ejecuta:** PR-GTH-001 a PR-GTH-006, MN-GTH-001 a MN-GTH-003, PL-GTH-001 a PL-GTH-004, IN-GTH-001, FT-GTH-001, FT-GTH-077, FT-GTH-078, RE-GTH-001 a RE-GTH-003, PT-GTH-001, RIT-001.

**Funciones**

- Vacantes, candidatos y proceso de selección.

- Vinculación con contrato firmado electrónicamente e inducción.

- Historia laboral digital con lista de chequeo.

- Permisos, licencias, vacaciones y horas extras.

- Novedades de nómina para el software de nómina.

- Evaluación de desempeño, formación, bienestar.

- Proceso disciplinario con debido proceso.

- Retiro y paz y salvo.

- Autoservicio del colaborador.

**Flujo y estados**

Candidato: postulado → preseleccionado → en evaluación → seleccionado → vinculado o descartado. Solicitud de ausencia: radicada → aprobada o rechazada → disfrutada.

**Reglas de negocio**

- La jornada es de 40 horas semanales de lunes a viernes; las horas extras exigen autorización previa y respetan los topes legales.

- Los datos de candidatos no seleccionados se eliminan a los doce meses salvo autorización.

- La historia laboral y el proceso disciplinario son información restringida.

- El salario se maneja por bandas; el valor exacto solo lo ven Talento Humano, la Dirección y el Contador.

- Las novedades del periodo se cierran y exportan; la liquidación ocurre en el software de nómina.

- El proceso disciplinario garantiza citación, descargos y decisión motivada conforme al Reglamento Interno de Trabajo.

**Criterios de aceptación**

- Vincular a un colaborador crea cuenta, tareas de inducción, evaluación médica y asignación de equipo.

- Un colaborador ve y solicita sus vacaciones; su jefe las aprueba; la novedad llega al periodo de nómina.

- La matriz de novedades coincide con RE-GTH-003.

## 17.14 M13 Seguridad y salud en el trabajo

**Objetivo:** Ejecutar y evidenciar el SG-SST.

**Documentos del SGC que ejecuta:** MN-SST-001 a MN-SST-003, PL-SST-001, PL-SST-002, PR-SST-001, PR-SST-002, IN-SST-001, FT-SST-001 a FT-SST-004, RE-SST-001 a RE-SST-007, PVE-SST-001, PVE-SST-002.

**Funciones**

- Matriz de peligros y valoración de riesgos.

- Plan anual de trabajo con evidencias.

- Reporte e investigación de incidentes y accidentes.

- Inspecciones, incluidas las de trabajo en casa.

- Reporte de actos y condiciones inseguras por cualquier colaborador.

- Programación y seguimiento de evaluaciones médicas.

- Entrega de elementos de protección.

- Actas de comités.

- Autoevaluación de estándares mínimos.

**Flujo y estados**

Incidente: reportado → en investigación → con plan de acción → cerrado.

**Reglas de negocio**

- Un accidente de trabajo debe reportarse a la ARL dentro de los dos días hábiles siguientes; el sistema alerta y registra la fecha del reporte.

- Solo se registra el concepto de aptitud y las restricciones; nunca diagnósticos.

- Las acciones derivadas se gestionan en el módulo de calidad.

- La información del Comité de Convivencia es restringida a sus integrantes.

**Criterios de aceptación**

- Cualquier colaborador reporta una condición insegura en menos de un minuto desde su celular.

- La autoevaluación calcula el puntaje y coincide con RE-SST-003.

- El plan anual muestra porcentaje de cumplimiento con evidencias.

## 17.15 M14 Calidad y mejora continua

**Objetivo:** Gestionar riesgos, no conformidades, acciones, auditorías e indicadores del sistema de gestión.

**Documentos del SGC que ejecuta:** MN-SGC-001, PR-SGC-003 a PR-SGC-008, PL-SGC-001, PL-SGC-002, FT-SGC-003 a FT-SGC-005, RE-SGC-002 a RE-SGC-007, FT-DG-001, FT-DG-002.

**Funciones**

- Mapa de procesos y caracterizaciones.

- Contexto, partes interesadas, riesgos y oportunidades.

- Salidas no conformes, no conformidades y acciones correctivas con análisis de causa.

- Programa, planes, listas de chequeo e informes de auditoría.

- Indicadores con ficha, medición, análisis y tendencia.

- Revisión por la dirección.

- Lecciones aprendidas.

**Flujo y estados**

No conformidad: detectada → contenida → en análisis → con plan → verificada → cerrada eficaz o reabierta.

**Reglas de negocio**

- Toda no conformidad exige corrección inmediata, causa raíz y acción con responsable y fecha.

- La eficacia la verifica alguien distinto de quien ejecutó la acción.

- Los indicadores que la plataforma puede calcular se miden automáticamente; los demás se registran con evidencia.

- Un auditor no audita su propio proceso.

- Las acciones vencidas escalan a la Dirección.

**Criterios de aceptación**

- Una queja procedente crea la no conformidad con su origen enlazado.

- La bitácora de acciones coincide con RE-SGC-002.

- La matriz de indicadores muestra meta, resultado y tendencia por proceso.

## 17.16 M15 Innovación y propiedad intelectual

**Objetivo:** Gestionar las ideas, la hoja de ruta de productos y los activos de propiedad intelectual.

**Documentos del SGC que ejecuta:** PR-INN-001, PR-INN-002, PT-INN-001, PL-INN-001, FT-INN-001 a FT-INN-006, RE-INN-001, RE-INN-002.

**Funciones**

- Banco de ideas con evaluación de viabilidad.

- Hoja de ruta de productos propios.

- Portafolio de marcas, registros de software y dominios con vencimientos.

- Vigilancia tecnológica y análisis de competencia.

**Flujo y estados**

Idea: inscrita → en evaluación → aprobada → en desarrollo → implementada o archivada.

**Reglas de negocio**

- Cada activo registra titular, número de registro, fecha y vencimiento, con alerta de renovación.

- Cada versión liberada de un producto propio propone su registro ante la Dirección Nacional de Derecho de Autor.

- La cadena de titularidad enlaza el activo con los contratos de cesión de sus autores.

**Criterios de aceptación**

- El portafolio coincide con RE-INN-001.

- Una marca próxima a vencer genera tarea con seis meses de anticipación.

## 17.17 M16 Dirección: tableros, indicadores y requisitos legales

**Objetivo:** Dar a la Dirección una visión confiable y actual de la empresa y de su cumplimiento legal.

**Documentos del SGC que ejecuta:** PL-DG-001, MN-DG-001, PR-DG-001, RE-DG-001, PR-SGC-007.

**Funciones**

- Tablero gerencial: ventas, cartera, proyectos en riesgo, satisfacción, cumplimiento.

- Cuadro de mando integral con los objetivos del plan estratégico.

- Normograma y evaluación periódica del cumplimiento legal.

- Tablero de cumplimiento: accesos, segregación de funciones, tareas vencidas, documentos por revisar.

**Reglas de negocio**

- Toda cifra permite llegar al listado de registros que la origina.

- Los tableros respetan los permisos: nadie ve por un indicador lo que no puede ver por el listado.

- Los cálculos se documentan en la ficha del indicador.

**Criterios de aceptación**

- Las cifras del tablero coinciden con las consultas directas a cada módulo.

- El normograma coincide con RE-DG-001 y cada requisito muestra su última evaluación.

## 17.18 M17 Sitio público, formularios y consentimiento

**Objetivo:** Presentar la empresa, captar contactos y cumplir los deberes de información con el público.

**Documentos del SGC que ejecuta:** MN-ADM-001, PL-COM-001, PL-DG-002, FT-DG-003.

**Funciones**

- Páginas institucionales administrables.

- Formularios de contacto, cotización y PQRSF.

- Textos legales versionados: términos, privacidad, cookies, derechos del titular.

- Banner y centro de preferencias de cookies.

- Verificación pública de documentos firmados.

- Baja de comunicaciones comerciales en un clic.

**Flujo y estados**

Texto legal: borrador → aprobado → publicado → reemplazado.

**Reglas de negocio**

- Ningún formulario se envía sin la casilla de autorización, que nunca viene marcada.

- Las cookies no esenciales no se instalan antes de la aceptación.

- Cada aceptación guarda la versión del texto aceptado.

- El sitio no carga recursos de terceros que rastreen al visitante sin su consentimiento.

- El pie de página identifica a la empresa: razón social, NIT, domicilio, correo y teléfono.

**Criterios de aceptación**

- Con las cookies rechazadas, el navegador solo contiene las estrictamente necesarias.

- Publicar una nueva versión de los términos obliga a aceptarla en el siguiente ingreso.

- El sitio obtiene calificación de accesibilidad sin violaciones graves.

## 17.19 M18 Privacidad y cumplimiento

**Objetivo:** Demostrar el cumplimiento del régimen de protección de datos personales.

**Documentos del SGC que ejecuta:** PL-DG-002, FT-DG-003, MN-DG-002.

**Funciones**

- Registro de actividades de tratamiento.

- Avisos y políticas versionados.

- Registro de autorizaciones con su evidencia y revocatoria.

- Atención de consultas y reclamos de titulares con plazos legales.

- Exportación y supresión de los datos de un titular.

- Registro de incidentes y de encargados del tratamiento.

**Flujo y estados**

Solicitud del titular: recibida → en verificación de identidad → en trámite → respondida → cerrada.

**Reglas de negocio**

- Consultas: respuesta en máximo 10 días hábiles, prorrogables 5. Reclamos: 15 días hábiles, prorrogables 8 (Ley 1581 de 2012, arts. 14 y 15).

- Un reclamo incompleto se requiere dentro de los 5 días siguientes.

- La supresión no procede cuando existe deber legal o contractual de conservar; en ese caso se bloquea el dato y se informa.

- Ningún dato sensible se recolecta sin autorización explícita y sin informar que la respuesta es facultativa.

- Todo proveedor con acceso a datos tiene contrato de transmisión.

**Criterios de aceptación**

- Una solicitud genera tarea con la fecha límite legal calculada en días hábiles.

- La exportación entrega todos los datos del titular en formato legible.

- Revocar una autorización detiene las comunicaciones comerciales de inmediato.

## 17.20 M19 Auditoría y trazabilidad

**Objetivo:** Conservar evidencia inalterable de todo lo que ocurre en la plataforma.

**Documentos del SGC que ejecuta:** PR-SGC-002, PR-SGC-006, PR-TEC-004.

**Funciones**

- Registro automático de toda creación, modificación, borrado, transición, aprobación, firma, consulta de dato restringido, exportación e inicio de sesión.

- Historial visible en cada registro.

- Consulta y exportación para auditores.

- Verificación de la integridad de la cadena.

**Reglas de negocio**

- Los eventos no se modifican ni se eliminan; se conservan mínimo diez años.

- Cada evento incluye el hash del anterior; la verificación diaria detecta cualquier alteración.

- Los cambios guardan valor anterior y nuevo, salvo en campos restringidos, donde solo se registra que cambió.

- Consultar la auditoría también queda auditado.

**Criterios de aceptación**

- Toda operación de escritura de cualquier módulo produce su evento; una prueba automática lo comprueba.

- Alterar manualmente una fila hace fallar la verificación de la cadena.

## 17.21 M20 Asistente de inteligencia artificial

**Objetivo:** Apoyar a los usuarios con búsqueda, resumen y redacción, sin sustituir decisiones ni controles.

**Documentos del SGC que ejecuta:** MN-DG-002, PR-INN-002.

**Funciones**

- Búsqueda semántica en documentos a los que el usuario tiene acceso.

- Resumen de documentos y de conversaciones de tiquetes.

- Borradores de respuestas, actas y propuestas.

- Clasificación sugerida de tiquetes y PQRSF.

**Reglas de negocio**

- Se construye después de la salida a producción.

- La IA propone; el sistema valida permisos; la persona aprueba; el sistema ejecuta; la plataforma audita.

- Nunca recibe datos restringidos. Los datos personales solo se envían a un proveedor con contrato de transmisión y evaluación de impacto (Circular Externa 002 de 2024 de la SIC).

- No toma decisiones laborales, financieras, contractuales ni disciplinarias.

- Toda respuesta cita los documentos en que se basa.

**Criterios de aceptación**

- Un usuario no obtiene por el asistente información que no puede ver por la aplicación.

- Cada uso queda registrado con caso de uso, modelo y resultado.
