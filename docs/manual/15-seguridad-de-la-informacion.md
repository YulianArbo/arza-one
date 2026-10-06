# 15. Seguridad de la información

El objetivo es cumplir el nivel 2 del estándar OWASP ASVS, el adecuado para aplicaciones que manejan datos personales y transacciones de negocio. La seguridad se verifica con pruebas automáticas en cada cambio y con una revisión externa antes de la salida a producción.

## 15.1 Identidad y sesiones

| **Control**             | **Regla**                                                                                                                                                                                                                                                                         |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Alta de usuarios**    | Solo por invitación de un administrador, con enlace de un solo uso que vence en 72 horas. No existe registro abierto en la aplicación interna. Los usuarios del portal los crea ARZA TECH o el administrador del cliente.                                                         |
| **Contraseñas**         | Mínimo 12 caracteres, sin reglas de composición forzadas, verificadas contra una lista de contraseñas filtradas. Hash Argon2id con sal por usuario y parámetros recomendados por OWASP. Nunca se envían por correo.                                                               |
| **Segundo factor**      | Obligatorio para todos los usuarios internos y para los administradores de cliente; opcional y recomendado para los demás usuarios del portal. TOTP con diez códigos de recuperación de un solo uso.                                                                              |
| **Sesión**              | Identificador aleatorio de 256 bits en cookie HttpOnly, Secure, SameSite=Lax; en el servidor se guarda solo su hash. Vence a las 8 horas de inactividad y a las 12 horas en total para internos; 30 minutos de inactividad en acciones de alto riesgo, que piden reautenticación. |
| **Bloqueo**             | Retraso progresivo tras cada intento fallido y bloqueo de 15 minutos al quinto. El mensaje de error no revela si el correo existe.                                                                                                                                                |
| **Recuperación**        | Enlace de un solo uso de 30 minutos; al cambiar la contraseña se cierran todas las sesiones y se avisa al usuario.                                                                                                                                                                |
| **Retiro**              | El evento de retiro del colaborador desactiva la cuenta y revoca las sesiones el último día laborado, de forma automática.                                                                                                                                                        |
| **Cuentas de servicio** | Sin contraseña interactiva, con alcance mínimo, rotación semestral y registro de uso.                                                                                                                                                                                             |

## 15.2 Roles

Los roles del sistema se alinean con los cargos del organigrama DC-SGC-001. Un usuario puede tener varios roles; los permisos se suman. En la etapa de arranque el Director General concentra varios roles: la plataforma lo permite pero deja visible en el tablero de cumplimiento cada caso en que una misma persona solicita y aprueba.

| **Rol**              | **Cargos típicos**                      | **Alcance**                                                                                                           |
|----------------------|-----------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| **DIRECCION**        | Director General                        | Lectura transversal, aprobaciones de alto nivel, firma de contratos, tableros                                         |
| **ADMIN_PLATAFORMA** | Responsable técnico                     | Usuarios, roles, parámetros, flujos y catálogos. Sin acceso al contenido restringido por el solo hecho de administrar |
| **CALIDAD**          | Coordinador de Calidad e Innovación     | Control documental, riesgos, no conformidades, auditorías, indicadores                                                |
| **COMERCIAL**        | Gerente y analistas comerciales         | Leads, oportunidades, cotizaciones, clientes; contratos en borrador                                                   |
| **LIDER_TECNICO**    | Gerente de Desarrollo, líder técnico    | Todos los proyectos, liberaciones, incidentes                                                                         |
| **EQUIPO_PROYECTO**  | Desarrolladores, QA, diseñadores        | Solo los proyectos donde es miembro                                                                                   |
| **SERVICIO**         | Líder y técnicos de servicio al cliente | Tiquetes, PQRSF, encuestas, base de conocimiento                                                                      |
| **ADMIN_FINANCIERO** | Gerente administrativo, asistente       | Facturación, cartera, compras, activos, presupuesto, caja menor                                                       |
| **CONTADOR**         | Contador Público externo                | Lectura financiera, exportaciones contables, parámetros tributarios                                                   |
| **TALENTO_HUMANO**   | Coordinador de talento humano           | Colaboradores, selección, novedades, formación, disciplinarios                                                        |
| **SST**              | Líder de SST                            | Módulo de SST, incluidos los conceptos de aptitud; nunca diagnósticos                                                 |
| **OFICIAL_DATOS**    | Oficial de Protección de Datos          | Módulo de privacidad, consentimientos, solicitudes de titulares                                                       |
| **COLABORADOR**      | Todo colaborador                        | Sus tareas, sus solicitudes, sus datos, documentos vigentes de su proceso                                             |
| **AUDITOR**          | Auditor interno o externo               | Solo lectura de evidencias y auditoría, por tiempo limitado                                                           |
| **CLIENTE_ADMIN**    | Contacto principal del cliente          | Todo lo de su organización en el portal; gestiona sus usuarios                                                        |
| **CLIENTE_USUARIO**  | Otros usuarios del cliente              | Proyectos y tiquetes que se le asignen                                                                                |

## 15.3 Matriz de permisos por módulo

