# 18. Digitalización de la documentación existente

## 18.1 Tres formas de llevar un documento a la plataforma

No todos los documentos se digitalizan igual. Subir doscientos cincuenta archivos a una carpeta no es digitalizar: cada documento debe quedar en la forma que le permite cumplir su función con control y evidencia.

| **Forma**                   | **A qué aplica**                                                                                                  | **Cómo queda**                                                                                                              | **Ventaja**                                                      |
|-----------------------------|-------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| **A. Documento controlado** | Manuales, procedimientos, planes, protocolos, instructivos, políticas, reglamento, manuales de funciones          | PDF vigente consultable en el visor, con versión, aprobaciones, constancia de lectura y fuente editable guardada            | Siempre se consulta la versión vigente; se sabe quién la leyó    |
| **B. Formato digital**      | Formatos y actas que se diligencian ocasionalmente o que requieren firma                                          | Formulario en pantalla con los mismos campos del formato, flujo de aprobación y PDF generado con la plantilla institucional | Se diligencia sin imprimir y conserva la apariencia oficial      |
| **C. Registro nativo**      | Formatos y registros que son el corazón de un proceso: oportunidades, tiquetes, PQRSF, riesgos, acciones, cartera | Tabla y pantallas propias del módulo; el «formato» es una vista, un informe o una exportación                               | El dato se captura una vez, alimenta indicadores y no se duplica |
| **D. Plantilla de salida**  | Contratos, anexos, órdenes de servicio, propuesta comercial                                                       | Plantilla con variables que el sistema llena con los datos del negocio; el resultado se aprueba y se firma                  | Elimina errores de digitación y garantiza el texto aprobado      |

## 18.2 Carga inicial

| **Paso** | **Actividad**                                                                                                               | **Responsable**                  | **Evidencia**                                |
|----------|-----------------------------------------------------------------------------------------------------------------------------|----------------------------------|----------------------------------------------|
| **1**    | Importar RE-SGC-001 Listado Maestro: crea los 251 documentos vigentes con código, nombre, tipo, proceso, versión 00 y fecha | Calidad con guion de importación | Informe de importación sin diferencias       |
| **2**    | Cargar por lote el archivo fuente y generar el PDF de cada documento; calcular su huella de integridad                      | Calidad                          | Total de archivos igual al total del listado |
| **3**    | Enlazar cada manual de funciones a su cargo y cada procedimiento a su proceso                                               | Calidad                          | Organigrama navegable                        |
| **4**    | Cargar RE-SGC-005 como reglas de retención y asignarlas por serie                                                           | Calidad                          | Todo documento con regla                     |
| **5**    | Configurar los formatos digitales y los registros nativos según la tabla 18.3, por fases                                    | Calidad y líder de proceso       | Formato validado contra el original          |
| **6**    | Cargar las plantillas contractuales con sus variables                                                                       | Dirección y asesor jurídico      | Contrato de prueba idéntico al modelo        |
| **7**    | Publicar y solicitar constancia de lectura por cargo                                                                        | Calidad                          | Informe de lectura                           |
| **8**    | Declarar la plataforma como fuente oficial y retirar las copias en carpetas compartidas                                     | Dirección                        | Acta y comunicado                            |

## 18.3 Tratamiento de cada formato y registro

**Direccionamiento estratégico y calidad**

