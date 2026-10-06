# 13. Diseño del backend

## 13.1 Recorrido de una petición

Toda petición a la API atraviesa la misma cadena, en este orden. Ningún módulo puede omitir un eslabón; la cadena se implementa una sola vez en la carpeta platform y se prueba de forma independiente.

| **Paso** | **Componente**               | **Qué hace**                                                                                    | **Si falla**                                            |
|----------|------------------------------|-------------------------------------------------------------------------------------------------|---------------------------------------------------------|
| **1**    | Proxy Caddy                  | Termina TLS, aplica cabeceras de seguridad y límite de tamaño                                   | Rechaza la conexión                                     |
| **2**    | Identificador de correlación | Asigna o propaga X-Correlation-Id para seguir la operación en los registros                     | —                                                       |
| **3**    | Límite de peticiones         | Cuenta por dirección IP y por usuario; más estricto en inicio de sesión y formularios públicos  | 429 Demasiadas peticiones                               |
| **4**    | Autenticación                | Valida la cookie de sesión contra iam_sessions y carga al usuario                               | 401 No autenticado                                      |
| **5**    | Protección CSRF              | Exige el token antifalsificación en toda operación que modifica datos                           | 403                                                     |
| **6**    | Contexto de empresa          | Fija la empresa del usuario en la transacción de base de datos (seguridad por fila)             | 403                                                     |
| **7**    | Validación                   | Compara parámetros y cuerpo contra el esquema Zod del contrato                                  | 422 con detalle por campo                               |
| **8**    | Autorización                 | Evalúa permiso del rol y condiciones sobre el registro concreto                                 | 403 Sin permiso (404 si el registro es de otra empresa) |
| **9**    | Idempotencia                 | En operaciones sensibles, si la llave Idempotency-Key ya se procesó devuelve la misma respuesta | 409 si el cuerpo difiere                                |
| **10**   | Caso de uso                  | Ejecuta la regla de negocio dentro de una transacción                                           | Error de dominio con código                             |
| **11**   | Auditoría y eventos          | Inserta el evento de auditoría y los eventos de dominio en la misma transacción                 | Se revierte todo                                        |
| **12**   | Respuesta                    | Serializa solo los campos que el rol puede ver                                                  | —                                                       |

## 13.2 Componentes transversales

| **Componente**               | **Especificación**                                                                                                                                                                                                                                                                             |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Configuración**            | Variables de entorno validadas al arrancar con un esquema; la aplicación no inicia si falta una o tiene formato inválido. Lista en el anexo F.                                                                                                                                                 |
| **Contexto de empresa**      | Cada transacción ejecuta SET LOCAL app.tenant_id y app.user_id. Los trabajos del worker reciben la empresa en la carga del trabajo y la fijan igual.                                                                                                                                           |
| **Consecutivos**             | Servicio único que entrega el siguiente código de negocio con bloqueo de fila; garantiza que no haya saltos ni duplicados. Formato PREFIJO-AAAA-NNNN configurable por tipo.                                                                                                                    |
| **Motor de flujos**          | Lee la definición vigente del flujo, valida que la transición exista, que el usuario tenga el permiso y que se cumpla la condición; registra el historial, crea las tareas del nuevo estado y calcula vencimientos en días hábiles.                                                            |
| **Tareas y aprobaciones**    | Bandeja «Mis tareas» única para todos los módulos. Admite aprobación secuencial o paralela, delegación temporal y escalamiento por vencimiento.                                                                                                                                                |
| **Notificaciones**           | Un evento produce avisos en la aplicación y, según preferencias, correo. Respeta el horario laboral y la desconexión: los avisos no urgentes a colaboradores fuera de jornada se entregan al inicio de la siguiente (PT-GTH-001).                                                              |
| **Archivos**                 | Carga en dos pasos: la API entrega un enlace temporal de subida; el worker analiza el archivo con el antivirus, calcula su huella SHA-256 y lo marca disponible. Tipos y tamaños permitidos por lista blanca. Descarga siempre por enlace temporal de cinco minutos tras verificar el permiso. |
| **Generación de documentos** | Plantillas HTML con la identidad institucional convertidas a PDF por Gotenberg; plantillas DOCX rellenadas con docxtemplater. Cada documento generado guarda la versión de la plantilla y los datos usados.                                                                                    |
| **Búsqueda**                 | Búsqueda de texto completo de PostgreSQL en español, sin tildes, sobre títulos, códigos y contenidos extraídos. Los resultados se filtran por los permisos del usuario antes de devolverse.                                                                                                    |
| **Días hábiles**             | Servicio de calendario con los festivos colombianos cargados cada año; usado para plazos de PQRSF, consultas de titulares y acuerdos de servicio.                                                                                                                                              |
| **Trabajos programados**     | Vencimientos de contratos, documentos y tareas; recordatorios; propuestas de disposición documental; cierre de sesiones inactivas; cálculo de indicadores; copias. Todos idempotentes y con registro de ejecución.                                                                             |
| **Bandeja de salida**        | Los eventos de dominio se guardan en core_outbox_events dentro de la transacción y el worker los publica; garantiza que ningún evento se pierda ni se emita sin que el dato exista.                                                                                                            |
| **Errores**                  | Formato único de respuesta de error (numeral 14.2). Los errores inesperados se registran con contexto en GlitchTip y devuelven un mensaje genérico con el identificador de correlación.                                                                                                        |
| **Exportaciones**            | Toda exportación a hoja de cálculo o PDF se ejecuta en segundo plano, queda registrada en aud_exports y excluye las columnas restringidas salvo permiso expreso.                                                                                                                               |

