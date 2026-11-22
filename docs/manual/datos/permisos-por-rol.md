# Permisos por rol

> Generado desde `packages/contracts/src/iam/role-matrix.ts` (B10). No lo edite a mano: si cambia
> la matriz, regénerelo con `pnpm --filter @arza/contracts test -u`.

Cada rol del sistema recibe los permisos del anexo G según la matriz del numeral 15.3: **L** da
los permisos de leer; **C**, los de leer, crear y operar; **A**, los de aprobar; **C** y **A**
juntas, además los de configurar el módulo; **P**, los mismos permisos limitados a «solo lo
propio». Los permisos sensibles solo los reciben los roles que nombra el numeral 15.2. Los
permisos de una persona son la suma de sus roles vigentes.

## Resumen

| Rol | Código | Para | Permisos | Solo lo propio |
| --- | --- | --- | --- | --- |
| Dirección | `DIRECCION` | Interno | 80 | 1 |
| Administrador de plataforma | `ADMIN_PLATAFORMA` | Interno | 35 | 1 |
| Calidad | `CALIDAD` | Interno | 69 | 1 |
| Comercial | `COMERCIAL` | Interno | 54 | 10 |
| Líder técnico | `LIDER_TECNICO` | Interno | 50 | 9 |
| Equipo de proyecto | `EQUIPO_PROYECTO` | Interno | 23 | 18 |
| Servicio al cliente | `SERVICIO` | Interno | 47 | 10 |
| Administrativo y financiero | `ADMIN_FINANCIERO` | Interno | 64 | 6 |
| Contador | `CONTADOR` | Interno | 21 | 2 |
| Talento humano | `TALENTO_HUMANO` | Interno | 43 | 10 |
| Seguridad y salud en el trabajo | `SST` | Interno | 33 | 9 |
| Oficial de protección de datos | `OFICIAL_DATOS` | Interno | 35 | 6 |
| Colaborador | `COLABORADOR` | Interno | 26 | 21 |
| Auditor | `AUDITOR` | Interno | 40 | 0 |
| Administrador del cliente | `CLIENTE_ADMIN` | Portal | 9 | 0 |
| Usuario del cliente | `CLIENTE_USUARIO` | Portal | 4 | 4 |

## Dirección (`DIRECCION`)

Director General. Lectura transversal, aprobaciones de alto nivel, firma de contratos, tableros. 80 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema · Administrar los comunicados del acceso
- **Identidad y acceso (M01):** Ver los usuarios y sus roles · Ver los roles y sus permisos · Ver el informe de revisión de accesos
- **Terceros (M02):** Ver terceros · Aprobar el conocimiento del tercero
- **Gestión documental (M03):** Ver documentos · Revisar versiones · Aprobar versiones · Publicar versiones · Declarar obsoleta una versión · Decidir solicitudes de cambio · Aprobar formatos diligenciados · Aprobar la disposición final de documentos
- **Flujos y tareas (M04):** Ver las tareas de todas las personas · Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver el tablero ejecutivo · Ver tableros de proceso · Ver el tablero de cumplimiento
- **Sitio y textos legales (M17):** Publicar textos legales · Ver formularios recibidos en el sitio
- **Privacidad (M18):** Ver autorizaciones de tratamiento · Entregar los datos de un titular · Suprimir los datos de un titular
- **Auditoría (M19):** Ver la auditoría · Ver los eventos de seguridad · Verificar la cadena de la auditoría
- **Comercial (M05):** Ver prospectos · Ver oportunidades · Ver cotizaciones · Aprobar cotizaciones · Ver informes comerciales
- **Contratos y firma (M06):** Ver contratos · Crear contratos en borrador · Editar contratos en borrador · Aprobar contratos · Terminar contratos · Renovar contratos · Administrar el banco de cláusulas · Preparar sobres de firma · Enviar sobres a firma · Anular sobres de firma · Ver las evidencias de firma
- **Proyectos (M07):** Ver todos los proyectos · Ver los proyectos donde es miembro
- **Servicio al cliente (M08):** Ver tiquetes · Ver PQRSF · Leer la base de conocimiento
- **Finanzas (M10):** Ver facturas · Aprobar facturas · Registrar documento fiscal emitido · Anular facturas · Ver presupuestos · Aprobar presupuestos · Aprobar gastos · Ver gastos, caja menor y conciliaciones
- **Compras y activos (M11):** Aprobar solicitudes de compra · Aprobar viajes · Ver compras, proveedores y viajes · Ver activos · Aprobar compras del tramo alto
- **Talento humano (M12):** Ver colaboradores · Aprobar permisos y vacaciones · Autorizar horas extras · Cerrar el periodo de novedades de nómina · Ver salarios
- **Seguridad y salud en el trabajo (M13):** Ver el módulo de SST · Ver las actas del comité
- **Calidad (M14):** Ver el módulo de Calidad · Ver las lecciones aprendidas · Cerrar no conformidades · Verificar la eficacia de las acciones · Aprobar el acta de revisión por la dirección · Evaluar el cumplimiento legal
- **Innovación (M15):** Ver innovación y propiedad intelectual · Evaluar ideas · Aprobar ideas