| **Código**                                            | **Documento**                                          | **Forma** | **Módulo y destino**                                             |
|-------------------------------------------------------|--------------------------------------------------------|-----------|------------------------------------------------------------------|
| **FT-DG-001**                                         | Matriz de Contexto DOFA-PESTEL                         | C         | M14 · contexto organizacional                                    |
| **FT-DG-002**                                         | Matriz de Partes Interesadas                           | C         | M14 · partes interesadas                                         |
| **FT-DG-003**                                         | Autorización de Tratamiento de Datos                   | C         | M18 · autorizaciones; casilla en formularios y PDF de constancia |
| **RE-DG-001**                                         | Normograma                                             | C         | M16 · requisitos legales y su evaluación                         |
| **FT-SGC-001**                                        | Solicitud de Acción Documental                         | C         | M03 · solicitudes documentales con flujo                         |
| **FT-SGC-002**                                        | Lista de Verificación Documental                       | B         | M03 · se diligencia al revisar una versión                       |
| **FT-SGC-003 · FT-SGC-004 · FT-SGC-005**              | Riesgos, Salida No Conforme, Acción Correctiva         | C         | M14 · riesgos, no conformidades y acciones                       |
| **RE-SGC-001**                                        | Listado Maestro                                        | C         | M03 · vista en línea y exportación                               |
| **RE-SGC-002**                                        | Bitácora de Acciones Correctivas                       | C         | M14 · vista de acciones                                          |
| **RE-SGC-003 · RE-SGC-004**                           | Lista de Chequeo e Informe de Auditoría                | B         | M14 · formato dentro de cada auditoría; informe generado         |
| **RE-SGC-005**                                        | Tabla de Retención                                     | C         | M03 · reglas de retención                                        |
| **RE-SGC-006**                                        | Matriz de Indicadores                                  | C         | M14 · indicadores y mediciones                                   |
| **RE-SGC-007**                                        | Acta de Revisión por la Dirección                      | B         | M14 · acta con entradas precargadas desde los módulos            |
| **PL-SGC-001 · PL-SGC-002**                           | Programa y Plan de Auditoría                           | C         | M14 · programa y auditorías                                      |
| **FT-INN-001 · FT-INN-002 · RE-INN-001**              | Radicación de Derechos, Registro de Marcas, Portafolio | C         | M15 · portafolio de propiedad intelectual                        |
| **FT-INN-003**                                        | Evaluación de Viabilidad Comercial                     | B         | M15 · dentro de cada idea                                        |
| **FT-INN-004 · FT-INN-005 · FT-INN-006 · RE-INN-002** | Hitos, Ideas, Vigilancia, Competencia                  | C         | M15 · hoja de ruta, ideas, vigilancia y competencia              |

**Procesos misionales**

| **Código**                        | **Documento**                                  | **Forma** | **Módulo y destino**                                           |
|-----------------------------------|------------------------------------------------|-----------|----------------------------------------------------------------|
| **FT-COM-001**                    | Propuesta Comercial                            | D         | M05 · PDF de la cotización                                     |
| **FT-COM-002**                    | Acta de Revisión de Requisitos y Arranque      | B         | M05 · requisito para ganar la oportunidad                      |
| **FT-COM-003**                    | Conocimiento del Cliente                       | B         | M02 · conocimiento del tercero                                 |
| **RE-COM-001**                    | Registro de Oportunidades                      | C         | M05 · embudo de oportunidades                                  |
| **CT-COM-001 a 003 · OS-COM-001** | Contratos, NDA y Orden de Servicio             | D         | M06 · plantillas con variables y firma                         |
| **FT-TEC-001**                    | Acta de Entrega Técnica                        | B         | M07 · acta con firma del cliente en el portal                  |
| **FT-TEC-002**                    | Lista de Revisión de Código                    | B         | M07 · dentro de cada revisión                                  |
| **FT-TEC-003**                    | Catálogo de Monitores y Alertas                | C         | Configuración del monitoreo; exportación como evidencia        |
| **FT-TEC-004**                    | Registro de Incidentes Críticos                | C         | M07 · incidentes                                               |
| **FT-TEC-005 · FT-TEC-006**       | Control de Respaldos, Pruebas de Continuidad   | B         | M07 · operación de la plataforma y de los servicios a clientes |
| **RE-TEC-001 · RE-TEC-002**       | Segregación de Entornos, Bitácora de Monitoreo | B         | Formato periódico; la bitácora se alimenta del monitoreo       |
| **FT-SAC-001**                    | Registro de Tiquetes                           | C         | M08 · tiquetes                                                 |
| **FT-SAC-002**                    | Ficha de PQRSF                                 | C         | M08 · PQRSF                                                    |
| **FT-SAC-003**                    | Registro de NPS                                | C         | M08 · encuestas                                                |
| **RE-SAC-001**                    | Compensaciones Técnicas                        | C         | M08 · compensaciones                                           |