C: crear y editar. L: leer. A: aprobar o ejecutar transiciones críticas. P: solo lo propio o lo de sus proyectos. —: sin acceso. La matriz detallada por permiso (recurso y acción) está en el anexo G y se carga como dato semilla.

| **Módulo**                | **DIR** | **ADM** | **CAL** | **COM** | **TEC** | **EQP** | **SAC** | **FIN** | **CON** | **GTH** | **SST** | **DAT** | **COL** | **AUD** |
|---------------------------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
| **M00 Núcleo**            | L       | CA      | L       | L       | L       | L       | L       | L       | L       | L       | L       | L       | L       | L       |
| **M01 Identidad**         | L       | CA      | —       | —       | —       | —       | —       | —       | —       | —       | —       | —       | P       | L       |
| **M02 Terceros**          | L       | L       | L       | C       | L       | P       | C       | C       | L       | C       | —       | L       | —       | L       |
| **M03 Documental**        | LA      | L       | CA      | C       | C       | P       | C       | C       | L       | C       | C       | C       | P       | L       |
| **M04 Flujos y tareas**   | LA      | CA      | C       | P       | P       | P       | P       | P       | P       | P       | P       | P       | P       | L       |
| **M05 Comercial**         | LA      | —       | L       | CA      | L       | —       | L       | L       | —       | —       | —       | —       | —       | L       |
| **M06 Contratos y firma** | CA      | —       | L       | C       | L       | —       | L       | L       | L       | P       | —       | —       | P       | L       |
| **M07 Proyectos**         | L       | —       | L       | L       | CA      | P       | L       | L       | —       | —       | —       | —       | —       | L       |
| **M08 Servicio**          | L       | —       | L       | L       | C       | P       | CA      | —       | —       | —       | —       | —       | P       | L       |
| **M10 Finanzas**          | LA      | —       | —       | L       | —       | —       | —       | CA      | L       | —       | —       | —       | P       | L       |
| **M11 Compras y activos** | LA      | —       | L       | P       | P       | P       | P       | CA      | L       | P       | P       | —       | P       | L       |
| **M12 Talento humano**    | LA      | —       | —       | —       | —       | —       | —       | —       | —       | CA      | —       | —       | P       | L       |
| **M13 SST**               | L       | —       | L       | —       | —       | —       | —       | —       | —       | L       | CA      | —       | P       | L       |
| **M14 Calidad**           | LA      | —       | CA      | P       | P       | P       | P       | P       | —       | P       | P       | P       | P       | L       |
| **M15 Innovación**        | LA      | —       | CA      | P       | C       | P       | P       | —       | —       | —       | —       | —       | P       | L       |
| **M16 Tableros**          | L       | —       | L       | P       | P       | —       | P       | P       | P       | P       | P       | P       | —       | L       |
| **M17 Sitio y textos**    | LA      | C       | L       | C       | —       | —       | —       | —       | —       | —       | —       | CA      | —       | L       |
| **M18 Privacidad**        | LA      | —       | L       | —       | —       | —       | —       | —       | —       | —       | —       | CA      | P       | L       |
| **M19 Auditoría**         | L       | L       | L       | —       | —       | —       | —       | —       | —       | —       | —       | L       | —       | L       |

Siglas de columnas: DIR Dirección, ADM Administrador de plataforma, CAL Calidad, COM Comercial, TEC Líder técnico, EQP Equipo de proyecto, SAC Servicio, FIN Administrativo y financiero, CON Contador, GTH Talento humano, SST Seguridad y salud, DAT Oficial de datos, COL Colaborador, AUD Auditor. El portal M09 aplica a los roles de cliente y la IA M20 hereda los permisos del usuario que la usa.

## 15.4 Reglas de autorización por contexto (ABAC)

- Empresa: ningún usuario accede a registros de otra empresa; la base de datos lo impide con seguridad por fila y una prueba automática lo comprueba para cada recurso.

- Pertenencia: el equipo de proyecto solo ve los proyectos donde es miembro; el cliente solo ve registros de su organización marcados como visibles en el portal.

- Propiedad: un colaborador ve sus propias solicitudes, novedades, evaluaciones y documentos laborales; el jefe inmediato ve las de su equipo directo.

- Clasificación: los documentos restringidos exigen permiso nominal además del rol, y cada consulta queda registrada.

- Estado: un registro aprobado, firmado o cerrado no se edita; solo admite las transiciones previstas en su flujo.

- Segregación: quien crea una solicitud de compra, un pago, un cambio documental o un cambio de permisos no puede aprobarlo. Si la estructura de arranque lo hace inevitable, el sistema exige justificación y lo reporta en el tablero de cumplimiento.

- Datos de salud: el módulo de SST guarda el concepto de aptitud y las restricciones, no la historia clínica, que permanece en la institución prestadora (Resolución 2346 de 2007).

## 15.5 Modelo de amenazas y controles