## Administrador de plataforma (`ADMIN_PLATAFORMA`)

Responsable técnico. Usuarios, roles, parámetros, flujos y catálogos, sin acceso al contenido restringido por el solo hecho de administrar. 35 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Cambiar los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Administrar sedes, procesos, cargos y centros de costo · Administrar los catálogos · Ver los parámetros y el estado del sistema · Cambiar los parámetros · Administrar los consecutivos · Administrar los comunicados del acceso
- **Identidad y acceso (M01):** Ver los usuarios y sus roles · Invitar usuarios · Cambiar los datos de un usuario · Bloquear y desbloquear usuarios · Reiniciar el segundo factor de otra persona · Ver los roles y sus permisos · Crear y editar roles personalizados · Asignar y retirar roles · Cerrar las sesiones de otras personas · Delegar aprobaciones · Ver el informe de revisión de accesos
- **Terceros (M02):** Ver terceros
- **Gestión documental (M03):** Ver documentos
- **Flujos y tareas (M04):** Administrar flujos · Ver las tareas de todas las personas · Reasignar tareas · Atender sus tareas (solo lo propio) · Administrar plantillas de avisos
- **Sitio y textos legales (M17):** Editar páginas del sitio · Editar textos legales · Ver formularios recibidos en el sitio
- **Auditoría (M19):** Ver la auditoría · Ver los eventos de seguridad · Verificar la cadena de la auditoría
- **Servicio al cliente (M08):** Leer la base de conocimiento
- **Calidad (M14):** Ver las lecciones aprendidas

## Calidad (`CALIDAD`)

Coordinador de Calidad e Innovación. Control documental, riesgos, no conformidades, auditorías, indicadores. 69 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros
- **Gestión documental (M03):** Ver documentos · Crear documentos · Editar documentos · Enviar una versión a revisión · Revisar versiones · Aprobar versiones · Publicar versiones · Declarar obsoleta una versión · Solicitar cambios documentales · Decidir solicitudes de cambio · Administrar plantillas de formatos · Diligenciar formatos · Aprobar formatos diligenciados · Administrar la tabla de retención · Aprobar la disposición final de documentos · Exportar documentos
- **Flujos y tareas (M04):** Ver las tareas de todas las personas · Reasignar tareas · Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver el tablero ejecutivo · Ver tableros de proceso · Ver el tablero de cumplimiento
- **Sitio y textos legales (M17):** Ver formularios recibidos en el sitio
- **Privacidad (M18):** Ver autorizaciones de tratamiento
- **Auditoría (M19):** Ver la auditoría · Ver los eventos de seguridad · Verificar la cadena de la auditoría
- **Comercial (M05):** Ver prospectos · Ver oportunidades · Ver cotizaciones · Ver informes comerciales
- **Contratos y firma (M06):** Ver contratos · Ver las evidencias de firma
- **Proyectos (M07):** Ver todos los proyectos · Ver los proyectos donde es miembro
- **Servicio al cliente (M08):** Ver tiquetes · Ver PQRSF · Leer la base de conocimiento
- **Compras y activos (M11):** Ver compras, proveedores y viajes · Ver activos
- **Seguridad y salud en el trabajo (M13):** Ver el módulo de SST · Ver las actas del comité
- **Calidad (M14):** Ver el módulo de Calidad · Ver las lecciones aprendidas · Administrar procesos y su contexto · Gestionar riesgos · Reportar no conformidades · Gestionar no conformidades · Cerrar no conformidades · Gestionar acciones de mejora · Verificar la eficacia de las acciones · Planear auditorías internas · Ejecutar auditorías internas · Administrar indicadores · Registrar mediciones de indicadores · Gestionar la revisión por la dirección · Administrar la matriz de requisitos legales · Evaluar el cumplimiento legal
- **Innovación (M15):** Ver innovación y propiedad intelectual · Proponer ideas · Evaluar ideas · Aprobar ideas · Administrar la hoja de ruta · Administrar la propiedad intelectual · Gestionar la vigilancia tecnológica