**Procesos de apoyo**

| **Código**                                            | **Documento**                                                               | **Forma** | **Módulo y destino**                                                |
|-------------------------------------------------------|-----------------------------------------------------------------------------|-----------|---------------------------------------------------------------------|
| **FT-FIN-001 · RE-FIN-001**                           | Certificación y Acta de Costos de Desarrollo                                | B         | M10 · a partir de las horas del proyecto                            |
| **FT-FIN-002**                                        | Ficha de Apertura de Proyecto                                               | C         | M07 · creación del proyecto                                         |
| **FT-FIN-003 · RE-FIN-005 · RE-FIN-006**              | Presupuesto, Seguimiento y Acta de Comité                                   | C / B     | M10 · presupuesto; acta como formato                                |
| **FT-FIN-004 · RE-FIN-007**                           | Conciliación Bancaria                                                       | C         | M10 · conciliaciones                                                |
| **FT-FIN-005 · FT-FIN-006 · RE-FIN-008 · RE-FIN-009** | Caja Menor: vale, legalización, libro y arqueo                              | C / B     | M10 · caja menor; arqueo como formato                               |
| **FT-FIN-007**                                        | Creación de Terceros                                                        | C         | M02 · ficha del tercero                                             |
| **RE-FIN-002 · RE-FIN-003 · RE-FIN-004 · RE-FIN-010** | Cartera, Verificaciones, Deterioro, Ingresos                                | C / B     | M10 · cartera y deterioro; actas como formato                       |
| **FT-ADM-001 · FT-ADM-002**                           | Cuadro Comparativo, Solicitud de Compra                                     | C         | M11 · compras                                                       |
| **FT-ADM-003 · FT-ADM-004**                           | Solicitud y Legalización de Viaje                                           | C         | M11 · viajes                                                        |
| **RE-ADM-001 · RE-ADM-002 · RE-ADM-003**              | Proveedores, Novedades, Activos Fijos                                       | C         | M11 · evaluaciones, recepciones y activos                           |
| **CT-ADM-001**                                        | Contrato de Comodato                                                        | D         | M06 · al asignar un activo                                          |
| **FT-GTH-001 · RE-GTH-001**                           | Citación y Acta de Descargos                                                | B         | M12 · proceso disciplinario, restringido                            |
| **FT-GTH-002 a FT-GTH-076**                           | Manuales de Funciones                                                       | A         | M03 · documento controlado enlazado al cargo                        |
| **FT-GTH-077 · FT-GTH-078**                           | Horas Extras, Permisos y Vacaciones                                         | C         | M12 · autoservicio                                                  |
| **RE-GTH-002 · RE-GTH-003**                           | Historia Laboral, Novedades de Nómina                                       | C         | M12 · historia laboral y novedades                                  |
| **CT-GTH-001 · CT-GTH-002 · AN-GTH-001**              | Contratos Laborales y Otrosí                                                | D         | M06 y M12 · plantillas con firma                                    |
| **FT-SST-001 a FT-SST-004**                           | Entrega de EPP, Designación, Investigación, Reporte                         | C / B     | M13 · registros; designación como formato con firma                 |
| **RE-SST-001 a RE-SST-007**                           | Peligros, Asistencia, Estándares, Actas, Perfil, Profesiograma, Convivencia | C / B     | M13 · registros; perfil sociodemográfico y convivencia restringidos |

Los documentos de tipo MN, PR, PL, PT, IN, MP, DC, PVE y el RIT-001 se tratan todos en la forma A. Cuando un formato pasa a la forma B o C, su ficha en el Listado Maestro conserva el código y registra «gestionado en ARZA ONE, módulo M…»; el archivo original queda como referencia de diseño y como contingencia para diligenciar a mano si la plataforma no está disponible.