| **Amenaza**                                                          | **Control en ARZA ONE**                                                                                                             | **Cómo se verifica**                                          |
|----------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------|
| **Acceso a registros ajenos cambiando el identificador (BOLA/IDOR)** | Autorización sobre el registro concreto en cada caso de uso; identificadores UUID; respuesta 404                                    | Prueba automática por recurso con dos usuarios y dos empresas |
| **Fuga entre empresas**                                              | tenant_id más seguridad por fila; contexto fijado por transacción                                                                   | Pruebas de aislamiento en la integración continua             |
| **Robo de credenciales y relleno de contraseñas**                    | Argon2id, segundo factor, límite de intentos, lista de contraseñas filtradas, alerta de inicio desde dispositivo nuevo              | Pruebas de autenticación; análisis dinámico                   |
| **Secuestro de sesión**                                              | Cookie HttpOnly, Secure, SameSite; rotación del identificador al autenticarse; cierre remoto de sesiones                            | Pruebas de extremo a extremo                                  |
| **Falsificación de peticiones (CSRF)**                               | Token antifalsificación y SameSite                                                                                                  | Prueba automática                                             |
| **Inyección de código en páginas (XSS)**                             | Escape por defecto de React, sanitización del texto enriquecido, política de seguridad de contenido estricta sin scripts en línea   | Semgrep y OWASP ZAP                                           |
| **Inyección SQL**                                                    | Consultas parametrizadas del ORM; prohibido SQL concatenado                                                                         | Semgrep; revisión                                             |
| **Carga de archivos maliciosos**                                     | Lista blanca de tipos por contenido real, límite de tamaño, antivirus, almacenamiento fuera del servidor web, descarga como adjunto | Pruebas con archivos de ensayo                                |
| **Peticiones del servidor hacia destinos internos (SSRF)**           | La aplicación no descarga direcciones entregadas por el usuario; lista blanca de salida para integraciones                          | Revisión y análisis dinámico                                  |
| **Exposición de datos en respuestas**                                | Serialización por lista blanca de campos según rol                                                                                  | Pruebas de contrato                                           |
| **Dependencias comprometidas**                                       | Archivo de bloqueo, análisis de vulnerabilidades, actualización controlada, inventario de componentes (SBOM) por versión            | osv-scanner y Trivy                                           |
| **Secretos filtrados**                                               | Variables de entorno, gitleaks antes de cada commit y en la integración continua, rotación                                          | gitleaks                                                      |
| **Secuestro de datos (ransomware) o pérdida del servidor**           | Copias cifradas fuera del servidor con retención inmutable; restauración ensayada                                                   | Ensayo mensual FT-TEC-005                                     |
| **Abuso de formularios públicos**                                    | Límite de peticiones, campo trampa, reto solo ante sospecha, validación estricta                                                    | Pruebas de carga ligera                                       |
| **Suplantación en la firma**                                         | Enlace único, código al correo, registro de evidencias, verificación pública del documento                                          | Pruebas del flujo de firma                                    |
| **Alteración de la auditoría**                                       | Tabla de solo inserción, cadena de hash, copia diaria del último hash fuera del servidor                                            | Verificación diaria de la cadena                              |
| **Abuso de privilegios de administración**                           | Separación entre administrar y leer contenido, segundo factor, alerta de cada cambio de permisos, revisión trimestral de accesos    | Informe trimestral                                            |
| **Manipulación de la IA con instrucciones ocultas**                  | Pasarela que aplica permisos antes de recuperar contenido, no ejecuta acciones sin confirmación humana y registra todo              | Pruebas específicas en F9                                     |

## 15.6 Cabeceras y configuración de seguridad

| **Cabecera o ajuste**         | **Valor**                                                                                                            |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------|
| **Strict-Transport-Security** | max-age=31536000; includeSubDomains; preload                                                                         |
| **Content-Security-Policy**   | default-src 'self'; sin 'unsafe-inline' en scripts; frame-ancestors 'none'; fuentes, imágenes y scripts solo propios |
| **X-Content-Type-Options**    | nosniff                                                                                                              |
| **Referrer-Policy**           | strict-origin-when-cross-origin                                                                                      |
| **Permissions-Policy**        | Cámara, micrófono y geolocalización deshabilitados                                                                   |
| **Cookies**                   | Secure, HttpOnly, SameSite=Lax, prefijo \_\_Host-                                                                    |
| **TLS**                       | Versión 1.2 o superior; certificados renovados automáticamente                                                       |
| **Caché**                     | no-store en toda respuesta con datos personales o de negocio                                                         |
| **Indexación**                | Aplicación, portal y API con noindex; solo el sitio público es indexable                                             |

## 15.7 Respuesta a incidentes

Los incidentes de seguridad se gestionan con PR-TEC-004 y PT-TEC-003 y se registran en el módulo de proyectos (incidentes) y, si comprometen datos personales, en el módulo de privacidad. La plataforma facilita la respuesta con: cierre inmediato de todas las sesiones de un usuario o de toda la empresa, bloqueo de cuentas, rotación de secretos por guion, exportación de la auditoría del periodo afectado y página de estado. Cuando el incidente afecta datos personales, el Oficial de Protección de Datos lo reporta a la Superintendencia de Industria y Comercio dentro de los quince días hábiles siguientes a su detección e informa a los titulares cuando corresponda.