## Comercial (`COMERCIAL`)

Gerente y analistas comerciales. Prospectos, oportunidades, cotizaciones, clientes; contratos en borrador. 54 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros · Crear terceros · Editar terceros · Fusionar terceros duplicados · Registrar el conocimiento del tercero
- **Gestión documental (M03):** Ver documentos · Crear documentos · Editar documentos · Enviar una versión a revisión · Solicitar cambios documentales · Diligenciar formatos
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver tableros de proceso (solo lo propio)
- **Sitio y textos legales (M17):** Editar páginas del sitio · Editar textos legales · Ver formularios recibidos en el sitio
- **Comercial (M05):** Ver prospectos · Crear prospectos · Editar prospectos · Convertir prospectos en clientes · Ver oportunidades · Crear oportunidades · Editar oportunidades · Cerrar oportunidades ganadas o perdidas · Administrar el portafolio de servicios · Ver cotizaciones · Crear cotizaciones · Editar cotizaciones · Enviar cotizaciones al cliente · Ver informes comerciales
- **Contratos y firma (M06):** Ver contratos · Crear contratos en borrador · Editar contratos en borrador · Preparar sobres de firma · Ver las evidencias de firma
- **Proyectos (M07):** Ver todos los proyectos · Ver los proyectos donde es miembro
- **Servicio al cliente (M08):** Ver tiquetes · Ver PQRSF · Leer la base de conocimiento
- **Finanzas (M10):** Ver facturas · Ver presupuestos
- **Compras y activos (M11):** Solicitar compras (solo lo propio) · Solicitar viajes (solo lo propio) · Ver activos (solo lo propio)
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas
- **Innovación (M15):** Proponer ideas (solo lo propio)

## Líder técnico (`LIDER_TECNICO`)

Gerente de Desarrollo, líder técnico. Todos los proyectos, liberaciones, incidentes. 50 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros
- **Gestión documental (M03):** Ver documentos · Crear documentos · Editar documentos · Enviar una versión a revisión · Solicitar cambios documentales · Diligenciar formatos
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver tableros de proceso (solo lo propio)
- **Comercial (M05):** Ver prospectos · Ver oportunidades · Ver cotizaciones · Ver informes comerciales
- **Contratos y firma (M06):** Ver contratos · Ver las evidencias de firma
- **Proyectos (M07):** Ver todos los proyectos · Ver los proyectos donde es miembro · Crear proyectos · Editar proyectos · Cerrar proyectos · Administrar los miembros de un proyecto · Gestionar tareas e ítems del proyecto · Registrar horas · Aprobar horas · Enviar entregables al cliente · Gestionar liberaciones · Gestionar incidentes
- **Servicio al cliente (M08):** Ver tiquetes · Crear tiquetes · Asignar tiquetes · Resolver tiquetes · Cerrar tiquetes · Ver PQRSF · Clasificar PQRSF · Responder PQRSF · Leer la base de conocimiento
- **Compras y activos (M11):** Solicitar compras (solo lo propio) · Solicitar viajes (solo lo propio) · Ver activos (solo lo propio)
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas
- **Innovación (M15):** Ver innovación y propiedad intelectual · Proponer ideas · Gestionar la vigilancia tecnológica

## Equipo de proyecto (`EQUIPO_PROYECTO`)

Desarrolladores, QA, diseñadores. Solo los proyectos donde es miembro. 23 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros (solo lo propio)
- **Gestión documental (M03):** Ver documentos (solo lo propio) · Solicitar cambios documentales (solo lo propio) · Diligenciar formatos (solo lo propio)
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Proyectos (M07):** Ver los proyectos donde es miembro (solo lo propio) · Gestionar tareas e ítems del proyecto (solo lo propio) · Registrar horas (solo lo propio)
- **Servicio al cliente (M08):** Ver tiquetes (solo lo propio) · Crear tiquetes (solo lo propio) · Leer la base de conocimiento
- **Compras y activos (M11):** Solicitar compras (solo lo propio) · Solicitar viajes (solo lo propio) · Ver activos (solo lo propio)
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas
- **Innovación (M15):** Proponer ideas (solo lo propio)