## 13.3 Eventos de dominio

| **Evento**                    | **Lo emite** | **Lo consumen**       | **Efecto**                                                                                         |
|-------------------------------|--------------|-----------------------|----------------------------------------------------------------------------------------------------|
| **lead.created**              | M05 · M17    | M04                   | Tarea de primer contacto al responsable comercial                                                  |
| **quote.accepted**            | M05          | M06                   | Propone crear el contrato con los datos de la cotización                                           |
| **contract.approved**         | M06          | M06 firma             | Habilita el envío a firma                                                                          |
| **envelope.completed**        | M06 firma    | M06 · M07 · M12 · M03 | Contrato vigente; propone crear el proyecto; archiva el documento firmado y su evidencia           |
| **project.created**           | M07          | M09 · M04             | Visible en el portal; tareas de arranque                                                           |
| **deliverable.accepted**      | M07          | M10 · M08             | Propone facturar el hito; inicia la garantía                                                       |
| **invoice.issued**            | M10          | M09 · M04             | Visible en el portal; aviso al cliente                                                             |
| **invoice.overdue**           | M10          | M04                   | Tarea de gestión de cobro dentro del horario legal de contacto                                     |
| **ticket.created**            | M08 · M09    | M04                   | Asignación y cálculo de vencimientos                                                               |
| **ticket.resolved**           | M08          | M08 encuestas         | Envía la encuesta de satisfacción                                                                  |
| **pqrsf.received**            | M08 · M17    | M04 · M14             | Radicado, acuse de recibo y plazo de respuesta                                                     |
| **document.version.approved** | M03          | M04                   | Publica la versión, retira la anterior y pide constancia de lectura                                |
| **nonconformity.created**     | M14 · otros  | M04                   | Tarea de análisis de causa al líder del proceso                                                    |
| **employee.hired**            | M12          | M01 · M13 · M11       | Crea la cuenta, las tareas de inducción, la evaluación médica de ingreso y la asignación de equipo |
| **employee.terminated**       | M12          | M01 · M11             | Revoca accesos el último día; tareas de devolución de activos                                      |
| **privacy.request.received**  | M18 · M17    | M04                   | Tarea al Oficial de Protección de Datos con el plazo legal                                         |
| **security.alert**            | M01 · M19    | M04                   | Aviso inmediato al responsable técnico y al Director General                                       |

Cada evento lleva identificador único, empresa, fecha, actor, versión del esquema y los datos mínimos. Los consumidores son idempotentes: procesar dos veces el mismo evento no produce un efecto duplicado.