## Servicio al cliente (`SERVICIO`)

Líder y técnicos de servicio al cliente. Tiquetes, PQRSF, encuestas, base de conocimiento. 47 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros · Crear terceros · Editar terceros · Fusionar terceros duplicados · Registrar el conocimiento del tercero
- **Gestión documental (M03):** Ver documentos · Crear documentos · Editar documentos · Enviar una versión a revisión · Solicitar cambios documentales · Diligenciar formatos
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver tableros de proceso (solo lo propio)
- **Comercial (M05):** Ver prospectos · Ver oportunidades · Ver cotizaciones · Ver informes comerciales
- **Contratos y firma (M06):** Ver contratos · Ver las evidencias de firma
- **Proyectos (M07):** Ver todos los proyectos · Ver los proyectos donde es miembro
- **Servicio al cliente (M08):** Ver tiquetes · Crear tiquetes · Asignar tiquetes · Resolver tiquetes · Cerrar tiquetes · Ver PQRSF · Clasificar PQRSF · Responder PQRSF · Aprobar respuestas de PQRSF · Administrar encuestas de satisfacción · Leer la base de conocimiento · Administrar la base de conocimiento · Aprobar compensaciones al cliente · Configurar los acuerdos de tiempo y las garantías
- **Compras y activos (M11):** Solicitar compras (solo lo propio) · Solicitar viajes (solo lo propio) · Ver activos (solo lo propio)
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas
- **Innovación (M15):** Proponer ideas (solo lo propio)

## Administrativo y financiero (`ADMIN_FINANCIERO`)

Gerente administrativo, asistente. Facturación, cartera, compras, activos, presupuesto, caja menor. 64 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros · Crear terceros · Editar terceros · Fusionar terceros duplicados · Registrar el conocimiento del tercero · Ver las cuentas bancarias de terceros · Registrar cuentas bancarias de terceros · Aprobar cuentas bancarias de terceros
- **Gestión documental (M03):** Ver documentos · Crear documentos · Editar documentos · Enviar una versión a revisión · Solicitar cambios documentales · Diligenciar formatos
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver tableros de proceso (solo lo propio)
- **Comercial (M05):** Ver prospectos · Ver oportunidades · Ver cotizaciones · Ver informes comerciales
- **Contratos y firma (M06):** Ver contratos · Ver las evidencias de firma
- **Proyectos (M07):** Ver todos los proyectos · Ver los proyectos donde es miembro
- **Servicio al cliente (M08):** Leer la base de conocimiento
- **Finanzas (M10):** Ver facturas · Solicitar facturas · Aprobar facturas · Registrar documento fiscal emitido · Anular facturas · Registrar pagos · Gestionar la cartera · Ver presupuestos · Elaborar presupuestos · Aprobar presupuestos · Registrar gastos · Aprobar gastos · Gestionar la caja menor · Hacer conciliaciones bancarias · Administrar parámetros tributarios · Exportar información contable · Ver gastos, caja menor y conciliaciones · Certificar costos de desarrollo · Cerrar periodos contables
- **Compras y activos (M11):** Solicitar compras · Aprobar solicitudes de compra · Emitir órdenes de compra · Recibir órdenes de compra · Evaluar proveedores · Solicitar viajes · Aprobar viajes · Ver compras, proveedores y viajes · Ver activos · Administrar activos · Asignar activos · Dar de baja activos
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas

## Contador (`CONTADOR`)

Contador Público externo. Lectura financiera, exportaciones contables, parámetros tributarios. 21 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros · Ver las cuentas bancarias de terceros
- **Gestión documental (M03):** Ver documentos
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver tableros de proceso (solo lo propio)
- **Contratos y firma (M06):** Ver contratos · Ver las evidencias de firma
- **Servicio al cliente (M08):** Leer la base de conocimiento
- **Finanzas (M10):** Ver facturas · Ver presupuestos · Ver gastos, caja menor y conciliaciones · Exportar información contable · Administrar parámetros tributarios · Cerrar periodos contables
- **Compras y activos (M11):** Ver compras, proveedores y viajes · Ver activos
- **Talento humano (M12):** Ver salarios
- **Calidad (M14):** Ver las lecciones aprendidas

## Talento humano (`TALENTO_HUMANO`)

Coordinador de talento humano. Colaboradores, selección, novedades, formación, disciplinarios. 43 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros · Crear terceros · Editar terceros · Fusionar terceros duplicados · Registrar el conocimiento del tercero
- **Gestión documental (M03):** Ver documentos · Crear documentos · Editar documentos · Enviar una versión a revisión · Solicitar cambios documentales · Diligenciar formatos
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver tableros de proceso (solo lo propio)
- **Contratos y firma (M06):** Ver contratos (solo lo propio)
- **Servicio al cliente (M08):** Leer la base de conocimiento
- **Compras y activos (M11):** Solicitar compras (solo lo propio) · Solicitar viajes (solo lo propio) · Ver activos (solo lo propio)
- **Talento humano (M12):** Ver colaboradores · Administrar colaboradores · Gestionar vacantes · Gestionar candidatos · Solicitar permisos y vacaciones · Aprobar permisos y vacaciones · Autorizar horas extras · Registrar novedades de nómina · Cerrar el periodo de novedades de nómina · Gestionar evaluaciones de desempeño · Gestionar formación · Gestionar procesos disciplinarios · Gestionar retiros · Ver la historia laboral · Ver salarios
- **Seguridad y salud en el trabajo (M13):** Ver el módulo de SST · Ver las actas del comité
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas

## Seguridad y salud en el trabajo (`SST`)

Líder de SST. Módulo de SST, incluidos los conceptos de aptitud; nunca diagnósticos. 33 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Gestión documental (M03):** Ver documentos · Crear documentos · Editar documentos · Enviar una versión a revisión · Solicitar cambios documentales · Diligenciar formatos
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver tableros de proceso (solo lo propio)
- **Servicio al cliente (M08):** Leer la base de conocimiento
- **Compras y activos (M11):** Solicitar compras (solo lo propio) · Solicitar viajes (solo lo propio) · Ver activos (solo lo propio)
- **Seguridad y salud en el trabajo (M13):** Ver el módulo de SST · Gestionar la matriz de peligros · Gestionar el plan de trabajo de SST · Reportar incidentes y actos inseguros · Investigar incidentes · Cerrar incidentes · Gestionar inspecciones · Ver las actas del comité · Gestionar el comité · Gestionar los estándares mínimos · Registrar la entrega de elementos de protección · Ver conceptos de aptitud (nunca diagnósticos) · Registrar conceptos de aptitud y restricciones
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas

## Oficial de protección de datos (`OFICIAL_DATOS`)

Oficial de Protección de Datos. Módulo de privacidad, consentimientos, solicitudes de titulares. 35 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Terceros (M02):** Ver terceros
- **Gestión documental (M03):** Ver documentos · Crear documentos · Editar documentos · Enviar una versión a revisión · Solicitar cambios documentales · Diligenciar formatos
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Tableros (M16):** Ver tableros de proceso (solo lo propio)
- **Sitio y textos legales (M17):** Editar páginas del sitio · Editar textos legales · Publicar textos legales · Ver formularios recibidos en el sitio
- **Privacidad (M18):** Administrar actividades de tratamiento · Administrar avisos de privacidad · Ver autorizaciones de tratamiento · Gestionar solicitudes de titulares · Responder solicitudes de titulares · Entregar los datos de un titular · Suprimir los datos de un titular · Gestionar incidentes de datos personales · Administrar encargados del tratamiento
- **Auditoría (M19):** Ver la auditoría · Ver los eventos de seguridad · Verificar la cadena de la auditoría
- **Servicio al cliente (M08):** Ver PQRSF · Leer la base de conocimiento
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas

## Colaborador (`COLABORADOR`)

Todo colaborador. Sus tareas, sus solicitudes, sus datos, documentos vigentes de su proceso. 26 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Identidad y acceso (M01):** Delegar aprobaciones (solo lo propio)
- **Gestión documental (M03):** Ver documentos (solo lo propio) · Solicitar cambios documentales (solo lo propio) · Diligenciar formatos (solo lo propio)
- **Flujos y tareas (M04):** Atender sus tareas (solo lo propio)
- **Privacidad (M18):** Ver autorizaciones de tratamiento (solo lo propio)
- **Contratos y firma (M06):** Ver contratos (solo lo propio)
- **Servicio al cliente (M08):** Ver tiquetes (solo lo propio) · Crear tiquetes (solo lo propio) · Leer la base de conocimiento
- **Finanzas (M10):** Registrar gastos (solo lo propio)
- **Compras y activos (M11):** Solicitar compras (solo lo propio) · Solicitar viajes (solo lo propio) · Ver activos (solo lo propio)
- **Talento humano (M12):** Ver colaboradores (solo lo propio) · Solicitar permisos y vacaciones (solo lo propio)
- **Seguridad y salud en el trabajo (M13):** Reportar incidentes y actos inseguros (solo lo propio)
- **Calidad (M14):** Reportar no conformidades (solo lo propio) · Gestionar acciones de mejora (solo lo propio) · Ejecutar auditorías internas (solo lo propio) · Registrar mediciones de indicadores (solo lo propio) · Ver las lecciones aprendidas
- **Innovación (M15):** Proponer ideas (solo lo propio)

## Auditor (`AUDITOR`)

Auditor interno o externo. Solo lectura de evidencias y auditoría, por tiempo limitado. 40 permisos.

- **Núcleo (M00):** Ver los datos de la empresa · Ver sedes, procesos, cargos y centros de costo · Ver los parámetros y el estado del sistema
- **Identidad y acceso (M01):** Ver los usuarios y sus roles · Ver los roles y sus permisos · Ver el informe de revisión de accesos
- **Terceros (M02):** Ver terceros
- **Gestión documental (M03):** Ver documentos
- **Flujos y tareas (M04):** Ver las tareas de todas las personas
- **Tableros (M16):** Ver el tablero ejecutivo · Ver tableros de proceso · Ver el tablero de cumplimiento
- **Sitio y textos legales (M17):** Ver formularios recibidos en el sitio
- **Privacidad (M18):** Ver autorizaciones de tratamiento
- **Auditoría (M19):** Ver la auditoría · Ver los eventos de seguridad · Verificar la cadena de la auditoría · Exportar la auditoría
- **Comercial (M05):** Ver prospectos · Ver oportunidades · Ver cotizaciones · Ver informes comerciales
- **Contratos y firma (M06):** Ver contratos · Ver las evidencias de firma
- **Proyectos (M07):** Ver todos los proyectos · Ver los proyectos donde es miembro
- **Servicio al cliente (M08):** Ver tiquetes · Ver PQRSF · Leer la base de conocimiento
- **Finanzas (M10):** Ver facturas · Ver presupuestos · Ver gastos, caja menor y conciliaciones
- **Compras y activos (M11):** Ver compras, proveedores y viajes · Ver activos
- **Talento humano (M12):** Ver colaboradores
- **Seguridad y salud en el trabajo (M13):** Ver el módulo de SST · Ver las actas del comité
- **Calidad (M14):** Ver el módulo de Calidad · Ver las lecciones aprendidas
- **Innovación (M15):** Ver innovación y propiedad intelectual

## Administrador del cliente (`CLIENTE_ADMIN`)

Contacto principal del cliente. Todo lo de su organización en el portal; gestiona sus usuarios. 9 permisos.

- **Portal del cliente (M09):** Ver los proyectos de su organización · Aceptar o rechazar entregables · Ver los contratos de su organización · Firmar contratos · Ver y descargar facturas · Crear tiquetes · Ver tiquetes · Administrar los usuarios de su organización · Gestionar sus datos personales

## Usuario del cliente (`CLIENTE_USUARIO`)

Otros usuarios del cliente. Proyectos y tiquetes que se le asignen. 4 permisos.

- **Portal del cliente (M09):** Ver los proyectos de su organización (solo lo propio) · Crear tiquetes (solo lo propio) · Ver tiquetes (solo lo propio) · Gestionar sus datos personales (solo lo propio)

## Permisos que ningún rol trae

Se conceden por persona además del rol (numeral 15.4, clasificación). Llegan con su módulo.

- `doc.restricted.read`: Ver documentos restringidos (además, permiso nominal)
